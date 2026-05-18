const DEFAULT_BACKEND_URL = "http://localhost:8787";

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
  const settings = await getPrivateSettings();
  const backendUrl = normalizeBackendUrl(settings.backendUrl);
  if (!backendUrl) {
    throw new Error("Добавьте адрес backend в настройках расширения.");
  }

  const requestPayload = normalizeHintPayload(payload);
  if (!requestPayload.question && !requestPayload.screenshotDataUrl) {
    throw new Error("Не удалось найти видимый текст вопроса или скриншот страницы.");
  }

  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.appSharedSecret) {
    headers.Authorization = `Bearer ${settings.appSharedSecret}`;
  }

  const response = await fetch(`${backendUrl}/ai/hint`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestPayload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || `Backend вернул ошибку ${response.status}.`;
    throw new Error(message);
  }

  if (!data?.result?.hint) {
    throw new Error("Backend не вернул текст подсказки.");
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
