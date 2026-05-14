import "./shared.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const {
  DEFAULT_MODEL,
  DEFAULT_ECONOMY_MODEL,
  DEFAULT_ECONOMY_MODE,
  DEFAULT_AUTO_APPLY_ALLOWED_URLS
} = globalThis.QuizStudyAssistantShared;
const transcriptionCache = new Map();

const SYSTEM_PROMPT = [
  "You are a study assistant for quizzes.",
  "Do not choose, reveal, rank, or label the correct answer.",
  "Do not tell the user which option to select.",
  "Explain the underlying concept and provide hints that help the user reason independently.",
  "If the question asks for a direct factual choice, explain the relevant definitions and distinctions without naming the option.",
  "Respond in the same language as the question when possible.",
  "Use exactly these sections: Что спрашивают, Как рассуждать, На что обратить внимание, Темы для повторения."
].join(" ");

const ANSWER_SYSTEM_PROMPT = [
  "You are a study assistant for quizzes.",
  "Return only the most likely answer.",
  "Do not explain, justify, add reasoning, add caveats, or include section headings.",
  "If the user explicitly asks for option numbers, return only the number or comma-separated numbers from the numbered option list.",
  "If answer options are visible, return the exact option text that best answers the question.",
  "If answer options are images or do not have useful text, return only the number of the best visible option from the numbered list.",
  "If the visible information is insufficient or ambiguous, infer the most likely intended context and still return only the most likely answer.",
  "Do not mention submitting forms, clicking controls, or interacting with the page.",
  "Respond in the same language as the question when possible."
].join(" ");

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) {
    return;
  }

  chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html?standalone=1&targetTabId=${tab.id}`),
    type: "popup",
    width: 430,
    height: 650,
    focused: true
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "QSA_GET_HINT") {
    handleHintRequest(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QSA_GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, result: settings }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  return false;
});

async function handleHintRequest(payload) {
  const normalized = normalizeQuestionPayload(payload);
  const mode = normalizeMode(payload?.mode);
  const economyMode = payload?.economyMode !== false;
  const preferOptionNumber = mode === "answer" && payload?.preferOptionNumber === true;
  const screenshotDataUrl = normalizeScreenshotDataUrl(payload?.screenshotDataUrl);
  if (!normalized.question && !screenshotDataUrl) {
    throw new Error("Не удалось найти видимый текст вопроса или скриншот страницы.");
  }

  const { apiKey, model } = await getPrivateSettings();
  if (!apiKey) {
    throw new Error("Добавьте OpenAI API-ключ в настройках расширения.");
  }

  const transcriptionResult = await transcribeAudioSources(normalized.audioSources, apiKey);
  normalized.audioTranscript = transcriptionResult.text;
  normalized.audioDiagnostics = transcriptionResult.diagnostics;

  const selectedModel = economyMode ? DEFAULT_ECONOMY_MODEL : model || DEFAULT_MODEL;
  const userContent = buildUserContent(normalized, mode, screenshotDataUrl, preferOptionNumber);
  const requestDiagnostics = buildRequestDiagnostics({
    payload: normalized,
    mode,
    economyMode,
    model: selectedModel,
    userContent,
    screenshotDataUrl
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: selectedModel,
      store: false,
      input: [
        { role: "system", content: mode === "answer" ? ANSWER_SYSTEM_PROMPT : SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      max_output_tokens: mode === "answer" ? 80 : economyMode ? 450 : 900
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API вернул ошибку ${response.status}.`;
    throw new Error(message);
  }

  const text = extractOutputText(data);
  if (!text) {
    throw new Error("OpenAI API не вернул текст подсказки.");
  }

  return {
    hint: text,
    detected: {
      subject: normalized.subject,
      optionCount: normalized.options.length,
      pageTitle: normalized.pageTitle,
      pageUrl: normalized.pageUrl,
      audioSourceCount: normalized.audioSources.length,
      hasAudioTranscript: Boolean(normalized.audioTranscript),
      audioDiagnostics: normalized.audioDiagnostics,
      hasScreenshot: Boolean(screenshotDataUrl),
      requestDiagnostics,
      usage: normalizeUsage(data?.usage)
    }
  };
}

async function getSettings() {
  const privateSettings = await getPrivateSettings();
  return {
    hasApiKey: Boolean(privateSettings.apiKey),
    model: privateSettings.model || DEFAULT_MODEL,
    economyModel: DEFAULT_ECONOMY_MODEL,
    economyMode: privateSettings.economyMode !== false,
    autoApplyAllowedUrls: privateSettings.autoApplyAllowedUrls || DEFAULT_AUTO_APPLY_ALLOWED_URLS
  };
}

async function getPrivateSettings() {
  return chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL,
    economyMode: DEFAULT_ECONOMY_MODE,
    autoApplyAllowedUrls: DEFAULT_AUTO_APPLY_ALLOWED_URLS
  });
}

function normalizeQuestionPayload(payload = {}) {
  const options = Array.isArray(payload.options)
    ? payload.options.map(cleanText).filter(Boolean).slice(0, 12)
    : [];
  const audioSources = Array.isArray(payload.audioSources)
    ? payload.audioSources.map(normalizeAudioSource).filter((source) => source.src).slice(0, 3)
    : [];

  return {
    subject: cleanText(payload.subject).slice(0, 200),
    question: cleanText(payload.question).slice(0, 6000),
    options,
    audioSources,
    audioTranscript: "",
    audioDiagnostics: null,
    pageTitle: cleanText(payload.pageTitle).slice(0, 200),
    pageUrl: typeof payload.pageUrl === "string" ? payload.pageUrl.slice(0, 500) : ""
  };
}

function normalizeAudioSource(value = {}) {
  return {
    src: typeof value.src === "string" ? value.src.slice(0, 1000) : "",
    type: cleanText(value.type).slice(0, 80),
    filename: cleanText(value.filename).slice(0, 160)
  };
}

function buildRequestDiagnostics({ payload, mode, economyMode, model, userContent, screenshotDataUrl }) {
  const promptText = userContent
    .filter((item) => item.type === "input_text")
    .map((item) => item.text || "")
    .join("\n");
  const promptChars = promptText.length;
  const screenshotBytes = estimateDataUrlBytes(screenshotDataUrl);
  return {
    mode,
    economyMode,
    model,
    promptChars,
    estimatedTextTokens: Math.ceil(promptChars / 4),
    hasScreenshot: Boolean(screenshotDataUrl),
    screenshotApproxBytes: screenshotBytes,
    includedHtml: false,
    audioSourceCount: payload.audioSources.length,
    hasAudioTranscript: Boolean(payload.audioTranscript),
    audioTranscriptChars: payload.audioTranscript.length,
    audioDiagnostics: payload.audioDiagnostics,
    questionChars: payload.question.length,
    optionCount: payload.options.length,
    optionChars: payload.options.join("\n").length
  };
}

async function transcribeAudioSources(audioSources, apiKey) {
  const diagnostics = {
    model: TRANSCRIPTION_MODEL,
    sources: audioSources,
    attempted: false,
    cacheHit: false,
    transcriptChars: 0,
    errors: []
  };

  if (!audioSources.length) {
    return { text: "", diagnostics };
  }

  diagnostics.attempted = true;
  const transcripts = [];

  for (const source of audioSources) {
    const cached = await getCachedTranscript(source.src);
    if (cached) {
      diagnostics.cacheHit = true;
      transcripts.push(cached);
      continue;
    }

    try {
      const transcript = await transcribeAudioSource(source, apiKey);
      if (transcript) {
        await setCachedTranscript(source.src, transcript);
        transcripts.push(transcript);
      }
    } catch (error) {
      diagnostics.errors.push({
        src: source.src,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const text = transcripts.map((transcript, index) => `Аудио ${index + 1}: ${transcript}`).join("\n\n");
  diagnostics.transcriptChars = text.length;
  return { text, diagnostics };
}

async function transcribeAudioSource(source, apiKey) {
  const audioResponse = await fetch(source.src, {
    credentials: "include",
    cache: "force-cache"
  });
  if (!audioResponse.ok) {
    throw new Error(`Не удалось скачать аудио: HTTP ${audioResponse.status}`);
  }

  const blob = await audioResponse.blob();
  if (!blob.size) {
    throw new Error("Аудиофайл пустой.");
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error(`Аудиофайл слишком большой: ${blob.size} байт.`);
  }

  const formData = new FormData();
  formData.append("model", TRANSCRIPTION_MODEL);
  formData.append("response_format", "json");
  formData.append("file", blob, source.filename || guessAudioFilename(source.src, blob.type));

  const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI transcription вернул ошибку ${response.status}.`);
  }

  return cleanText(data?.text || "");
}

async function getCachedTranscript(audioUrl) {
  if (transcriptionCache.has(audioUrl)) {
    return transcriptionCache.get(audioUrl);
  }

  const key = getTranscriptCacheKey(audioUrl);
  const cached = await chrome.storage.local.get({ [key]: "" });
  const transcript = cached[key] || "";
  if (transcript) {
    transcriptionCache.set(audioUrl, transcript);
  }
  return transcript;
}

async function setCachedTranscript(audioUrl, transcript) {
  transcriptionCache.set(audioUrl, transcript);
  await chrome.storage.local.set({ [getTranscriptCacheKey(audioUrl)]: transcript });
}

function getTranscriptCacheKey(audioUrl) {
  return `audioTranscript:${hashText(audioUrl)}`;
}

function guessAudioFilename(url, contentType = "") {
  try {
    const filename = new URL(url).pathname.split("/").pop();
    if (filename) {
      return filename;
    }
  } catch {
    // Fall through to content-type based name.
  }

  const extension = contentType.includes("wav") ? "wav" : contentType.includes("webm") ? "webm" : "mp3";
  return `audio.${extension}`;
}

function hashText(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl) {
    return 0;
  }

  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }

  return {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null
  };
}

function normalizeMode(value) {
  return value === "answer" ? "answer" : "hint";
}

function normalizeScreenshotDataUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) ? value : "";
}

function buildUserContent(payload, mode = "hint", screenshotDataUrl = "", preferOptionNumber = false) {
  const content = [
    {
      type: "input_text",
      text: buildUserPrompt(payload, mode, preferOptionNumber)
    }
  ];

  if (screenshotDataUrl) {
    content.push({
      type: "input_image",
      image_url: screenshotDataUrl
    });
  }

  return content;
}

function buildUserPrompt(payload, mode = "hint", preferOptionNumber = false) {
  const optionsText = payload.options.length
    ? payload.options.map((option, index) => `${index + 1}. ${option}`).join("\n")
    : "Варианты не обнаружены.";

  return [
    `Предмет: ${payload.subject || "не указан"}`,
    `Заголовок страницы: ${payload.pageTitle || "не указан"}`,
    "",
    "Вопрос:",
    payload.question,
    "",
    payload.audioTranscript ? `Аудио-транскрипт:\n${payload.audioTranscript}\n` : "",
    payload.audioDiagnostics?.errors?.length ? `Предупреждение: аудио найдено, но часть транскрипции не удалась: ${payload.audioDiagnostics.errors.map((item) => item.error).join("; ")}\n` : "",
    "Видимые варианты ответа:",
    optionsText,
    "",
    buildModeInstruction(mode, preferOptionNumber)
  ].join("\n");
}

function buildModeInstruction(mode, preferOptionNumber = false) {
  if (mode !== "answer") {
    return "Используй текст страницы и скриншот, если он приложен. Дай обучающую подсказку. Не называй правильный вариант, не выбирай номер ответа и не подсказывай действие отправки формы.";
  }

  if (preferOptionNumber) {
    return [
      "Используй текст страницы и скриншот, если он приложен.",
      "Тебе дан нумерованный список видимых вариантов ответа выше.",
      "Если на странице есть поле ввода без вариантов выбора, верни только значение, которое нужно вписать в поле.",
      "Если на странице есть несколько выпадающих списков, верни соответствия в формате список=вариант, например: 1=2,2=4,3=1.",
      "Для выпадающих списков номер до знака = это номер списка, номер после знака = это номер варианта внутри этого списка.",
      "Если на странице есть кастомные выпадающие списки с пропусками в тексте, выбирай только из перечисленных вариантов каждого списка и верни ответ для каждого списка, включая уже заполненные, в формате 1=номерВарианта,2=номерВарианта.",
      "Если на странице есть задание на сопоставление с левой группой 1,2,3 и правой группой A,B,C, верни пары в формате 1=A,2=B,3=C.",
      "Выбери самый вероятный правильный вариант или варианты и верни только номер или номера из этого списка.",
      "Если правильных вариантов несколько, верни номера через запятую, например: 1,3,4.",
      "Не возвращай текст ответа, формулу, URL картинки, пояснение, рассуждение, предупреждение или заголовок.",
      "Если варианты являются изображениями, сопоставь их по скриншоту и порядку в нумерованном списке.",
      "Если на странице чекбоксы или вопрос просит выбрать несколько ответов, можно вернуть несколько номеров.",
      "Если контекста недостаточно, всё равно выбери наиболее вероятный номер или номера."
    ].join(" ");
  }

  return "Используй текст страницы и скриншот, если он приложен. Верни только сам ответ. Если есть текстовые варианты ответа, верни точный текст самого вероятного правильного варианта. Если есть кастомные выпадающие списки с пропусками, выбирай только из перечисленных вариантов каждого списка и верни соответствия для каждого списка, включая уже заполненные, в формате 1=номерВарианта,2=номерВарианта. Если есть задание на сопоставление с группами 1,2,3 и A,B,C, верни пары в формате 1=A,2=B,3=C. Если варианты являются изображениями или не имеют полезного текста, верни только номер самого вероятного варианта из списка выше. Не добавляй объяснения, рассуждения, предупреждения или заголовки. Если контекста недостаточно, выбери наиболее вероятный ответ по своему предположению.";
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return "";
  }

  return data.output
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function toUserError(error) {
  return error instanceof Error ? error.message : "Неизвестная ошибка.";
}
