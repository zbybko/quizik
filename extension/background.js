const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

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
  "If answer options are visible, return the exact option text that best answers the question.",
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
  const screenshotDataUrl = normalizeScreenshotDataUrl(payload?.screenshotDataUrl);
  if (!normalized.question && !screenshotDataUrl) {
    throw new Error("Не удалось найти видимый текст вопроса или скриншот страницы.");
  }

  const { apiKey, model } = await getPrivateSettings();
  if (!apiKey) {
    throw new Error("Добавьте OpenAI API-ключ в настройках расширения.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      input: [
        { role: "system", content: mode === "answer" ? ANSWER_SYSTEM_PROMPT : SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(normalized, mode, screenshotDataUrl) }
      ],
      max_output_tokens: 900
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
      hasScreenshot: Boolean(screenshotDataUrl)
    }
  };
}

async function getSettings() {
  const privateSettings = await getPrivateSettings();
  return {
    hasApiKey: Boolean(privateSettings.apiKey),
    model: privateSettings.model || DEFAULT_MODEL
  };
}

async function getPrivateSettings() {
  return chrome.storage.local.get({ apiKey: "", model: DEFAULT_MODEL });
}

function normalizeQuestionPayload(payload = {}) {
  const options = Array.isArray(payload.options)
    ? payload.options.map(cleanText).filter(Boolean).slice(0, 12)
    : [];

  return {
    subject: cleanText(payload.subject).slice(0, 200),
    question: cleanText(payload.question).slice(0, 6000),
    options,
    pageTitle: cleanText(payload.pageTitle).slice(0, 200),
    pageUrl: typeof payload.pageUrl === "string" ? payload.pageUrl.slice(0, 500) : ""
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

function buildUserContent(payload, mode = "hint", screenshotDataUrl = "") {
  const content = [
    {
      type: "input_text",
      text: buildUserPrompt(payload, mode, Boolean(screenshotDataUrl))
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

function buildUserPrompt(payload, mode = "hint") {
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
    "Видимые варианты ответа:",
    optionsText,
    "",
    mode === "answer"
      ? "Используй текст страницы и скриншот, если он приложен. Верни только сам ответ. Если есть варианты ответа, верни точный текст самого вероятного правильного варианта. Не добавляй объяснения, рассуждения, предупреждения или заголовки. Если контекста недостаточно, выбери наиболее вероятный ответ по своему предположению."
      : "Используй текст страницы и скриншот, если он приложен. Дай обучающую подсказку. Не называй правильный вариант, не выбирай номер ответа и не подсказывай действие отправки формы."
  ].join("\n");
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
