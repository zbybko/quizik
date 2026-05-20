import en from "./locales/en.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
import navigationConfig from "./config/navigation.json";
import { privacyPage, termsPage } from "./pages/legal";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const SUPPORTED_LOCALES = ["en", "es", "zh", "hi", "ar", "ru", "uk"] as const;
const DEFAULT_LOCALE = "en";

type LocaleTree = Record<string, unknown>;
const LOCALES: Record<string, LocaleTree> = { en, es, zh, hi, ar, ru, uk };

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  APP_SHARED_SECRET?: string;
  RATELIMIT_KV: KVNamespace;
}

// Per-IP, per-minute counter. Eventually consistent across CF edge nodes,
// so bursts may briefly exceed the limit — acceptable for MVP abuse control.
const RATE_LIMIT_REQUESTS = 10;       // per window
const RATE_LIMIT_WINDOW_SEC = 60;     // window length
const RATE_LIMIT_TTL_SEC = 120;       // KV entry TTL (2× window for safety)

async function checkRateLimit(env: Env, ip: string): Promise<{ ok: boolean; remaining: number }> {
  const bucket = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SEC);
  const key = `rl:${ip}:${bucket}`;
  const current = parseInt((await env.RATELIMIT_KV.get(key)) || "0", 10);
  if (current >= RATE_LIMIT_REQUESTS) {
    return { ok: false, remaining: 0 };
  }
  // Best-effort write; if it races, worst case is the IP gets one extra request.
  await env.RATELIMIT_KV.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_TTL_SEC });
  return { ok: true, remaining: RATE_LIMIT_REQUESTS - current - 1 };
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return json(200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/privacy") {
        return privacyPage();
      }
      if (request.method === "GET" && url.pathname === "/terms") {
        return termsPage();
      }

      if (request.method === "GET" && url.pathname === "/i18n/locales") {
        return json(200, { ok: true, result: { locales: SUPPORTED_LOCALES, default: DEFAULT_LOCALE } });
      }

      const i18nMatch = url.pathname.match(/^\/i18n\/([a-zA-Z-]{2,10})$/);
      if (request.method === "GET" && i18nMatch) {
        const requested = i18nMatch[1]?.toLowerCase() ?? DEFAULT_LOCALE;
        const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requested) ? requested : DEFAULT_LOCALE;
        return json(200, { ok: true, result: { locale, tree: LOCALES[locale] } });
      }

      if (request.method === "GET" && url.pathname === "/config/navigation") {
        return json(200, { ok: true, result: navigationConfig });
      }

      if (request.method === "POST" && url.pathname === "/ai/hint") {
        const authError = requireAppAuth(request, env);
        if (authError) return authError;

        // Per-IP rate limit.
        const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
        const rl = await checkRateLimit(env, ip);
        if (!rl.ok) {
          return json(429, {
            ok: false,
            error: "Too many requests. Try again in a minute."
          });
        }

        const payload = await readJsonBody(request);
        const result = await handleHintRequest(payload, env);
        return json(200, { ok: true, result });
      }

      return json(404, { ok: false, error: "Route not found." });
    } catch (error) {
      const status = isHttpError(error) ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown server error.";
      return json(status, { ok: false, error: message });
    }
  }
};

interface HttpError extends Error { status: number }
function httpError(status: number, message: string): HttpError {
  const e = new Error(message) as HttpError;
  e.status = status;
  return e;
}
function isHttpError(e: unknown): e is HttpError {
  return e instanceof Error && Number.isInteger((e as HttpError).status);
}

function corsHeaders(): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function json(status: number, body: unknown): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function requireAppAuth(request: Request, env: Env): Response | null {
  const secret = env.APP_SHARED_SECRET || "";
  if (!secret) return null;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token !== secret) {
    return json(401, { ok: false, error: "Unauthorized." });
  }
  return null;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

// ---- AI handler ------------------------------------------------------------

interface HintPayload {
  mode?: string;
  screenshotDataUrl?: string;
  history?: { role?: string; text?: string }[];
  userText?: string;
  subject?: string;
  question?: string;
  options?: string[];
  pageTitle?: string;
  pageUrl?: string;
}

async function handleHintRequest(payload: HintPayload, env: Env) {
  if (!env.OPENAI_API_KEY) {
    throw httpError(500, "OPENAI_API_KEY is not configured.");
  }

  const normalized = normalizeQuestionPayload(payload);
  const mode = normalizeMode(payload.mode);
  const screenshotDataUrl = normalizeScreenshotDataUrl(payload.screenshotDataUrl);
  const history = normalizeHistory(payload.history);
  const userText = cleanText(payload.userText).slice(0, 4000);

  if (!normalized.question && !screenshotDataUrl && !userText && history.length === 0) {
    throw httpError(400, "Visible quiz text, a screenshot, or chat input is required.");
  }

  const systemPrompt = pickSystemPrompt(mode);
  const input: unknown[] = [{ role: "system", content: systemPrompt }];

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
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      input,
      max_output_tokens: mode === "answer" ? 200 : 1200
    })
  });

  const data: any = await openAiResponse.json().catch(() => ({}));
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

function pickSystemPrompt(mode: string) {
  if (mode === "answer") return ANSWER_SYSTEM_PROMPT;
  if (mode === "chat") return CHAT_SYSTEM_PROMPT;
  return SYSTEM_PROMPT;
}

function normalizeMode(value: unknown) {
  if (value === "answer") return "answer";
  if (value === "chat") return "chat";
  return "hint";
}

function normalizeScreenshotDataUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) ? value : "";
}

function normalizeQuestionPayload(payload: HintPayload) {
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

function normalizeHistory(history: unknown) {
  if (!Array.isArray(history)) return [] as { role: "user" | "assistant"; text: string }[];
  return history
    .map((entry: any) => ({
      role: entry?.role === "assistant" ? "assistant" as const : "user" as const,
      text: cleanText(entry?.text || "").slice(0, 4000)
    }))
    .filter((entry) => entry.text)
    .slice(-20);
}

interface NormalizedPayload {
  subject: string;
  question: string;
  options: string[];
  pageTitle: string;
  pageUrl: string;
}

function buildUserContent(payload: NormalizedPayload, mode: string, screenshotDataUrl: string, userText: string) {
  const content: unknown[] = [{ type: "input_text", text: buildUserPrompt(payload, mode, userText) }];
  if (screenshotDataUrl) {
    content.push({ type: "input_image", image_url: screenshotDataUrl });
  }
  return content;
}

function buildUserPrompt(payload: NormalizedPayload, mode: string, userText: string) {
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

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  return data.output
    .flatMap((item: any) => (Array.isArray(item.content) ? item.content : []))
    .map((content: any) => content.text || "")
    .join("\n")
    .trim();
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").replace(/ /g, " ").trim();
}
