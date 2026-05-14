const form = document.getElementById("settingsForm");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const economyModeInput = document.getElementById("economyMode");
const autoApplyAllowedUrlsInput = document.getElementById("autoApplyAllowedUrls");
const statusElement = document.getElementById("status");
const {
  DEFAULT_MODEL,
  DEFAULT_ECONOMY_MODEL,
  DEFAULT_ECONOMY_MODE,
  DEFAULT_AUTO_APPLY_ALLOWED_URLS,
  normalizeAllowedUrls
} = window.QuizStudyAssistantShared;

document.addEventListener("DOMContentLoaded", loadSettings);
form.addEventListener("submit", saveSettings);

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL,
    economyMode: DEFAULT_ECONOMY_MODE,
    autoApplyAllowedUrls: DEFAULT_AUTO_APPLY_ALLOWED_URLS
  });

  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  economyModeInput.checked = settings.economyMode !== false;
  autoApplyAllowedUrlsInput.value = settings.autoApplyAllowedUrls;
}

async function saveSettings(event) {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_MODEL;
  const economyMode = economyModeInput.checked;
  const autoApplyAllowedUrls = normalizeAllowedUrls(autoApplyAllowedUrlsInput.value);

  await chrome.storage.local.set({ apiKey, model, economyMode, autoApplyAllowedUrls });
  statusElement.textContent = economyMode
    ? `Настройки сохранены. Экономный режим использует ${DEFAULT_ECONOMY_MODEL}.`
    : "Настройки сохранены.";
}
