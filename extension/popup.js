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
const LOG_PREFIX = "[QuizStudyAssistant]";
const {
  isUrlAllowedForAutoApply,
  parseAllowedUrlPatterns
} = window.QuizStudyAssistantShared;
const AUTO_CONTINUE_DELAY_MS = 2000;
const AUTO_CONTINUE_SIGNATURE_TIMEOUT_MS = 10000;
const AUTO_CONTINUE_SIGNATURE_POLL_MS = 350;
const RECENT_REQUEST_TTL_MS = 10 * 60 * 1000;
let isRequestInFlight = false;
let autoContinueArmed = false;
let autoContinueTimer = 0;
let lastScheduledAutoContinueUrl = "";
let lastSentQuestionSignature = "";
const recentRequestSignatures = new Map();

document.addEventListener("DOMContentLoaded", initializePopup);
getHintButton.addEventListener("click", () => requestHint({ source: "manual" }));
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
modeInputs.forEach((input) => input.addEventListener("change", refreshModeCopy));
modeInputs.forEach((input) => input.addEventListener("change", syncAutoContinueState));
demoAutoApplyInput.addEventListener("change", syncAutoContinueState);
chrome.tabs.onUpdated.addListener(handleTargetTabUpdated);

function initializePopup() {
  document.body.classList.toggle("standalone", isStandaloneWindow);
  refreshSettingsStatus();
}

async function requestHint({ source = "manual" } = {}) {
  if (isRequestInFlight) {
    debugLog("request skipped: another request is in flight", { source });
    return;
  }

  const mode = getSelectedMode();
  const preferOptionNumber = mode === "answer" && demoAutoApplyInput.checked;
  if (source === "auto" && !preferOptionNumber) {
    debugLog("auto-continue request skipped: mode is not enabled", { mode, autoApplyChecked: demoAutoApplyInput.checked });
    return;
  }

  if (source === "manual") {
    autoContinueArmed = preferOptionNumber;
    debugLog("auto-continue state updated from manual request", { autoContinueArmed });
  }

  isRequestInFlight = true;
  setLoading(true);
  setStatus("Читаю текущий вопрос...");
  setHint("Загрузка...");
  detectedElement.hidden = true;
  let currentRequestSignature = "";

  try {
    const targetTab = await getTargetTab();
    if (!targetTab?.id) {
      throw new Error("Не удалось найти активную вкладку.");
    }

    const settings = await sendRuntimeMessage({ type: "QSA_GET_SETTINGS" });
    const economyMode = settings.economyMode !== false;
    let badgesShown = false;
    let extracted = null;
    let screenshotDataUrl = "";
    let screenshotDecision = null;

    try {
      extracted = await sendTabMessage(targetTab.id, { type: "QSA_EXTRACT_QUESTION" }).catch((error) => {
        debugWarn("question extraction failed before screenshot decision", {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      });

      debugLog("question fingerprint extracted", {
        signature: extracted?.questionSignature || "",
        summary: extracted?.questionSignatureSummary || "",
        details: extracted?.questionSignatureDetails || null,
        url: targetTab.url
      });
      debugLog("audio sources extracted", {
        count: extracted?.audioSources?.length || 0,
        sources: extracted?.audioSources || []
      });

      currentRequestSignature = buildRequestSignature(targetTab, extracted, mode);
      if (economyMode && isDuplicateRequestSignature(currentRequestSignature)) {
        debugWarn("request blocked by economy duplicate guard", {
          source,
          requestSignature: currentRequestSignature,
          url: targetTab.url,
          question: extracted?.question?.slice(0, 180) || ""
        });
        setStatus("Экономный режим: повторный запрос на этот же вопрос заблокирован.");
        setHint("Запрос не отправлен, потому что этот вопрос на этой странице уже запрашивался недавно.");
        return;
      }

      screenshotDecision = decideScreenshotCapture({
        extracted,
        mode,
        preferOptionNumber,
        economyMode
      });
      debugLog("screenshot decision", screenshotDecision);

      if (screenshotDecision.shouldCapture && preferOptionNumber) {
        await sendTabMessage(targetTab.id, { type: "QSA_SHOW_OPTION_NUMBERS" });
        badgesShown = true;
      }

      if (screenshotDecision.shouldCapture) {
        setStatus("Делаю скриншот только потому, что он нужен для этого вопроса...");
        screenshotDataUrl = await captureTabScreenshot(targetTab);
      }

      if (economyMode) {
        rememberRequestSignature(currentRequestSignature);
      }
    } finally {
      if (badgesShown) {
        sendTabMessage(targetTab.id, { type: "QSA_CLEAR_OPTION_NUMBERS" }).catch((error) => {
          debugWarn("failed to clear option number badges", {
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }
    }

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
      payload: {
        ...(extracted || {}),
        mode,
        screenshotDataUrl,
        preferOptionNumber,
        economyMode
      }
    });

    renderDetected(response.detected);
    setHint(response.hint);
    lastSentQuestionSignature = extracted?.questionSignature || "";
    logRequestDiagnostics({
      detected: response.detected,
      screenshotDecision,
      source
    });
    debugLog("model response received", {
      mode,
      answer: response.hint,
      detected: response.detected,
      targetUrl: targetTab.url
    });

    if (mode === "answer" && demoAutoApplyInput.checked) {
      try {
        if (!isUrlAllowedForAutoApply(targetTab.url || response.detected?.pageUrl || "", settings.autoApplyAllowedUrls)) {
          debugWarn("auto-apply blocked in popup by allowlist", {
            targetUrl: targetTab.url || response.detected?.pageUrl || "",
            allowedPatterns: parseAllowedUrlPatterns(settings.autoApplyAllowedUrls)
          });
          throw new Error("Автовыбор запрещён для этого URL. Добавьте страницу в allowlist в настройках.");
        }

        debugLog("sending auto-apply request to tab", {
          targetTabId: targetTab.id,
          targetUrl: targetTab.url,
          answer: response.hint,
          allowedPatterns: parseAllowedUrlPatterns(settings.autoApplyAllowedUrls)
        });

        const applyResult = await sendTabMessage(targetTab.id, {
          type: "QSA_APPLY_DEMO_ANSWER",
          payload: {
            answer: response.hint,
            autoApplyAllowedUrls: settings.autoApplyAllowedUrls
          }
        });
        const nextText = applyResult.advanced ? " Переход выполнен." : "";
        debugLog("auto-apply completed", {
          result: applyResult,
          diagnostics: applyResult.diagnostics || null
        });
        logAutoApplyDiagnostics(applyResult.diagnostics || null);
        setStatus(`Ответ выбран на разрешённой странице.${nextText}`);
        if (autoContinueArmed && applyResult.advanced) {
          scheduleAutoContinue(targetTab.url || response.detected?.pageUrl || "", lastSentQuestionSignature);
        }
      } catch (error) {
        debugWarn("auto-apply failed", {
          error: error instanceof Error ? error.message : String(error),
          diagnostics: error?.diagnostics || null
        });
        logAutoApplyDiagnostics(error?.diagnostics || null);
        setStatus(error instanceof Error ? error.message : "Ответ готов, но автовыбор недоступен.");
      }
    } else {
      setStatus(mode === "answer" ? "Ответ готов" : "Подсказка готова");
    }
  } catch (error) {
    if (typeof currentRequestSignature === "string" && currentRequestSignature) {
      forgetRequestSignature(currentRequestSignature);
    }
    setStatus("Ошибка");
    setHint(error instanceof Error ? error.message : "Не удалось выполнить запрос.", true);
  } finally {
    isRequestInFlight = false;
    setLoading(false);
  }
}

function handleTargetTabUpdated(tabId, changeInfo, tab) {
  if (!autoContinueArmed || changeInfo.status !== "complete") {
    return;
  }

  const targetTabId = getStandaloneTargetTabId();
  if (!targetTabId || tabId !== targetTabId) {
    return;
  }

  scheduleAutoContinue(tab?.url || changeInfo.url || "", lastSentQuestionSignature);
}

function decideScreenshotCapture({ extracted, mode, preferOptionNumber, economyMode }) {
  const question = extracted?.question || "";
  const options = Array.isArray(extracted?.options) ? extracted.options : [];
  const hasImageOptions = options.some((option) => /(?:^|\s)изображение:/i.test(option) || /https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(option));
  const hasWeakText = question.length < 20 || (mode === "answer" && options.length === 0);
  const shouldCapture = !economyMode || !extracted || hasWeakText || hasImageOptions;
  const reasons = [];

  if (!economyMode) reasons.push("economy-mode-off");
  if (!extracted) reasons.push("dom-extraction-failed");
  if (hasWeakText) reasons.push("weak-dom-text");
  if (hasImageOptions) reasons.push("image-options");
  if (reasons.length === 0) reasons.push("dom-text-is-enough");

  return {
    shouldCapture,
    reasons,
    economyMode,
    mode,
    preferOptionNumber,
    questionChars: question.length,
    optionCount: options.length,
    hasImageOptions
  };
}

function buildRequestSignature(tab, extracted, mode) {
  const fingerprint = extracted?.questionSignature || "";
  if (fingerprint) {
    return [mode, fingerprint].join("::");
  }

  const url = stripUrlHash(tab?.url || extracted?.pageUrl || "");
  const questionKey = normalizeSignatureText(extracted?.question || "").slice(0, 220);
  const optionsKey = Array.isArray(extracted?.options)
    ? extracted.options.map(normalizeSignatureText).join("|").slice(0, 260)
    : "";
  return [mode, url, questionKey, optionsKey].join("::");
}

function isDuplicateRequestSignature(signature) {
  pruneRecentRequestSignatures();
  return Boolean(signature && recentRequestSignatures.has(signature));
}

function rememberRequestSignature(signature) {
  if (!signature) {
    return;
  }

  pruneRecentRequestSignatures();
  recentRequestSignatures.set(signature, Date.now());
}

function forgetRequestSignature(signature) {
  if (signature) {
    recentRequestSignatures.delete(signature);
  }
}

function pruneRecentRequestSignatures() {
  const cutoff = Date.now() - RECENT_REQUEST_TTL_MS;
  for (const [signature, timestamp] of recentRequestSignatures) {
    if (timestamp < cutoff) {
      recentRequestSignatures.delete(signature);
    }
  }
}

function stripUrlHash(url) {
  return String(url || "").replace(/#.*$/, "");
}

function normalizeSignatureText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scheduleAutoContinue(url, previousQuestionSignature = "") {
  if (!isAutoContinueEnabled()) {
    clearAutoContinueTimer();
    debugLog("auto-continue not scheduled: mode disabled", { url });
    return;
  }

  clearAutoContinueTimer();
  lastScheduledAutoContinueUrl = url;
  setStatus(`Жду смену вопроса. Проверка через ${AUTO_CONTINUE_DELAY_MS / 1000} сек...`);
  debugLog("auto-continue scheduled", {
    delayMs: AUTO_CONTINUE_DELAY_MS,
    url,
    previousQuestionSignature
  });

  autoContinueTimer = window.setTimeout(async () => {
    autoContinueTimer = 0;
    const targetTab = await getTargetTab().catch(() => null);
    if (!targetTab?.id) {
      debugWarn("auto-continue cancelled: target tab not found", { url: lastScheduledAutoContinueUrl });
      return;
    }

    const waitResult = await waitForQuestionSignatureChange(targetTab.id, previousQuestionSignature);
    if (!waitResult.changed) {
      setStatus("Автопродолжение остановлено: fingerprint вопроса не изменился.");
      debugWarn("auto-continue cancelled: question fingerprint unchanged", waitResult);
      return;
    }

    debugLog("auto-continue firing after question fingerprint changed", {
      url: lastScheduledAutoContinueUrl,
      waitResult
    });
    requestHint({ source: "auto" });
  }, AUTO_CONTINUE_DELAY_MS);
}

async function waitForQuestionSignatureChange(tabId, previousQuestionSignature) {
  const startedAt = Date.now();
  let lastExtracted = null;
  let attempts = 0;

  while (Date.now() - startedAt < AUTO_CONTINUE_SIGNATURE_TIMEOUT_MS) {
    attempts += 1;
    const extracted = await sendTabMessage(tabId, { type: "QSA_EXTRACT_QUESTION" }).catch((error) => {
      debugWarn("auto-continue fingerprint poll failed", {
        attempts,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });

    const currentSignature = extracted?.questionSignature || "";
    lastExtracted = {
      signature: currentSignature,
      summary: extracted?.questionSignatureSummary || "",
      details: extracted?.questionSignatureDetails || null
    };

    debugLog("auto-continue fingerprint poll", {
      attempts,
      previousQuestionSignature,
      currentSignature,
      changed: Boolean(currentSignature && currentSignature !== previousQuestionSignature),
      summary: lastExtracted.summary
    });

    if (currentSignature && currentSignature !== previousQuestionSignature) {
      return {
        changed: true,
        attempts,
        previousQuestionSignature,
        currentSignature,
        summary: lastExtracted.summary,
        details: lastExtracted.details
      };
    }

    await delay(AUTO_CONTINUE_SIGNATURE_POLL_MS);
  }

  return {
    changed: false,
    attempts,
    previousQuestionSignature,
    currentSignature: lastExtracted?.signature || "",
    summary: lastExtracted?.summary || "",
    details: lastExtracted?.details || null,
    timeoutMs: AUTO_CONTINUE_SIGNATURE_TIMEOUT_MS
  };
}

function syncAutoContinueState() {
  if (isAutoContinueEnabled()) {
    return;
  }

  autoContinueArmed = false;
  clearAutoContinueTimer();
  debugLog("auto-continue disarmed because mode changed", {
    mode: getSelectedMode(),
    autoApplyChecked: demoAutoApplyInput.checked
  });
}

function clearAutoContinueTimer() {
  if (!autoContinueTimer) {
    return;
  }

  window.clearTimeout(autoContinueTimer);
  autoContinueTimer = 0;
}

function isAutoContinueEnabled() {
  return getSelectedMode() === "answer" && demoAutoApplyInput.checked;
}

function getStandaloneTargetTabId() {
  return Number.isInteger(standaloneTargetTabId) && standaloneTargetTabId > 0 ? standaloneTargetTabId : 0;
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

async function sendTabMessage(tabId, message) {
  try {
    return await sendTabMessageOnce(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    debugWarn("content script missing, injecting scripts and retrying", {
      tabId,
      messageType: message?.type || "",
      chromeRuntimeLastError: error.diagnostics?.chromeRuntimeLastError || error.message
    });

    await injectContentScripts(tabId);
    return sendTabMessageOnce(tabId, message);
  }
}

function sendTabMessageOnce(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const wrappedError = new Error("Обновите страницу теста и попробуйте снова.");
        wrappedError.diagnostics = {
          messageType: message?.type || "",
          chromeRuntimeLastError: error.message,
          tabId
        };
        reject(wrappedError);
        return;
      }
      if (!response?.ok) {
        const responseError = new Error(response?.error || "Не удалось прочитать страницу.");
        responseError.diagnostics = response?.diagnostics || null;
        reject(responseError);
        return;
      }
      resolve(response.result);
    });
  });
}

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["shared.js", "content.js"]
  });
}

function isMissingContentScriptError(error) {
  const message = error?.diagnostics?.chromeRuntimeLastError || error?.message || "";
  return /receiving end does not exist|could not establish connection/i.test(message);
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
  const audioText = detected.audioSourceCount
    ? ` Аудио: ${detected.audioSourceCount}, транскрипт ${detected.hasAudioTranscript ? "получен" : "не получен"}.`
    : "";
  const economyText = detected.requestDiagnostics?.economyMode ? " Экономный режим." : "";
  const modelText = detected.requestDiagnostics?.model ? ` Модель: ${detected.requestDiagnostics.model}.` : "";
  detectedElement.textContent = `${subject}. Вариантов найдено: ${detected.optionCount}.${screenshotText}${audioText}${economyText}${modelText}`;
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

function debugLog(message, details) {
  console.debug(LOG_PREFIX, message, details || "");
}

function debugWarn(message, details) {
  console.warn(LOG_PREFIX, message, details || "");
}

function logRequestDiagnostics({ detected, screenshotDecision, source }) {
  const request = detected?.requestDiagnostics || null;
  const usage = detected?.usage || null;

  console.groupCollapsed(`${LOG_PREFIX} request economy diagnostics`);
  console.log("source:", source);
  console.log("model:", request?.model);
  console.log("economyMode:", request?.economyMode);
  console.log("includedHtml:", request?.includedHtml);
  console.log("promptChars:", request?.promptChars);
  console.log("estimatedTextTokens:", request?.estimatedTextTokens);
  console.log("questionChars:", request?.questionChars);
  console.log("optionCount:", request?.optionCount);
  console.log("optionChars:", request?.optionChars);
  console.log("hasScreenshot:", request?.hasScreenshot);
  console.log("screenshotApproxBytes:", request?.screenshotApproxBytes);
  console.log("audioSourceCount:", request?.audioSourceCount);
  console.log("hasAudioTranscript:", request?.hasAudioTranscript);
  console.log("audioTranscriptChars:", request?.audioTranscriptChars);
  console.log("audioDiagnostics:", request?.audioDiagnostics);
  console.log("screenshotDecision:", screenshotDecision);
  console.log("apiUsage:", usage);
  console.groupEnd();
}

function logAutoApplyDiagnostics(diagnostics) {
  if (!diagnostics) {
    return;
  }

  console.groupCollapsed(`${LOG_PREFIX} auto-apply diagnostics`);
  console.log("rawAnswer:", diagnostics.rawAnswer);
  console.log("cleanAnswer:", diagnostics.cleanAnswer);
  console.log("normalizedAnswer:", diagnostics.normalizedAnswer);
  console.log("parsedAnswerNumbers:", diagnostics.parsedAnswerNumbers);
  console.log("pageUrl:", diagnostics.pageUrl);
  console.log("allowedPatterns:", diagnostics.allowedPatterns);
  console.log("failureReason:", diagnostics.failureReason);
  console.log("threshold:", diagnostics.threshold);
  console.log("bestScore:", diagnostics.bestScore);
  console.log("best:", diagnostics.best);
  console.log("choiceActions:", diagnostics.choiceActions);
  console.log("selects:", diagnostics.selects);
  console.log("selectAssignments:", diagnostics.selectAssignments);
  console.log("selectActions:", diagnostics.selectActions);
  console.log("customDropdowns:", diagnostics.customDropdowns);
  console.log("customDropdownAssignments:", diagnostics.customDropdownAssignments);
  console.log("customDropdownActions:", diagnostics.customDropdownActions);
  console.log("matchingGroup:", diagnostics.matchingGroup);
  console.log("matchingAssignments:", diagnostics.matchingAssignments);
  console.log("matchingActions:", diagnostics.matchingActions);
  console.log("advance:", diagnostics.advance);
  logAutoAdvanceSummary(diagnostics.advance);

  if (Array.isArray(diagnostics.candidates) && diagnostics.candidates.length > 0) {
    console.table(diagnostics.candidates.map((candidate) => ({
      index: candidate.index,
      score: candidate.score ?? "",
      reason: candidate.matchReason || "",
      text: candidate.text || "",
      matchText: candidate.matchText || "",
      normalizedOption: candidate.normalizedOption || "",
      images: Array.isArray(candidate.imageSources) ? candidate.imageSources.join(" | ") : "",
      input: candidate.input?.selector || "",
      optionRoot: candidate.optionRoot?.selector || ""
    })));
  }

  if (Array.isArray(diagnostics.selectActions) && diagnostics.selectActions.length > 0) {
    console.table(diagnostics.selectActions.map((action) => ({
      selectIndex: action.selectIndex,
      optionIndex: action.optionIndex,
      applied: action.applied,
      reason: action.reason || "",
      optionText: action.optionText || "",
      beforeValue: action.beforeValue || "",
      afterValue: action.afterValue || "",
      select: action.select?.selector || ""
    })));
  }

  if (Array.isArray(diagnostics.customDropdownActions) && diagnostics.customDropdownActions.length > 0) {
    console.table(diagnostics.customDropdownActions.map((action) => ({
      dropdownIndex: action.dropdownIndex,
      value: action.value || "",
      applied: action.applied,
      reason: action.reason || "",
      beforeText: action.beforeText || "",
      afterText: action.afterText || "",
      selectedOption: action.selectedOption?.text || "",
      dropdown: action.dropdown?.selector || ""
    })));
  }

  if (Array.isArray(diagnostics.matchingActions) && diagnostics.matchingActions.length > 0) {
    console.table(diagnostics.matchingActions.map((action) => ({
      leftLabel: action.leftLabel,
      rightLabel: action.rightLabel,
      applied: action.applied,
      reason: action.reason || "",
      leftText: action.left?.text || "",
      rightText: action.right?.text || "",
      leftElement: action.left?.element?.selector || "",
      rightElement: action.right?.element?.selector || ""
    })));
  }

  if (Array.isArray(diagnostics.advance?.candidates) && diagnostics.advance.candidates.length > 0) {
    console.table(diagnostics.advance.candidates.map((candidate) => ({
      index: candidate.index,
      text: candidate.text || "",
      selector: candidate.selector || "",
      tagName: candidate.tagName || "",
      type: candidate.type || "",
      isNextLike: candidate.isNextLike,
      isDangerous: candidate.isDangerous,
      isSafeNext: candidate.isSafeNext,
      decisionReason: candidate.decisionReason || ""
    })));
  }

  console.groupEnd();
}

function logAutoAdvanceSummary(advance) {
  if (!advance) {
    console.info(`${LOG_PREFIX} auto-advance summary`, {
      reason: "missing-advance-diagnostics"
    });
    return;
  }

  console.info(`${LOG_PREFIX} auto-advance summary`, {
    reason: advance.reason || "",
    clicked: advance.clicked || null,
    clickAttempt: advance.clickAttempt || null,
    candidateCount: Array.isArray(advance.candidates) ? advance.candidates.length : 0
  });

  if (advance.reason === "question-already-changed") {
    console.info(`${LOG_PREFIX} auto-advance did not click because the question signature changed before navigation search`, {
      before: advance.beforeQuestionSignatureSummary,
      after: advance.afterQuestionSignatureSummary
    });
    return;
  }

  if (advance.clicked) {
    console.info(`${LOG_PREFIX} auto-advance tried to click`, {
      text: advance.clicked.text,
      selector: advance.clicked.selector,
      tagName: advance.clicked.tagName,
      type: advance.clicked.type
    });
  } else {
    console.warn(`${LOG_PREFIX} auto-advance did not choose a button`, {
      reason: advance.reason || "",
      candidateCount: Array.isArray(advance.candidates) ? advance.candidates.length : 0
    });
  }

  if (advance.clickAttempt) {
    console.info(`${LOG_PREFIX} auto-advance click result`, {
      clickCalled: advance.clickAttempt.clickCalled,
      changedAfterClick: advance.clickAttempt.changedAfterClick,
      requestSubmitAvailable: advance.clickAttempt.requestSubmitAvailable,
      requestSubmitAttempted: advance.clickAttempt.requestSubmitAttempted,
      changedAfterRequestSubmit: advance.clickAttempt.changedAfterRequestSubmit,
      beforeClickUrl: advance.clickAttempt.beforeClickUrl,
      afterClickUrl: advance.clickAttempt.afterClickUrl,
      afterRequestSubmitUrl: advance.clickAttempt.afterRequestSubmitUrl
    });
  }

  if (Array.isArray(advance.candidates) && advance.candidates.length > 0) {
    console.info(`${LOG_PREFIX} auto-advance candidate buttons`);
    console.table(advance.candidates.map((candidate) => ({
      index: candidate.index,
      text: candidate.text || "",
      selector: candidate.selector || "",
      tagName: candidate.tagName || "",
      type: candidate.type || "",
      isNextLike: candidate.isNextLike,
      isDangerous: candidate.isDangerous,
      isSafeNext: candidate.isSafeNext,
      decisionReason: candidate.decisionReason || ""
    })));
  }
}
