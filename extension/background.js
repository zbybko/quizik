const DEFAULT_BACKEND_URL = "https://quizik-backend.zakhar-bybko.workers.dev";
const NAV_CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000; // 6h

chrome.runtime.onInstalled.addListener(() => { void refreshNavigationConfig(); });
chrome.runtime.onStartup?.addListener(() => { void refreshNavigationConfig(); });

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function getOrCreateDeviceId() {
  const stored = await chrome.storage.local.get({ deviceId: "" });
  if (stored.deviceId) return stored.deviceId;
  const id = "dev_" + crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

async function getAuthHeaders() {
  const stored = await chrome.storage.local.get({ authToken: "", deviceId: "" });
  const deviceId = stored.deviceId || (await getOrCreateDeviceId());
  const headers = { "X-Device-ID": deviceId };
  if (stored.authToken) headers["Authorization"] = `Bearer ${stored.authToken}`;
  return headers;
}

// Receive JWT token from Clerk auth page
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === "QUIZIK_AUTH_TOKEN" && message.token) {
    chrome.storage.local.set({
      authToken: message.token,
      authEmail: message.email || "",
      authPlan: "free",
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "QSA_GET_AUTH_STATUS") {
    chrome.storage.local.get({ authToken: "", authEmail: "", authPlan: "anon", deviceId: "" })
      .then(async (stored) => {
        const deviceId = stored.deviceId || await getOrCreateDeviceId();
        sendResponse({
          ok: true,
          result: {
            isSignedIn: Boolean(stored.authToken),
            email: stored.authEmail,
            plan: stored.authToken ? (stored.authPlan || "free") : "anon",
            deviceId,
          }
        });
      })
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QUIZIK_AUTH_TOKEN_FROM_CLERK") {
    // Received from clerk-auth.js content script
    chrome.storage.local.set({
      authToken: message.token,
      authEmail: message.email || "",
      authPlan: "free",
    }).then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QSA_SIGN_OUT") {
    chrome.storage.local.remove(["authToken", "authEmail", "authPlan"])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QSA_GET_HINT") {
    handleHintRequest(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error), diagnostics: toErrorDiagnostics(error) }));
    return true;
  }

  if (message?.type === "QSA_GET_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, result: settings }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QSA_GET_LOCALE") {
    handleLocaleRequest(message.payload?.locale)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  if (message?.type === "QSA_GET_NAVIGATION_CONFIG") {
    // Content script asks for markers; we may also opportunistically refresh.
    getNavigationConfig()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: toUserError(error) }));
    return true;
  }

  return false;
});

async function refreshNavigationConfig() {
  try {
    const settings = await getPrivateSettings();
    const backendUrl = normalizeBackendUrl(settings.backendUrl);
    if (!backendUrl) return; // no backend configured yet — content.js will use bundled fallback
    const response = await fetch(`${backendUrl}/config/navigation`);
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.result) {
      await chrome.storage.local.set({
        navigationConfig: data.result,
        navigationConfigFetchedAt: Date.now()
      });
    }
  } catch (error) {
    console.warn("[QSA] navigation config refresh failed:", error?.message || error);
  }
}

async function getNavigationConfig() {
  const stored = await chrome.storage.local.get({
    navigationConfig: null,
    navigationConfigFetchedAt: 0
  });
  const isStale = Date.now() - (stored.navigationConfigFetchedAt || 0) > NAV_CONFIG_REFRESH_MS;
  if (isStale || !stored.navigationConfig) {
    void refreshNavigationConfig(); // fire-and-forget; return cached even while refreshing
  }
  return stored.navigationConfig || null;
}

async function handleLocaleRequest(rawLocale) {
  const locale = String(rawLocale || "en").toLowerCase().slice(0, 10);
  const settings = await getPrivateSettings();
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  if (!backendUrl) throw new Error("Backend URL is not configured.");

  const response = await fetch(`${backendUrl}/i18n/${encodeURIComponent(locale)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.result?.tree) {
    throw new Error(data?.error || `Locale fetch returned ${response.status}.`);
  }
  return data.result; // { locale, tree }
}

async function handleHintRequest(payload) {
  const settings = await getPrivateSettings();
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  if (!backendUrl) {
    throw new Error("Добавьте адрес backend в настройках расширения.");
  }

  const requestPayload = normalizeHintPayload(payload);
  if (!requestPayload.question && !requestPayload.screenshotDataUrl) {
    throw new Error("Не удалось найти видимый текст вопроса или скриншот страницы.");
  }

  const authHeaders = await getAuthHeaders();
  const headers = { "Content-Type": "application/json", ...authHeaders };

  const response = await fetch(`${backendUrl}/ai/hint`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload)
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 402) {
    const usageStatus = {
      plan: data.plan || "anon",
      usageToday: data.usageToday,
      dailyLimit: data.dailyLimit,
    };
    await chrome.storage.local.set({ usageStatus });
    const err = Object.assign(new Error("limit_reached"), {
      code: "limit_reached",
      ...usageStatus,
    });
    throw err;
  }

  if (!response.ok) {
    const message = data?.error || `Backend вернул ошибку ${response.status}.`;
    throw new Error(message);
  }

  if (!data?.result?.hint) {
    throw new Error("Backend не вернул текст подсказки.");
  }

  if (data.result?.usage) {
    await chrome.storage.local.set({ usageStatus: data.result.usage });
  }

  return data.result;
}

async function getSettings() {
  const privateSettings = await getPrivateSettings();
  return {
    backendUrl: normalizeBackendUrl(privateSettings.backendUrl),
    hasSharedSecret: Boolean(privateSettings.appSharedSecret)
  };
}

async function getPrivateSettings() {
  return chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    appSharedSecret: ""
  });
}

function normalizeHintPayload(payload = {}) {
  const options = Array.isArray(payload.options)
    ? payload.options.map(cleanText).filter(Boolean).slice(0, 12)
    : [];

  const history = Array.isArray(payload.history)
    ? payload.history
        .map((entry) => ({
          role: entry?.role === "assistant" ? "assistant" : "user",
          text: cleanText(entry?.text || "").slice(0, 4000)
        }))
        .filter((entry) => entry.text)
        .slice(-20)
    : [];

  return {
    subject: cleanText(payload.subject).slice(0, 200),
    question: cleanText(payload.question).slice(0, 6000),
    options,
    pageTitle: cleanText(payload.pageTitle).slice(0, 200),
    pageUrl: typeof payload.pageUrl === "string" ? payload.pageUrl.slice(0, 500) : "",
    mode: normalizeMode(payload.mode),
    screenshotDataUrl: normalizeScreenshotDataUrl(payload.screenshotDataUrl),
    history,
    userText: cleanText(payload.userText || "").slice(0, 4000)
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

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
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

function toErrorDiagnostics(error) {
  if (!error || typeof error !== "object") return null;
  const err = error;
  return {
    code: err.code,
    plan: err.plan,
    usageToday: err.usageToday,
    dailyLimit: err.dailyLimit,
  };
}
