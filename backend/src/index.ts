import en from "./locales/en.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
import navigationConfig from "./config/navigation.json";
import { privacyPage, termsPage } from "./pages/legal";
import { authPage } from "./pages/auth";
import {
  type D1Database,
  PLAN_LIMITS, ANON_DAILY_LIMIT,
  getUser, upsertUser, setUserPlan, setUserPlanByStripeCustomer,
  getUserUsageToday, incrementUserUsage,
  getAnonUsageToday, incrementAnonUsage,
} from "./db";
import { extractUser } from "./auth";
import { createCheckoutSession, createPortalSession, verifyStripeWebhook } from "./stripe";

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
  DB: D1Database;
  CLERK_DOMAIN?: string;            // e.g. "your-app.clerk.accounts.dev"
  CLERK_PUBLISHABLE_KEY?: string;   // pk_live_... or pk_test_...
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_PRICE_ID?: string;
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

      // ── Clerk Frontend API proxy ──────────────────────────────────────────
      // Set proxy URL in Clerk Dashboard to:
      //   https://quizik-backend.zakhar-bybko.workers.dev/clerk-proxy
      if (url.pathname.startsWith("/clerk-proxy")) {
        const clerkFapiHost = "clerk.quizik-backend.zakhar-bybko.workers.dev";
        const clerkPath = url.pathname.replace("/clerk-proxy", "") || "/";
        const clerkUrl = `https://frontend-api.clerk.services${clerkPath}${url.search}`;

        const headers = new Headers();
        for (const [key, value] of request.headers.entries()) {
          const lower = key.toLowerCase();
          if (!["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cf-worker"].includes(lower)) {
            headers.set(key, value);
          }
        }
        headers.set("x-forwarded-host", clerkFapiHost);
        headers.set("x-forwarded-proto", "https");
        // Tell Clerk which instance via its custom header
        headers.set("x-clerk-fapi-host", clerkFapiHost);

        const proxyResp = await fetch(clerkUrl, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
          redirect: "follow",
        });

        const respHeaders = new Headers(proxyResp.headers);
        respHeaders.set("Access-Control-Allow-Origin", request.headers.get("origin") || "*");
        respHeaders.set("Access-Control-Allow-Credentials", "true");
        return new Response(proxyResp.body, {
          status: proxyResp.status,
          headers: respHeaders,
        });
      }

      if (request.method === "GET" && url.pathname === "/auth/sign-in-url") {
        const domain = env.CLERK_DOMAIN;
        if (!domain) return json(503, { ok: false, error: "Auth not configured." });
        const signInUrl = `https://accounts.${domain}/sign-in`;
        return json(200, { ok: true, result: { url: signInUrl } });
      }

      if (request.method === "GET" && url.pathname === "/auth") {
        const extId = url.searchParams.get("ext_id") || "";
        const isCallback = url.searchParams.get("clerk_redirect") === "1";
        const baseUrl = `${url.protocol}//${url.host}`;
        return authPage(env.CLERK_PUBLISHABLE_KEY, env.CLERK_DOMAIN, extId, baseUrl, isCallback);
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

      // ── Auth: sync user after Clerk sign-in ─────────────────────────────
      if (request.method === "POST" && url.pathname === "/auth/sync-user") {
        const clerkUser = await extractUser(request, env.CLERK_DOMAIN);
        if (!clerkUser) return json(401, { ok: false, error: "Invalid or missing token." });
        const user = await upsertUser(env.DB, clerkUser.userId, clerkUser.email);
        const usageToday = await getUserUsageToday(env.DB, user.id);
        return json(200, {
          ok: true,
          result: {
            id: user.id,
            email: user.email,
            plan: user.plan,
            usageToday,
            dailyLimit: PLAN_LIMITS[user.plan],
          },
        });
      }

      // ── User status (plan + usage) ────────────────────────────────────────
      if (request.method === "GET" && url.pathname === "/user/status") {
        const clerkUser = await extractUser(request, env.CLERK_DOMAIN);
        const deviceId = request.headers.get("X-Device-ID") || null;

        if (clerkUser) {
          const user = await getUser(env.DB, clerkUser.userId);
          if (!user) return json(404, { ok: false, error: "User not found." });
          const usageToday = await getUserUsageToday(env.DB, user.id);
          return json(200, {
            ok: true,
            result: { plan: user.plan, usageToday, dailyLimit: PLAN_LIMITS[user.plan] },
          });
        } else if (deviceId) {
          const usageToday = await getAnonUsageToday(env.DB, deviceId);
          return json(200, {
            ok: true,
            result: { plan: "anon", usageToday, dailyLimit: ANON_DAILY_LIMIT },
          });
        }
        return json(400, { ok: false, error: "Authentication or device ID required." });
      }

      // ── Stripe: create checkout session ───────────────────────────────────
      if (request.method === "POST" && url.pathname === "/stripe/checkout") {
        const clerkUser = await extractUser(request, env.CLERK_DOMAIN);
        if (!clerkUser) return json(401, { ok: false, error: "Sign in required." });
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRO_PRICE_ID) {
          return json(503, { ok: false, error: "Payments not configured." });
        }
        const user = await upsertUser(env.DB, clerkUser.userId, clerkUser.email);
        const session = await createCheckoutSession(
          env.STRIPE_SECRET_KEY,
          env.STRIPE_PRO_PRICE_ID,
          user.email,
          user.id
        );
        return json(200, { ok: true, result: session });
      }

      // ── Stripe: customer portal ───────────────────────────────────────────
      if (request.method === "POST" && url.pathname === "/stripe/portal") {
        const clerkUser = await extractUser(request, env.CLERK_DOMAIN);
        if (!clerkUser) return json(401, { ok: false, error: "Sign in required." });
        if (!env.STRIPE_SECRET_KEY) return json(503, { ok: false, error: "Payments not configured." });
        const user = await getUser(env.DB, clerkUser.userId);
        if (!user?.stripe_customer_id) return json(400, { ok: false, error: "No active subscription." });
        const portal = await createPortalSession(env.STRIPE_SECRET_KEY, user.stripe_customer_id);
        return json(200, { ok: true, result: portal });
      }

      // ── Stripe: webhook ───────────────────────────────────────────────────
      if (request.method === "POST" && url.pathname === "/stripe/webhook") {
        if (!env.STRIPE_WEBHOOK_SECRET) return json(400, { ok: false, error: "Not configured." });
        const sig = request.headers.get("stripe-signature") || "";
        const body = await request.text();
        const event = await verifyStripeWebhook(body, sig, env.STRIPE_WEBHOOK_SECRET);
        if (!event) return json(400, { ok: false, error: "Invalid webhook signature." });

        const eventType = event.type as string;
        const obj = (event.data as any)?.object as any;

        if (eventType === "checkout.session.completed") {
          const userId = obj?.metadata?.user_id as string;
          const customerId = obj?.customer as string;
          if (userId && customerId) {
            await setUserPlan(env.DB, userId, "pro", customerId);
          }
        } else if (eventType === "customer.subscription.deleted") {
          const customerId = obj?.customer as string;
          if (customerId) {
            await setUserPlanByStripeCustomer(env.DB, customerId, "free");
          }
        }

        return json(200, { ok: true });
      }

      // ── Payment success / cancel pages ────────────────────────────────────
      if (request.method === "GET" && url.pathname === "/payment/success") {
        return new Response(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h1>🎉 You're now on Pro!</h1>
          <p>Close this tab and enjoy Quizik.</p>
          </body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }
      if (request.method === "GET" && url.pathname === "/payment/cancel") {
        return new Response(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h1>Payment cancelled</h1>
          <p>You can upgrade anytime from the Quizik panel.</p>
          </body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      // ── AI hint (main endpoint) ───────────────────────────────────────────
      if (request.method === "POST" && url.pathname === "/ai/hint") {
        // Check per-IP legacy rate limit (anti-abuse, fast path)
        const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
        const rl = await checkRateLimit(env, ip);
        if (!rl.ok) {
          return json(429, { ok: false, error: "Too many requests. Try again in a minute." });
        }

        // Check user/device daily quota
        const clerkUser = await extractUser(request, env.CLERK_DOMAIN);
        const deviceId = request.headers.get("X-Device-ID") || null;

        if (clerkUser) {
          // Authenticated user
          const user = await upsertUser(env.DB, clerkUser.userId, clerkUser.email);
          const usageToday = await getUserUsageToday(env.DB, user.id);
          const limit = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
          if (usageToday >= limit) {
            return json(402, {
              ok: false,
              error: "limit_reached",
              plan: user.plan,
              usageToday,
              dailyLimit: limit,
            });
          }
          const payload = await readJsonBody(request);
          const result = await handleHintRequest(payload, env);
          await incrementUserUsage(env.DB, user.id);
          return json(200, {
            ok: true,
            result: {
              ...result,
              usage: { usageToday: usageToday + 1, dailyLimit: limit, plan: user.plan },
            },
          });
        } else if (deviceId) {
          // Anonymous device
          const usageToday = await getAnonUsageToday(env.DB, deviceId);
          if (usageToday >= ANON_DAILY_LIMIT) {
            return json(402, {
              ok: false,
              error: "limit_reached",
              plan: "anon",
              usageToday,
              dailyLimit: ANON_DAILY_LIMIT,
            });
          }
          const payload = await readJsonBody(request);
          const result = await handleHintRequest(payload, env);
          await incrementAnonUsage(env.DB, deviceId);
          return json(200, {
            ok: true,
            result: {
              ...result,
              usage: { usageToday: usageToday + 1, dailyLimit: ANON_DAILY_LIMIT, plan: "anon" },
            },
          });
        } else {
          // No auth and no device ID — reject
          return json(400, { ok: false, error: "X-Device-ID header required." });
        }
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
