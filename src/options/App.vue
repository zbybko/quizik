<template>
  <main class="settings">
    <header class="settings-header">
      <img class="app-icon" :src="iconUrl" alt="">
      <h1>Настройки</h1>
    </header>

    <form @submit.prevent="saveSettings">
      <label>
        Backend URL
        <input v-model.trim="backendUrl" name="backendUrl" type="url" autocomplete="off" placeholder="http://localhost:8787">
      </label>
      <label>
        APP_SHARED_SECRET
        <input v-model.trim="appSharedSecret" name="appSharedSecret" type="password" autocomplete="off" placeholder="change-me">
      </label>
      <button type="submit">Сохранить</button>
    </form>

    <p class="status" role="status">{{ status }}</p>
    <p class="note">
      Расширение отправляет вопрос и скриншот на ваш backend. OpenAI API-ключ хранится только на backend в переменной окружения.
    </p>
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";

const DEFAULT_BACKEND_URL = "http://localhost:8787";
const backendUrl = ref(DEFAULT_BACKEND_URL);
const appSharedSecret = ref("");
const status = ref("");
const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

onMounted(loadSettings);

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    appSharedSecret: ""
  });

  backendUrl.value = settings.backendUrl;
  appSharedSecret.value = settings.appSharedSecret;
}

async function saveSettings() {
  await chrome.storage.local.set({
    backendUrl: normalizeBackendUrl(backendUrl.value),
    appSharedSecret: appSharedSecret.value
  });
  status.value = "Настройки сохранены.";
}

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}
</script>
