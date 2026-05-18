<template>
  <main class="popup">
    <header class="header">
      <div class="brand">
        <img class="app-icon" :src="iconUrl" alt="">
        <div class="brand-text">
          <h1>Quiz Study Assistant</h1>
          <p class="status">{{ status }}</p>
        </div>
      </div>
      <button class="icon-button" type="button" title="Настройки" aria-label="Настройки" @click="openOptions">⚙</button>
    </header>

    <section v-if="detectedText" class="detected" aria-live="polite">
      <span class="detected-dot"></span>
      <span>{{ detectedText }}</span>
    </section>

    <section ref="messagesEl" class="messages" aria-live="polite">
      <div class="messages-inner">
        <article
          v-for="(msg, index) in messages"
          :key="index"
          class="msg"
          :class="msg.role"
        >
          <div class="msg-role">{{ msg.role === 'user' ? 'Ты' : 'Ассистент' }}<span v-if="msg.modeLabel" class="msg-tag">{{ msg.modeLabel }}</span></div>
          <div v-if="msg.role === 'assistant'" class="msg-body markdown" v-html="renderMarkdown(msg.text)"></div>
          <div v-else class="msg-body">{{ msg.text }}</div>
        </article>
        <article v-if="isLoading" class="msg assistant pending">
          <div class="msg-role">Ассистент</div>
          <div class="msg-body"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
        </article>
      </div>
    </section>

    <section class="composer">
      <div v-if="messages.length === 0" class="suggestions">
        <button
          v-for="(s, i) in suggestions"
          :key="i"
          type="button"
          class="suggestion"
          @click="useSuggestion(s)"
        >{{ s }}</button>
      </div>

      <div class="composer-toggles" role="group" aria-label="Режимы">
        <button
          type="button"
          class="toggle"
          :class="{ active: answerMode }"
          @click="toggleAnswerMode"
          :title="answerMode ? 'Выключить «Ответ сразу»' : 'Возвращать только ответ'"
        >
          <span class="toggle-dot"></span>
          Ответ сразу
        </button>
        <button
          type="button"
          class="toggle toggle-secondary"
          :class="{ active: autoMode, disabled: !answerMode }"
          :disabled="!answerMode"
          @click="toggleAutoMode"
          :title="autoMode ? 'Выключить авто-режим' : 'Выбирать ответ и переходить дальше'"
        >
          <span class="toggle-dot"></span>
          Авто-режим
        </button>
        <button
          v-if="messages.length > 0"
          type="button"
          class="clear"
          @click="resetChat"
          title="Очистить диалог"
        >Очистить</button>
      </div>
      <form class="composer-form" @submit.prevent="onSubmit">
        <textarea
          ref="inputEl"
          v-model="draft"
          class="composer-input"
          :placeholder="placeholderText"
          rows="2"
          @keydown.enter.exact.prevent="onSubmit"
        ></textarea>
        <button class="send" type="submit" :disabled="isLoading || (!draft.trim() && !answerMode && messages.length === 0 && !autoMode)">
          <span v-if="isLoading">…</span>
          <span v-else>↑</span>
        </button>
      </form>
      <p v-if="errorText" class="error-banner">{{ errorText }}</p>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });
function renderMarkdown(text) {
  const html = marked.parse(text || "", { async: false });
  return DOMPurify.sanitize(html);
}

const AUTO_LOOP_DELAY_MS = 1200;
const AUTO_LOOP_MAX_ITERATIONS = 50;

const status = ref("Готово");
const errorText = ref("");
const isLoading = ref(false);
const answerMode = ref(false);
const autoMode = ref(false);
const detected = ref(null);
const messages = ref([]);
const draft = ref("");
const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

const suggestions = [
  "Разбери для меня текущий вопрос",
  "Объясни ключевое понятие простыми словами",
  "Какие варианты точно неправильные и почему?"
];

const messagesEl = ref(null);
const inputEl = ref(null);

const queryParams = new URLSearchParams(window.location.search);
const standaloneTargetTabId = Number(queryParams.get("targetTabId"));
const isStandaloneWindow = queryParams.get("standalone") === "1";

const placeholderText = computed(() => {
  if (autoMode.value) return "Авто-режим: жми ↑, я буду выбирать ответы и переходить дальше.";
  if (answerMode.value) return "Жми ↑, чтобы получить только ответ. Можешь добавить уточнение.";
  return "Спроси про вопрос, попроси разобрать вариант, дай уточнение...";
});

const detectedText = computed(() => {
  if (!detected.value) return "";
  const subject = detected.value.subject || detected.value.pageTitle || "Контекст страницы";
  const count = detected.value.optionCount != null ? ` · ${detected.value.optionCount} вариантов` : "";
  const screenshot = detected.value.hasScreenshot ? " · скриншот" : "";
  return `${subject}${count}${screenshot}`;
});

onMounted(() => {
  document.body.classList.toggle("standalone", isStandaloneWindow);
  refreshSettingsStatus();
});

watch(answerMode, (value) => {
  if (!value && autoMode.value) autoMode.value = false;
});

watch([messages, isLoading], () => {
  nextTick(scrollMessagesToBottom);
}, { deep: true });

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function toggleAnswerMode() {
  answerMode.value = !answerMode.value;
}

function toggleAutoMode() {
  if (!answerMode.value) return;
  autoMode.value = !autoMode.value;
}

function resetChat() {
  messages.value = [];
  detected.value = null;
  errorText.value = "";
  status.value = "Готово";
}

function scrollMessagesToBottom() {
  const el = messagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function onSubmit() {
  if (isLoading.value) return;
  const text = draft.value.trim();
  draft.value = "";
  await runIteration({ initialUserText: text, iteration: 0 });
}

async function useSuggestion(text) {
  if (isLoading.value) return;
  draft.value = "";
  await runIteration({ initialUserText: text, iteration: 0 });
}

function pickMode() {
  if (answerMode.value) return "answer";
  return "chat";
}

function modeLabel(mode, auto) {
  if (mode === "answer" && auto) return "Авто";
  if (mode === "answer") return "Ответ";
  if (mode === "chat") return "Чат";
  return "Подсказка";
}

async function runIteration({ initialUserText, iteration }) {
  errorText.value = "";
  const mode = pickMode();
  const userText = initialUserText || (mode === "answer"
    ? (iteration === 0 ? "Дай ответ на текущий вопрос" : "Дай ответ на этот вопрос")
    : "");

  if (userText) {
    messages.value.push({ role: "user", text: userText, modeLabel: modeLabel(mode, autoMode.value) });
  } else if (mode !== "answer") {
    // chat mode with empty input — nothing to send
    errorText.value = "Введи сообщение или включи «Ответ сразу».";
    return;
  }

  isLoading.value = true;
  status.value = iteration === 0
    ? "Читаю вопрос и делаю скриншот..."
    : `Перехожу к следующему вопросу #${iteration + 1}...`;

  let assistantText = "";
  let advanced = false;

  try {
    const targetTab = await getTargetTab();
    if (!targetTab?.id) throw new Error("Не удалось найти активную вкладку.");

    const [extracted, screenshotDataUrl] = await Promise.all([
      sendTabMessage(targetTab.id, { type: "QSA_EXTRACT_QUESTION" }).catch(() => null),
      captureTabScreenshot(targetTab)
    ]);

    status.value = mode === "answer"
      ? "Запрашиваю ответ..."
      : "Запрашиваю подсказку...";

    const history = messages.value
      .slice(0, -1) // exclude the just-added user message; backend will get it via userText
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, text: m.text }));

    const response = await sendRuntimeMessage({
      type: "QSA_GET_HINT",
      payload: {
        ...(extracted || {}),
        mode,
        screenshotDataUrl,
        history,
        userText
      }
    });

    detected.value = response.detected;
    assistantText = response.hint;
    messages.value.push({ role: "assistant", text: assistantText, modeLabel: modeLabel(mode, autoMode.value) });

    if (mode === "answer" && autoMode.value) {
      advanced = await applyDemoAnswer(targetTab.id, assistantText);
    } else {
      status.value = mode === "answer" ? "Ответ готов" : "Готово";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить запрос.";
    errorText.value = message;
    status.value = "Ошибка";
    isLoading.value = false;
    return;
  }

  isLoading.value = false;

  if (
    advanced &&
    answerMode.value &&
    autoMode.value &&
    iteration + 1 < AUTO_LOOP_MAX_ITERATIONS
  ) {
    await delay(AUTO_LOOP_DELAY_MS);
    if (!autoMode.value) {
      status.value = "Авто-режим остановлен.";
      return;
    }
    await runIteration({ initialUserText: "", iteration: iteration + 1 });
  } else if (advanced) {
    status.value = "Авто-режим завершён.";
  }
}

async function applyDemoAnswer(tabId, answer) {
  try {
    const applyResult = await sendTabMessage(tabId, {
      type: "QSA_APPLY_DEMO_ANSWER",
      payload: { answer }
    });
    status.value = applyResult.advanced ? "Ответ выбран · переход выполнен" : "Ответ выбран";
    return Boolean(applyResult.advanced);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ответ готов, но автовыбор недоступен.";
    errorText.value = message;
    return false;
  }
}

async function refreshSettingsStatus() {
  try {
    const settings = await sendRuntimeMessage({ type: "QSA_GET_SETTINGS" });
    if (!settings.backendUrl) {
      status.value = "Добавь адрес backend в настройках";
    } else if (!settings.hasSharedSecret) {
      status.value = "Backend подключен без секрета";
    } else {
      status.value = "Готово";
    }
  } catch {
    status.value = "Проверь настройки расширения";
  }
}

function printForwardedEvents(messageType, response) {
  if (!response || !Array.isArray(response.events) || response.events.length === 0) return;
  const label = `[QSA forwarded] ${messageType} (${response.events.length})`;
  console.groupCollapsed(label);
  for (const event of response.events) {
    const logger = event.level === "warn" ? console.warn : console.log;
    logger(event.source || "[QSA]", event.message, event.details ?? "");
  }
  console.groupEnd();
}

function sendTabMessageOnce(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const err = new Error(error.message || "no-receiver");
        err.isNoReceiver = /Receiving end does not exist|message port closed|Could not establish connection/i.test(error.message || "");
        reject(err);
        return;
      }
      printForwardedEvents(message?.type, response);
      if (!response?.ok) {
        const err = new Error(response?.error || "Не удалось прочитать страницу.");
        err.diagnostics = response?.diagnostics || null;
        reject(err);
        return;
      }
      resolve(response.result);
    });
  });
}

async function sendTabMessage(tabId, message, { retries = 6, retryDelayMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sendTabMessageOnce(tabId, message);
    } catch (error) {
      if (!error?.isNoReceiver) throw error;
      if (attempt < retries) {
        console.log(`[QSA] tab not ready, retry ${attempt + 1}/${retries} in ${retryDelayMs}ms`);
        await delay(retryDelayMs);
      }
    }
  }
  throw new Error("Обнови страницу теста и попробуй снова.");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      printForwardedEvents(message?.type, response);
      if (!response?.ok) {
        reject(new Error(response?.error || "Не удалось выполнить запрос."));
        return;
      }
      resolve(response.result);
    });
  });
}

async function getTargetTab() {
  if (Number.isInteger(standaloneTargetTabId) && standaloneTargetTabId > 0) {
    return chrome.tabs.get(standaloneTargetTabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function captureTabScreenshot(tab) {
  return new Promise((resolve, reject) => {
    if (!tab?.windowId) {
      reject(new Error("Не удалось определить окно вкладки для скриншота."));
      return;
    }
    chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(`Не удалось сделать скриншот: ${error.message}`));
        return;
      }
      resolve(dataUrl || "");
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
</script>
