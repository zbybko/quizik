import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFileWithOverride(path.join(__dirname, ".env"));

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const PORT = Number(process.env.PORT || 8787);
const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET || "";

// i18n config
const LOCALE_WORKER_URL = (process.env.LOCALE_WORKER_URL || "").trim().replace(/\/+$/, "");
const LOCALE_CACHE_TTL_MS = Number(process.env.LOCALE_CACHE_TTL_MS || 5 * 60 * 1000); // 5 min
const SUPPORTED_LOCALES = ["en", "es", "zh", "hi", "ar"];
const DEFAULT_LOCALE = "en";
const LOCALES_DIR = path.join(__dirname, "locales");
const localeCache = new Map(); // locale -> { tree, fetchedAt }

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

const CHAT_SYSTEM_PROMPT = [
  "You are a study assistant for quizzes.",
  "The user can see a quiz page; its current question, options, and a screenshot may be attached as the latest user message.",
  "You can discuss the question, explain concepts, compare options, and answer follow-up questions.",
  "Be concise by default but go deep when the user asks for details.",
  "Respond in the same language as the user when possible."
].join(" ");

const server = http.createServer(async (request, response) => {
  try {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/i18n/locales") {
      sendJson(response, 200, { ok: true, result: { locales: SUPPORTED_LOCALES, default: DEFAULT_LOCALE } });
      return;
    }

    const i18nMatch = request.method === "GET" && url.pathname.match(/^\/i18n\/([a-zA-Z-]{2,10})$/);
    if (i18nMatch) {
      const tree = await getLocaleTree(i18nMatch[1]);
      sendJson(response, 200, { ok: true, result: { locale: tree.locale, tree: tree.tree } });
      return;
    }

    if (request.method === "POST" && url.pathname === "/ai/hint") {
      await requireAppAuth(request);
      const payload = await readJson(request);
      const result = await handleHintRequest(payload);
      sendJson(response, 200, { ok: true, result });
      return;
    }

    sendJson(response, 404, { ok: false, error: "Route not found." });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    sendJson(response, status, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error."
    });
  }
});

server.listen(PORT, () => {
  console.log(`Quiz Study Assistant backend listening on http://localhost:${PORT}`);
});

async function handleHintRequest(payload) {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw httpError(500, "OPENAI_API_KEY is not configured.");
  }

  const normalized = normalizeQuestionPayload(payload);
  const mode = normalizeMode(payload?.mode);
  const screenshotDataUrl = normalizeScreenshotDataUrl(payload?.screenshotDataUrl);
  const history = normalizeHistory(payload?.history);
  const userText = cleanText(payload?.userText).slice(0, 4000);

  if (!normalized.question && !screenshotDataUrl && !userText && history.length === 0) {
    throw httpError(400, "Visible quiz text, a screenshot, or chat input is required.");
  }

  const systemPrompt = pickSystemPrompt(mode);
  const input = [{ role: "system", content: systemPrompt }];

  for (const entry of history) {
    input.push({
      role: entry.role,
      content: [{ type: entry.role === "assistant" ? "output_text" : "input_text", text: entry.text }]
    });
  }

  input.push({
    role: "user",
    content: buildUserContent(normalized, mode, screenshotDataUrl, userText)
  });

  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      input,
      max_output_tokens: mode === "answer" ? 200 : 1200
    })
  });

  const data = await openAiResponse.json().catch(() => ({}));
  if (!openAiResponse.ok) {
    throw httpError(
      openAiResponse.status,
      data?.error?.message || `OpenAI API returned status ${openAiResponse.status}.`
    );
  }

  const text = extractOutputText(data);
  if (!text) {
    throw httpError(502, "OpenAI API did not return any text.");
  }

  return {
    hint: text,
    detected: {
      subject: normalized.subject,
      optionCount: normalized.options.length,
      pageTitle: normalized.pageTitle,
      pageUrl: normalized.pageUrl,
      hasScreenshot: Boolean(screenshotDataUrl),
      mode,
      historyLength: history.length
    }
  };
}

function pickSystemPrompt(mode) {
  if (mode === "answer") return ANSWER_SYSTEM_PROMPT;
  if (mode === "chat") return CHAT_SYSTEM_PROMPT;
  return SYSTEM_PROMPT;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      text: cleanText(entry?.text || "").slice(0, 4000)
    }))
    .filter((entry) => entry.text)
    .slice(-20);
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
  if (value === "answer") return "answer";
  if (value === "chat") return "chat";
  return "hint";
}

function normalizeScreenshotDataUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) ? value : "";
}

function buildUserContent(payload, mode = "hint", screenshotDataUrl = "", userText = "") {
  const content = [
    {
      type: "input_text",
      text: buildUserPrompt(payload, mode, userText)
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

function buildUserPrompt(payload, mode = "hint", userText = "") {
  const optionsText = payload.options.length
    ? payload.options.map((option, index) => `${index + 1}. ${option}`).join("\n")
    : "Варианты не обнаружены.";

  const contextBlock = [
    `Предмет: ${payload.subject || "не указан"}`,
    `Заголовок страницы: ${payload.pageTitle || "не указан"}`,
    "",
    "Вопрос:",
    payload.question || "(не извлечён)",
    "",
    "Видимые варианты ответа:",
    optionsText
  ].join("\n");

  const instruction = mode === "answer"
    ? "Используй текст страницы и скриншот, если он приложен. Верни только сам ответ. Если есть варианты ответа, верни точный текст самого вероятного правильного варианта. Не добавляй объяснения, рассуждения, предупреждения или заголовки. Если контекста недостаточно, выбери наиболее вероятный ответ по своему предположению."
    : mode === "chat"
      ? "Ответь пользователю по сути его сообщения, используя контекст вопроса и скриншот при необходимости."
      : "Используй текст страницы и скриншот, если он приложен. Дай обучающую подсказку. Не называй правильный вариант, не выбирай номер ответа и не подсказывай действие отправки формы.";

  const parts = [contextBlock, ""];
  if (userText) {
    parts.push("Сообщение пользователя:", userText, "");
  }
  parts.push(instruction);
  return parts.join("\n");
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

async function requireAppAuth(request) {
  if (!APP_SHARED_SECRET) {
    return;
  }

  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (token !== APP_SHARED_SECRET) {
    throw httpError(401, "Unauthorized.");
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_JSON_BYTES) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Max-Age", "86400");
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Resolve a locale tree.
 * - If LOCALE_WORKER_URL is set, fetches `${LOCALE_WORKER_URL}/${locale}.json` (POEditor-style worker).
 * - Otherwise reads `backend/locales/${locale}.json` from disk.
 * - Caches each locale in memory for LOCALE_CACHE_TTL_MS.
 * - Falls back to DEFAULT_LOCALE on miss; throws 404 only if even default is unavailable.
 */
async function getLocaleTree(requestedLocale) {
  const locale = SUPPORTED_LOCALES.includes(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const cached = localeCache.get(locale);
  if (cached && Date.now() - cached.fetchedAt < LOCALE_CACHE_TTL_MS) {
    return { locale, tree: cached.tree };
  }

  let tree;
  try {
    if (LOCALE_WORKER_URL) {
      const res = await fetch(`${LOCALE_WORKER_URL}/${locale}.json`);
      if (!res.ok) throw new Error(`worker returned ${res.status}`);
      tree = await res.json();
    } else {
      const filePath = path.join(LOCALES_DIR, `${locale}.json`);
      const raw = await fs.promises.readFile(filePath, "utf8");
      tree = JSON.parse(raw);
    }
  } catch (error) {
    if (locale !== DEFAULT_LOCALE) {
      return getLocaleTree(DEFAULT_LOCALE);
    }
    throw httpError(404, `Locale ${locale} not available: ${error.message}`);
  }

  localeCache.set(locale, { tree, fetchedAt: Date.now() });
  return { locale, tree };
}

function loadEnvFileWithOverride(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const value = match[2].replace(/^["']|["']$/g, "");
    process.env[match[1]] = value;
  }
}
