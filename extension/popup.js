const getHintButton = document.getElementById("getHint");
const openOptionsButton = document.getElementById("openOptions");
const statusElement = document.getElementById("status");
const hintElement = document.getElementById("hint");
const detectedElement = document.getElementById("detected");
const demoAutoApplyInput = document.getElementById("demoAutoApply");
const modeInputs = Array.from(document.querySelectorAll("input[name='mode']"));
const queryParams = new URLSearchParams(window.location.search);
const standaloneTargetTabId = Number(queryParams.get("targetTabId"));
const isStandaloneWindow = queryParams.get("standalone") === "1";

document.addEventListener("DOMContentLoaded", initializePopup);
getHintButton.addEventListener("click", requestHint);
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
modeInputs.forEach((input) => input.addEventListener("change", refreshModeCopy));

function initializePopup() {
  document.body.classList.toggle("standalone", isStandaloneWindow);
  refreshSettingsStatus();
}

async function requestHint() {
  const mode = getSelectedMode();
  setLoading(true);
  setStatus("Читаю текущий вопрос и делаю скриншот...");
  setHint("Загрузка...");
  detectedElement.hidden = true;

  try {
    const targetTab = await getTargetTab();
    if (!targetTab?.id) {
      throw new Error("Не удалось найти активную вкладку.");
    }

    const [extracted, screenshotDataUrl] = await Promise.all([
      sendTabMessage(targetTab.id, { type: "QSA_EXTRACT_QUESTION" }).catch(() => null),
      captureTabScreenshot(targetTab)
    ]);

    if (!extracted?.question && !screenshotDataUrl) {
      throw new Error("На странице не найден видимый вопрос теста и не удалось сделать скриншот.");
    }

    if (extracted && !extracted.isQuizPage) {
      setStatus("Страница не похожа на тест, но текст найден.");
    } else {
      setStatus(mode === "answer" ? "Запрашиваю прямой ответ..." : "Запрашиваю обучающую подсказку...");
    }

    const response = await sendRuntimeMessage({
      type: "QSA_GET_HINT",
      payload: { ...(extracted || {}), mode, screenshotDataUrl }
    });

    renderDetected(response.detected);
    setHint(response.hint);
    if (mode === "answer" && demoAutoApplyInput.checked) {
      try {
        const applyResult = await sendTabMessage(targetTab.id, {
          type: "QSA_APPLY_DEMO_ANSWER",
          payload: { answer: response.hint }
        });
        const nextText = applyResult.advanced ? " Переход выполнен." : "";
        setStatus(`Ответ выбран в демо.${nextText}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Ответ готов, но автовыбор недоступен.");
      }
    } else {
      setStatus(mode === "answer" ? "Ответ готов" : "Подсказка готова");
    }
  } catch (error) {
    setStatus("Ошибка");
    setHint(error instanceof Error ? error.message : "Не удалось выполнить запрос.", true);
  } finally {
    setLoading(false);
  }
}

async function refreshSettingsStatus() {
  try {
    const settings = await sendRuntimeMessage({ type: "QSA_GET_SETTINGS" });
    if (!settings.hasApiKey) {
      setStatus("Добавьте API-ключ в настройках");
    }
  } catch {
    setStatus("Проверьте настройки расширения");
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error("Обновите страницу теста и попробуйте снова."));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Не удалось прочитать страницу."));
        return;
      }
      resolve(response.result);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
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

    chrome.tabs.captureVisibleTab(
      tab.windowId,
      { format: "jpeg", quality: 80 },
      (dataUrl) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(`Не удалось сделать скриншот: ${error.message}`));
          return;
        }
        resolve(dataUrl || "");
      }
    );
  });
}

function renderDetected(detected) {
  if (!detected) {
    detectedElement.hidden = true;
    return;
  }

  const subject = detected.subject || detected.pageTitle || "Предмет не определён";
  const screenshotText = detected.hasScreenshot ? " Скриншот приложен." : "";
  detectedElement.textContent = `${subject}. Вариантов найдено: ${detected.optionCount}.${screenshotText}`;
  detectedElement.hidden = false;
}

function setLoading(isLoading) {
  getHintButton.disabled = isLoading;
  getHintButton.textContent = isLoading ? getLoadingText() : getButtonText();
}

function setStatus(value) {
  statusElement.textContent = value;
}

function setHint(value, isError = false) {
  hintElement.textContent = value;
  hintElement.classList.toggle("error", isError);
}

function getSelectedMode() {
  return modeInputs.find((input) => input.checked)?.value === "answer" ? "answer" : "hint";
}

function refreshModeCopy() {
  getHintButton.textContent = getButtonText();
}

function getButtonText() {
  return getSelectedMode() === "answer" ? "Получить ответ" : "Получить подсказку";
}

function getLoadingText() {
  return getSelectedMode() === "answer" ? "Готовлю ответ..." : "Готовлю подсказку...";
}
