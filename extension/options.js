const form = document.getElementById("settingsForm");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const statusElement = document.getElementById("status");
const DEFAULT_MODEL = "gpt-5.5";

document.addEventListener("DOMContentLoaded", loadSettings);
form.addEventListener("submit", saveSettings);

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    apiKey: "",
    model: DEFAULT_MODEL
  });

  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
}

async function saveSettings(event) {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_MODEL;

  await chrome.storage.local.set({ apiKey, model });
  statusElement.textContent = "Настройки сохранены.";
}
