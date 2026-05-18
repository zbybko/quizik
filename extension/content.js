(function initializeQuizStudyAssistant() {
  const EXTRACT_MESSAGE_TYPE = "QSA_EXTRACT_QUESTION";
  const APPLY_DEMO_ANSWER_MESSAGE_TYPE = "QSA_APPLY_DEMO_ANSWER";
  const SHOW_OPTION_NUMBERS_MESSAGE_TYPE = "QSA_SHOW_OPTION_NUMBERS";
  const CLEAR_OPTION_NUMBERS_MESSAGE_TYPE = "QSA_CLEAR_OPTION_NUMBERS";
  const MAX_TEXT_LENGTH = 6000;
  const LOG_PREFIX = "[QuizStudyAssistant]";
  const OPTION_NUMBER_BADGE_CLASS = "qsa-option-number-badge";
  const AUTO_ADVANCE_DELAY_MS = 450;
  const AUTO_ADVANCE_AFTER_CLICK_DELAY_MS = 650;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === EXTRACT_MESSAGE_TYPE) {
      flushLogEvents();
      extractQuizContext(document)
        .then((payload) => sendResponse({ ok: true, result: payload, events: flushLogEvents() }))
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Не удалось прочитать страницу.",
            events: flushLogEvents()
          });
        });

      return true;
    }

    if (message?.type === APPLY_DEMO_ANSWER_MESSAGE_TYPE) {
      flushLogEvents();
      applyDemoAnswer(message.payload?.answer || "")
        .then((result) => sendResponse({ ok: true, result, events: flushLogEvents() }))
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Не удалось выбрать ответ в демо.",
            diagnostics: error?.diagnostics || null,
            events: flushLogEvents()
          });
        });

      return true;
    }

    if (message?.type === SHOW_OPTION_NUMBERS_MESSAGE_TYPE) {
      flushLogEvents();
      try {
        const result = showOptionNumberBadges();
        sendResponse({ ok: true, result, events: flushLogEvents() });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Не удалось пронумеровать варианты.",
          events: flushLogEvents()
        });
      }

      return false;
    }

    if (message?.type === CLEAR_OPTION_NUMBERS_MESSAGE_TYPE) {
      clearOptionNumberBadges();
      sendResponse({ ok: true, result: { cleared: true }, events: flushLogEvents() });
      return false;
    }

    return false;
  });

  window.QuizStudyAssistantExtractor = {
    extractQuizContext,
    isLikelyQuizPage,
    collectVisibleText,
    applyDemoAnswer
  };

  async function extractQuizContext(doc) {
    const questionRoot = findQuestionRoot(doc);
    const source = questionRoot || doc.body;
    const question = collectQuestionText(source);
    const options = await collectAnswerOptions(source);
    const audioSources = collectAudioSources(source, doc);
    const signature = buildVisibleQuestionSignature(doc);

    return {
      isQuizPage: isLikelyQuizPage(doc),
      subject: findSubject(doc),
      question,
      options,
      audioSources,
      questionSignature: signature.value,
      questionSignatureSummary: signature.summary,
      questionSignatureDetails: signature.details,
      pageTitle: doc.title || "",
      pageUrl: doc.location?.href || ""
    };
  }

  function showOptionNumberBadges() {
    clearOptionNumberBadges();

    const questionRoot = findQuestionRoot(document);
    if (!questionRoot) {
      throw new Error("Не найден блок вопроса для нумерации вариантов.");
    }

    const inputs = findChoiceInputs(questionRoot);
    inputs.forEach((input, index) => {
      const optionRoot = findInputOptionRoot(input) || input;
      const badge = document.createElement("span");
      badge.className = OPTION_NUMBER_BADGE_CLASS;
      badge.textContent = String(index + 1);
      badge.setAttribute("aria-hidden", "true");
      Object.assign(badge.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "24px",
        height: "24px",
        minWidth: "24px",
        marginRight: "8px",
        border: "2px solid #111827",
        borderRadius: "999px",
        background: "#facc15",
        color: "#111827",
        font: "700 14px/1 Arial, sans-serif",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.28)",
        verticalAlign: "middle",
        position: "relative",
        zIndex: "2147483647"
      });

      insertOptionNumberBadge(input, optionRoot, badge);
    });

    const selects = findAnswerSelects(questionRoot);
    selects.forEach((select, index) => {
      const badge = createOptionNumberBadge(index + 1);
      badge.style.background = "#38bdf8";
      insertOptionNumberBadge(select, select, badge);
    });

    const customDropdowns = findCustomDropdowns(questionRoot);
    customDropdowns.forEach((dropdown, index) => {
      const badge = createOptionNumberBadge(index + 1);
      badge.style.background = "#a7f3d0";
      insertOptionNumberBadge(dropdown.button, dropdown.button, badge);
    });

    debugLog("option number badges shown", {
      choiceCount: inputs.length,
      selectCount: selects.length,
      customDropdownCount: customDropdowns.length
    });
    return {
      count: inputs.length + selects.length + customDropdowns.length,
      choiceCount: inputs.length,
      selectCount: selects.length,
      customDropdownCount: customDropdowns.length
    };
  }

  function createOptionNumberBadge(number) {
    const badge = document.createElement("span");
    badge.className = OPTION_NUMBER_BADGE_CLASS;
    badge.textContent = String(number);
    badge.setAttribute("aria-hidden", "true");
    Object.assign(badge.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "24px",
      height: "24px",
      minWidth: "24px",
      marginRight: "8px",
      border: "2px solid #111827",
      borderRadius: "999px",
      background: "#facc15",
      color: "#111827",
      font: "700 14px/1 Arial, sans-serif",
      boxShadow: "0 1px 4px rgba(0, 0, 0, 0.28)",
      verticalAlign: "middle",
      position: "relative",
      zIndex: "2147483647"
    });
    return badge;
  }

  function clearOptionNumberBadges() {
    document.querySelectorAll(`.${OPTION_NUMBER_BADGE_CLASS}`).forEach((badge) => badge.remove());
  }

  function insertOptionNumberBadge(input, optionRoot, badge) {
    if (optionRoot && optionRoot !== input) {
      optionRoot.insertBefore(badge, optionRoot.firstChild);
      return;
    }

    if (input.parentNode) {
      input.parentNode.insertBefore(badge, input);
      return;
    }

    document.body.appendChild(badge);
  }

  function isLikelyQuizPage(doc) {
    const url = doc.location?.href?.toLowerCase() || "";
    if (/(quiz|test|attempt|control|mod\/quiz|тест|контроль)/i.test(url)) {
      return true;
    }

    const hasQuestionText = Boolean(findQuestionRoot(doc));
    const hasAnswerInputs = findChoiceInputs(doc).length > 0 ||
      doc.querySelectorAll("input[type='text'], input[type='number'], textarea, select").length > 0;
    const hasSubmit = Array.from(doc.querySelectorAll("button, input[type='submit']"))
      .some((element) => /отправить|submit|finish|next|далее|проверить/i.test(elementText(element)));

    return hasQuestionText && (hasAnswerInputs || hasSubmit);
  }

  function findQuestionRoot(doc) {
    const candidates = [
      ".que",
      ".question",
      "[id*='question']",
      "[class*='question']",
      "form[action*='quiz']",
      "form",
      "main",
      "[role='main']"
    ];

    for (const selector of candidates) {
      const elements = Array.from(doc.querySelectorAll(selector));
      const match = elements.find((element) => {
        const text = collectVisibleText(element);
        const choiceCount = findChoiceInputs(element).length;
        const textInputCount = element.querySelectorAll("input[type='text'], input[type='number'], textarea").length;
        const selectCount = element.querySelectorAll("select").length;
        return text.length > 20 && (choiceCount > 1 || textInputCount > 0 || selectCount > 0 || /вопрос|question|ответ|answer/i.test(text));
      });

      if (match) {
        return match;
      }
    }

    return findMainInteractiveRegion(doc);
  }

  function collectQuestionText(root) {
    const preferredSelectors = [
      ".qtext",
      ".questiontext",
      ".formulation",
      "[class*='qtext']",
      "[class*='questiontext']",
      "legend",
      "h1",
      "h2",
      "h3"
    ];

    for (const selector of preferredSelectors) {
      const element = root.querySelector?.(selector);
      const text = element ? collectVisibleText(element) : "";
      if (text.length > 8) {
        return limitText(text);
      }
    }

    const clone = root.cloneNode(true);
    clone.querySelectorAll("input, button, select, textarea, nav, header, footer, script, style").forEach((node) => node.remove());
    return limitText(collectVisibleText(clone));
  }

  async function collectAnswerOptions(root) {
    const options = [];
    const seen = new Set();
    const choiceInputs = findChoiceInputs(root);

    for (const input of choiceInputs) {
      const optionText = findInputOptionText(input);
      const imageSources = findInputOptionImageSources(input);
      addOption(formatOptionForPrompt(optionText, imageSources, options.length + 1));
    }

    if (options.length === 0) {
      const selects = findAnswerSelects(root);
      selects.forEach((select, index) => addOption(formatSelectForPrompt(select, index + 1)));
    }

    if (options.length === 0) {
      const customDropdowns = findCustomDropdowns(root);
      await enrichCustomDropdownsWithOptions(customDropdowns);
      customDropdowns.forEach((dropdown, index) => addOption(formatCustomDropdownForPrompt(dropdown, index + 1)));
    }

    if (options.length === 0) {
      const matchingGroup = findMatchingGroup(root);
      if (matchingGroup) {
        addOption(formatMatchingGroupForPrompt(matchingGroup));
      }
    }

    if (options.length === 0) {
      const semanticOptions = Array.from(root.querySelectorAll("[role='radio'], [role='checkbox'], li, label"));
      for (const element of semanticOptions) {
        addOption(collectVisibleText(element));
      }
    }

    return options;

    function addOption(value) {
      const text = cleanText(value);
      if (text.length < 1 || text.length > 1000 || seen.has(text)) {
        return;
      }
      seen.add(text);
      options.push(text);
    }
  }

  function collectAudioSources(root, doc = document) {
    const sources = [];
    const seen = new Set();

    Array.from(root.querySelectorAll("audio, video")).forEach((media) => {
      addAudioSource(media.getAttribute?.("src") || media.currentSrc || media.src || "", media.getAttribute?.("type") || "");
      Array.from(media.querySelectorAll("source")).forEach((source) => {
        addAudioSource(source.getAttribute?.("src") || source.src || "", source.getAttribute?.("type") || "");
      });
    });

    return sources;

    function addAudioSource(src, type) {
      const absoluteUrl = toAbsoluteUrl(src, doc.location?.href || document.location.href);
      if (!absoluteUrl || seen.has(absoluteUrl) || !isLikelyAudioUrl(absoluteUrl, type)) {
        return;
      }

      seen.add(absoluteUrl);
      sources.push({
        src: absoluteUrl,
        type: cleanText(type),
        filename: getUrlFilename(absoluteUrl)
      });
    }
  }

  function toAbsoluteUrl(value, baseUrl) {
    if (!value) {
      return "";
    }

    try {
      return new URL(value, baseUrl).href;
    } catch {
      return "";
    }
  }

  function isLikelyAudioUrl(url, type = "") {
    return /^audio\//i.test(type) || /\.(?:mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg)(?:[?#]|$)/i.test(url);
  }

  function getUrlFilename(url) {
    try {
      return cleanText(new URL(url).pathname.split("/").pop() || "");
    } catch {
      return "";
    }
  }

  function findInputOptionText(input) {
    const optionRoot = findInputOptionRoot(input);
    return optionRoot ? collectVisibleText(optionRoot) : "";
  }

  function findInputOptionRoot(input) {
    const label = input.id ? input.ownerDocument.querySelector(`label[for="${cssEscape(input.id)}"]`) : null;
    if (label) {
      return label;
    }

    const ariaLabelRoot = findAriaLabelRoot(input);
    if (ariaLabelRoot) {
      return ariaLabelRoot;
    }

    const wrappedLabel = input.closest("label");
    if (wrappedLabel) {
      return wrappedLabel;
    }

    const optionContainer = input.closest(".r0, .r1, li, p, div");
    if (optionContainer && findChoiceInputs(optionContainer).length <= 1) {
      return optionContainer;
    }

    return null;
  }

  function findChoiceInputs(root) {
    if (!root?.querySelectorAll) {
      return [];
    }

    return Array.from(root.querySelectorAll("input[type='radio'], input[type='checkbox']"))
      .filter(isUsableChoiceInput);
  }

  function isUsableChoiceInput(input) {
    if (!input || input.tagName !== "INPUT") {
      return false;
    }

    const type = String(input.type || input.getAttribute?.("type") || "").toLowerCase();
    if (type !== "radio" && type !== "checkbox") {
      return false;
    }

    if (input.disabled || input.getAttribute?.("disabled") !== null) {
      return false;
    }

    if (input.getAttribute?.("aria-hidden") === "true") {
      return false;
    }

    if (String(input.value ?? input.getAttribute?.("value") ?? "") === "-1") {
      return false;
    }

    const className = String(input.className || input.getAttribute?.("class") || "");
    if (/\bsr-only\b/.test(className)) {
      return false;
    }

    if (input.closest?.(".qtype_multichoice_clearchoice")) {
      return false;
    }

    return !isSensitiveOrHidden(input);
  }

  function findAriaLabelRoot(input) {
    const labelledBy = input.getAttribute?.("aria-labelledby") || "";
    const labelIds = labelledBy.split(/\s+/).map((value) => value.trim()).filter(Boolean);
    for (const labelId of labelIds) {
      const label = input.ownerDocument.getElementById?.(labelId);
      if (label) {
        return label;
      }
    }

    return null;
  }

  function findInputOptionImageSources(input) {
    const optionRoot = findInputOptionRoot(input);
    if (!optionRoot) {
      return [];
    }

    return Array.from(optionRoot.querySelectorAll("img"))
      .map((image) => image.currentSrc || image.src || image.getAttribute("src") || "")
      .map(cleanText)
      .filter(Boolean);
  }

  function formatOptionForPrompt(text, imageSources = [], optionNumber = 0) {
    const cleanOptionText = cleanText(text);
    if (cleanOptionText) {
      return cleanOptionText;
    }

    if (imageSources.length > 0) {
      return `Изображение: ${imageSources.join(" ")}`;
    }

    return optionNumber > 0 ? `Вариант ${optionNumber}` : "";
  }

  function formatSelectForPrompt(select, selectNumber) {
    const promptText = findSelectPromptText(select);
    const optionText = collectSelectOptions(select)
      .map((option, index) => `${index + 1}) ${option.text}`)
      .join("; ");
    return `Выпадающий список ${selectNumber}${promptText ? ` (${promptText})` : ""}: ${optionText || "варианты не найдены"}`;
  }

  function formatCustomDropdownForPrompt(dropdown, dropdownNumber) {
    const optionLines = Array.isArray(dropdown.options) && dropdown.options.length > 0
      ? dropdown.options.map((option, index) => `${index + 1}) ${option.text}`).join("; ")
      : "";
    return [
      `Кастомный выпадающий список ${dropdownNumber}`,
      dropdown.currentValue ? `текущее значение: ${dropdown.currentValue}` : "текущее значение: пустой пропуск",
      dropdown.context ? `контекст: ${dropdown.context}` : "",
      optionLines ? `варианты: ${optionLines}` : "варианты не удалось прочитать",
      "верни соответствия для всех таких списков в формате 1=номерВарианта или 1=точныйТекст"
    ].filter(Boolean).join(" — ");
  }

  function formatMatchingGroupForPrompt(group) {
    return [
      "Задание на сопоставление.",
      "Левая группа:",
      ...group.leftItems.map((item) => `${item.label}. ${item.text}`),
      "Правая группа:",
      ...group.rightItems.map((item) => `${item.label}. ${item.text}`),
      "Верни соответствия строго в формате 1=A,2=B,3=C."
    ].join("\n");
  }

  function findSelectPromptText(select) {
    const container = select.closest("p, li, div");
    if (!container) {
      return "";
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll("select, option, input, button, script, style").forEach((node) => node.remove());
    return cleanText(collectVisibleText(clone)).slice(0, 180);
  }

  function findAnswerSelects(root) {
    return Array.from(root.querySelectorAll("select"))
      .filter((select) => !select.disabled && !isSensitiveOrHidden(select));
  }

  function findCustomDropdowns(root) {
    if (!root?.querySelectorAll) {
      return [];
    }

    return Array.from(root.querySelectorAll("button, [role='button'], [aria-haspopup='listbox'], [aria-haspopup='menu']"))
      .filter((button) => isLikelyCustomDropdownButton(button, root))
      .map((button) => ({
        button,
        currentValue: getCustomDropdownCurrentValue(button),
        context: findCustomDropdownContext(button),
        options: []
      }));
  }

  async function enrichCustomDropdownsWithOptions(dropdowns) {
    for (const dropdown of dropdowns) {
      dropdown.options = (await openCustomDropdownAndCollectOptions(
        dropdown.button,
        dropdowns.map((item) => item.button)
      )).map(formatCustomDropdownOptionForLog);
      await closeCustomDropdown(dropdown.button);
    }
    debugLog("custom dropdown options extracted", {
      dropdowns: dropdowns.map(formatCustomDropdownForLog)
    });
  }

  function isLikelyCustomDropdownButton(button, root) {
    if (!button || isSensitiveOrHidden(button) || isDisabledControl(button)) {
      return false;
    }

    const text = cleanText(elementText(button));
    const ariaText = cleanText([
      button.getAttribute?.("aria-label") || "",
      button.getAttribute?.("title") || ""
    ].join(" "));
    const buttonText = cleanText(`${text} ${ariaText}`);

    const navigationText = cleanText(buttonText || collectVisibleText(button.closest?.("div") || button));
    if (isNextLikeNavigationText(navigationText) || isDangerousNavigationText(navigationText) || /zurück|back|prev|previous|назад/i.test(navigationText)) {
      return false;
    }

    const hasDropdownSignal = button.getAttribute?.("aria-haspopup") ||
      button.getAttribute?.("aria-expanded") !== null ||
      /chevron|select|dropdown|combobox|listbox/i.test(String(button.className || "")) ||
      Boolean(button.querySelector?.("svg"));
    const hasBlankSignal = !buttonText || /[_—-]{2,}/.test(buttonText) || Boolean(button.querySelector?.("span[class*='h-0.5'], span[class*='border']"));
    const hasFilledGapSignal = Boolean(buttonText) &&
      buttonText.length <= 80 &&
      Boolean(button.querySelector?.("svg")) &&
      /min-w|truncate|select-none|rounded/i.test(String(button.className || ""));
    const isInsideRoot = root.contains ? root.contains(button) : true;
    return Boolean(hasDropdownSignal && (hasBlankSignal || hasFilledGapSignal) && isInsideRoot);
  }

  function getCustomDropdownCurrentValue(button) {
    const text = cleanText(elementText(button));
    return /[_—-]{2,}/.test(text) ? "" : text;
  }

  function findCustomDropdownContext(button) {
    const container = button.closest?.("p, li, div, section, article") || button.parentElement;
    if (!container) {
      return "";
    }

    const clone = container.cloneNode(true);
    clone.querySelectorAll("button, input, select, textarea, script, style, svg").forEach((node) => node.remove());
    return cleanText(collectVisibleText(clone)).slice(0, 240);
  }

  function collectSelectOptions(select) {
    return Array.from(select.options || [])
      .map((option, originalIndex) => ({
        option,
        originalIndex,
        value: option.value,
        text: cleanText(option.textContent || option.label || option.value)
      }))
      .filter((item) => !item.option.disabled)
      .filter((item) => item.text && !/^(выберите|select|choose|--|—)/i.test(item.text));
  }

  function findSubject(doc) {
    const selectors = [
      ".page-header-headings h1",
      "header h1",
      "h1",
      ".breadcrumb",
      "nav[aria-label='Breadcrumb']"
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      const text = element ? collectVisibleText(element) : "";
      if (text.length > 2 && text.length < 200) {
        return text;
      }
    }

    return doc.title || "";
  }

  async function applyDemoAnswer(answer) {
    const diagnostics = createAutoApplyDiagnostics(answer);
    const answerText = cleanAnswer(answer);
    diagnostics.cleanAnswer = answerText;
    debugLog("auto-apply requested", {
      rawAnswer: answer,
      cleanAnswer: answerText,
      pageUrl: document.location.href
    });

    if (!answerText) {
      debugWarn("auto-apply aborted: empty answer", { rawAnswer: answer });
      throw createAutoApplyError("Нет ответа для выбора.", diagnostics);
    }

    const questionRoot = findQuestionRoot(document);
    if (!questionRoot) {
      diagnostics.failureReason = "question-root-not-found";
      debugWarn("auto-apply aborted: question root not found");
      throw createAutoApplyError("На демо-странице не найден текущий вопрос.", diagnostics);
    }

    diagnostics.questionRoot = describeElement(questionRoot);
    const beforeQuestionSignature = getCurrentQuestionSignature();
    const matches = findBestOptionMatches(questionRoot, answerText, diagnostics);
    if (matches.length === 0) {
      const selectResult = await applySelectAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature);
      if (selectResult) {
        return selectResult;
      }

      const customDropdownResult = await applyCustomDropdownAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature);
      if (customDropdownResult) {
        return customDropdownResult;
      }

      const matchingResult = await applyMatchingAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature);
      if (matchingResult) {
        return matchingResult;
      }

      const textInputResult = await applyTextInputAnswer(questionRoot, answerText, diagnostics, beforeQuestionSignature);
      if (textInputResult) {
        return textInputResult;
      }

      diagnostics.failureReason ||= "no-matching-option";
      debugWarn("auto-apply aborted: no matching option", diagnostics);
      throw createAutoApplyError("Не удалось сопоставить ответ с вариантом на демо-странице.", diagnostics);
    }

    const selectedMatches = normalizeMatchesForSelection(matches);
    diagnostics.matched = selectedMatches.map(formatCandidateForLog);
    debugLog("auto-apply matched options", {
      selected: selectedMatches.map((match) => ({
        index: match.index + 1,
        type: match.input.type,
        text: match.text,
        matchText: match.matchText,
        score: match.score,
        matchReason: match.matchReason
      }))
    });

    selectedMatches.forEach((match) => {
      match.choiceAction = applyChoiceInput(match.input);
    });
    diagnostics.choiceActions = selectedMatches.map((match) => ({
      index: match.index + 1,
      input: describeElement(match.input),
      action: match.choiceAction
    }));

    const advanceResult = await autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics);

    return {
      selectedText: selectedMatches.map((match) => match.text || match.matchText || `Вариант ${match.index + 1}`).join(", "),
      selectedCount: selectedMatches.length,
      advanced: advanceResult.advanced,
      advanceReason: advanceResult.reason,
      advanceControl: advanceResult.control,
      diagnostics
    };
  }

  async function applyTextInputAnswer(questionRoot, answerText, diagnostics, beforeQuestionSignature) {
    const textInput = findAnswerTextInput(questionRoot);
    diagnostics.textInput = describeElement(textInput);
    if (!textInput) {
      return null;
    }

    textInput.focus();
    textInput.value = answerText;
    textInput.dispatchEvent(new Event("input", { bubbles: true }));
    textInput.dispatchEvent(new Event("change", { bubbles: true }));

    diagnostics.matchMode = "text-input";
    diagnostics.failureReason = "";
    diagnostics.matched = {
      input: describeElement(textInput),
      value: answerText
    };

    debugLog("auto-apply filled text input", {
      input: describeElement(textInput),
      value: answerText
    });

    const advanceResult = await autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics);

    return {
      selectedText: answerText,
      selectedCount: 1,
      filledTextInput: true,
      advanced: advanceResult.advanced,
      advanceReason: advanceResult.reason,
      advanceControl: advanceResult.control,
      diagnostics
    };
  }

  async function applySelectAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature) {
    const selects = findAnswerSelects(questionRoot);
    diagnostics.selects = selects.map(formatSelectForLog);
    if (selects.length === 0) {
      return null;
    }

    const assignments = parseSelectAssignments(answerText, selects);
    diagnostics.selectAssignments = assignments;
    if (assignments.length === 0) {
      debugWarn("auto-apply select skipped: no parseable select assignments", {
        answerText,
        selects: diagnostics.selects
      });
      return null;
    }

    const actions = [];
    for (const assignment of assignments) {
      const select = selects[assignment.selectIndex - 1];
      if (!select) {
        actions.push({
          ...assignment,
          applied: false,
          reason: "select-not-found"
        });
        continue;
      }

      const selectableOptions = collectSelectOptions(select);
      const selectedOption = selectableOptions[assignment.optionIndex - 1];
      const beforeValue = select.value;
      const beforeSelectedIndex = select.selectedIndex;

      if (!selectedOption) {
        actions.push({
          ...assignment,
          applied: false,
          reason: "option-not-found",
          availableOptionCount: selectableOptions.length
        });
        continue;
      }

      select.focus();
      select.value = selectedOption.value;
      if (select.value !== selectedOption.value) {
        select.selectedIndex = selectedOption.originalIndex;
      }
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      actions.push({
        ...assignment,
        applied: true,
        select: describeElement(select),
        optionText: selectedOption.text,
        optionValue: selectedOption.value,
        beforeValue,
        beforeSelectedIndex,
        afterValue: select.value,
        afterSelectedIndex: select.selectedIndex
      });
    }

    diagnostics.matchMode = "select";
    diagnostics.failureReason = "";
    diagnostics.selectActions = actions;
    debugLog("auto-apply filled selects", {
      assignments,
      actions
    });

    const advanceResult = await autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics);

    return {
      selectedText: actions.filter((action) => action.applied).map((action) => `${action.selectIndex}=${action.optionText}`).join(", "),
      selectedCount: actions.filter((action) => action.applied).length,
      filledSelects: true,
      advanced: advanceResult.advanced,
      advanceReason: advanceResult.reason,
      advanceControl: advanceResult.control,
      diagnostics
    };
  }

  async function applyCustomDropdownAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature) {
    const dropdowns = findCustomDropdowns(questionRoot);
    diagnostics.customDropdowns = dropdowns.map(formatCustomDropdownForLog);
    if (dropdowns.length === 0) {
      return null;
    }

    const assignments = parseCustomDropdownAssignments(answerText, dropdowns);
    diagnostics.customDropdownAssignments = assignments;
    if (assignments.length === 0) {
      debugWarn("auto-apply custom dropdown skipped: no parseable assignments", {
        answerText,
        dropdowns: diagnostics.customDropdowns
      });
      return null;
    }

    const actions = [];
    for (const assignment of assignments) {
      const dropdown = dropdowns[assignment.dropdownIndex - 1];
      if (!dropdown) {
        actions.push({ ...assignment, applied: false, reason: "dropdown-not-found" });
        continue;
      }

      const beforeText = cleanText(elementText(dropdown.button));
      const options = await openCustomDropdownAndCollectOptions(
        dropdown.button,
        dropdowns.map((item) => item.button)
      );
      const selectedOption = findCustomDropdownOption(options, assignment);
      if (!selectedOption) {
        actions.push({
          ...assignment,
          applied: false,
          reason: "option-not-found",
          availableOptions: options.map(formatCustomDropdownOptionForLog)
        });
        await closeCustomDropdown(dropdown.button);
        continue;
      }

      selectedOption.element.click();
      await delay(120);
      actions.push({
        ...assignment,
        applied: true,
        dropdown: describeElement(dropdown.button),
        beforeText,
        afterText: cleanText(elementText(dropdown.button)),
        selectedOption: formatCustomDropdownOptionForLog(selectedOption)
      });
    }

    diagnostics.matchMode = "custom-dropdown";
    diagnostics.failureReason = "";
    diagnostics.customDropdownActions = actions;
    debugLog("auto-apply filled custom dropdowns", { assignments, actions });

    const appliedActions = actions.filter((action) => action.applied);
    if (appliedActions.length === 0) {
      return null;
    }

    const advanceResult = await autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics);
    return {
      selectedText: appliedActions.map((action) => `${action.dropdownIndex}=${action.selectedOption?.text || action.value}`).join(", "),
      selectedCount: appliedActions.length,
      filledCustomDropdowns: true,
      advanced: advanceResult.advanced,
      advanceReason: advanceResult.reason,
      advanceControl: advanceResult.control,
      diagnostics
    };
  }

  function parseCustomDropdownAssignments(answerText, dropdowns) {
    const value = cleanText(answerText);
    const explicitAssignments = Array.from(value.matchAll(/(?:dropdown|select|список|поле)?\s*(\d{1,2})\s*(?:=|:|-|→|->)\s*([^,;\n]+)/gi))
      .map((match) => ({
        dropdownIndex: Number(match[1]),
        value: cleanText(match[2]),
        optionIndex: /^\d+$/.test(cleanText(match[2])) ? Number(cleanText(match[2])) : 0
      }))
      .filter((assignment) => assignment.dropdownIndex > 0 && assignment.value);

    if (explicitAssignments.length > 0) {
      return dedupeCustomDropdownAssignments(explicitAssignments);
    }

    const commaValues = value.split(/[,;\n]+/).map(cleanText).filter(Boolean);
    if (commaValues.length === dropdowns.length) {
      return commaValues.map((item, index) => ({
        dropdownIndex: index + 1,
        value: item,
        optionIndex: /^\d+$/.test(item) ? Number(item) : 0
      }));
    }

    return [];
  }

  function dedupeCustomDropdownAssignments(assignments) {
    const seen = new Set();
    return assignments.filter((assignment) => {
      if (seen.has(assignment.dropdownIndex)) {
        return false;
      }
      seen.add(assignment.dropdownIndex);
      return true;
    });
  }

  async function openCustomDropdownAndCollectOptions(button, excludedButtons = []) {
    await closeAnyOpenCustomDropdown();
    const baselineElements = new Set(collectVisibleCustomDropdownOptionElements(button, excludedButtons));
    button.focus();
    button.click();
    await waitForCustomDropdownOptions(button, excludedButtons, baselineElements);
    return collectVisibleCustomDropdownOptions(button, excludedButtons, baselineElements);
  }

  function collectVisibleCustomDropdownOptions(button, excludedButtons = [], baselineElements = new Set()) {
    const excluded = new Set(excludedButtons);
    return collectVisibleCustomDropdownOptionElements(button, excludedButtons)
      .filter((element) => element !== button)
      .filter((element) => !excluded.has(element))
      .filter((element) => !baselineElements.has(element) || isInsideOpenDropdownContainer(element))
      .filter((element) => !button.contains(element))
      .filter((element) => !isSensitiveOrHidden(element) && !isDisabledControl(element))
      .filter((element) => isNearDropdownButton(button, element))
      .map((element, index) => ({
        element,
        index: index + 1,
        text: cleanText(elementText(element) || element.getAttribute?.("aria-label") || element.getAttribute?.("title") || ""),
        selector: buildDebugSelector(element)
      }))
      .filter((option) => option.text && option.text.length <= 120)
      .filter((option) => !isNavigationOptionText(option.text));
  }

  function collectVisibleCustomDropdownOptionElements(button, excludedButtons = []) {
    const excluded = new Set(excludedButtons);
    return Array.from(document.querySelectorAll("[role='option'], [role='menuitem'], [role='listbox'] button, [role='menu'] button, button"))
      .filter((element) => element !== button)
      .filter((element) => !excluded.has(element))
      .filter((element) => !button.contains(element))
      .filter((element) => !isSensitiveOrHidden(element) && !isDisabledControl(element))
      .filter((element) => !isNavigationOptionText(cleanText(elementText(element) || element.getAttribute?.("aria-label") || element.getAttribute?.("title") || "")));
  }

  function isInsideOpenDropdownContainer(element) {
    return Boolean(element.closest?.("[role='listbox'], [role='menu'], [data-radix-popper-content-wrapper], [data-headlessui-state]"));
  }

  function isNearDropdownButton(button, optionElement) {
    const buttonRect = getElementRect(button);
    const optionRect = getElementRect(optionElement);
    if (!buttonRect.width || !buttonRect.height || !optionRect.width || !optionRect.height) {
      return true;
    }

    const horizontalOverlap = optionRect.right >= buttonRect.left - 80 && optionRect.left <= buttonRect.right + 240;
    const verticalDistance = Math.min(
      Math.abs(optionRect.top - buttonRect.bottom),
      Math.abs(optionRect.bottom - buttonRect.top)
    );
    return horizontalOverlap && verticalDistance <= 520;
  }

  function findCustomDropdownOption(options, assignment) {
    if (assignment.optionIndex > 0) {
      return options[assignment.optionIndex - 1] || null;
    }

    const normalizedValue = normalizeForMatch(assignment.value);
    let best = null;
    let bestScore = 0;
    for (const option of options) {
      const normalizedOption = normalizeForMatch(option.text);
      const score = scoreOption(normalizedValue, normalizedOption);
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }

    return bestScore >= 0.6 ? best : null;
  }

  async function closeCustomDropdown(button) {
    const activeElement = document.activeElement || button;
    activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (button.getAttribute?.("aria-expanded") === "true") {
      button.click();
    }
    document.body?.click?.();
    await waitUntilCustomDropdownClosed(button);
  }

  async function closeAnyOpenCustomDropdown() {
    const expanded = Array.from(document.querySelectorAll("button[aria-expanded='true'], [role='button'][aria-expanded='true']"));
    for (const button of expanded) {
      await closeCustomDropdown(button);
    }
  }

  async function waitForCustomDropdownOptions(button, excludedButtons = [], baselineElements = new Set()) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const options = collectVisibleCustomDropdownOptions(button, excludedButtons, baselineElements);
      if (options.length > 0) {
        return options;
      }
      await delay(80);
    }
    return [];
  }

  async function waitUntilCustomDropdownClosed(button) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (button.getAttribute?.("aria-expanded") !== "true") {
        await delay(60);
        return;
      }
      await delay(80);
    }
  }

  function isNavigationOptionText(text) {
    return isNextLikeNavigationText(text) ||
      isDangerousNavigationText(text) ||
      /zurück|back|prev|previous|назад|anmelden|registrieren|login|register/i.test(text);
  }

  function formatCustomDropdownForLog(dropdown, index) {
      return {
      index: index + 1,
      context: dropdown.context,
      currentValue: dropdown.currentValue,
      options: Array.isArray(dropdown.options) ? dropdown.options : [],
      button: describeElement(dropdown.button),
      text: cleanText(elementText(dropdown.button))
    };
  }

  function formatCustomDropdownOptionForLog(option) {
    return {
      index: option.index,
      text: option.text,
      selector: option.selector
    };
  }

  async function applyMatchingAnswers(questionRoot, answerText, diagnostics, beforeQuestionSignature) {
    const group = findMatchingGroup(questionRoot);
    diagnostics.matchingGroup = group ? formatMatchingGroupForLog(group) : null;
    if (!group) {
      return null;
    }

    const assignments = parseMatchingAssignments(answerText);
    diagnostics.matchingAssignments = assignments;
    if (assignments.length === 0) {
      debugWarn("auto-apply matching skipped: no parseable assignments", {
        answerText,
        matchingGroup: diagnostics.matchingGroup
      });
      return null;
    }

    const actions = [];
    for (const assignment of assignments) {
      const left = group.leftItems.find((item) => item.label === assignment.leftLabel);
      const right = group.rightItems.find((item) => item.label === assignment.rightLabel);
      if (!left || !right) {
        actions.push({
          ...assignment,
          applied: false,
          reason: !left ? "left-item-not-found" : "right-item-not-found"
        });
        continue;
      }

      left.element.click();
      await delay(120);
      right.element.click();
      await delay(160);
      actions.push({
        ...assignment,
        applied: true,
        left: formatMatchingItemForLog(left),
        right: formatMatchingItemForLog(right)
      });
    }

    diagnostics.matchMode = "matching";
    diagnostics.failureReason = "";
    diagnostics.matchingActions = actions;
    debugLog("auto-apply matched pairs", { assignments, actions });

    const appliedActions = actions.filter((action) => action.applied);
    if (appliedActions.length === 0) {
      return null;
    }

    const advanceResult = await autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics);
    return {
      selectedText: appliedActions.map((action) => `${action.leftLabel}=${action.rightLabel}`).join(", "),
      selectedCount: appliedActions.length,
      filledMatching: true,
      advanced: advanceResult.advanced,
      advanceReason: advanceResult.reason,
      advanceControl: advanceResult.control,
      diagnostics
    };
  }

  function findMatchingGroup(root) {
    const leftItems = findMatchingItems(root, /^(\d{1,2})\s+(.{8,})$/);
    const rightItems = findMatchingItems(root, /^([A-ZА-Я])\s+(.{8,})$/i)
      .filter((item) => !/^[IVX]+$/i.test(item.label));
    if (leftItems.length < 2 || rightItems.length < 2) {
      return null;
    }

    return {
      leftItems: leftItems.slice(0, 12),
      rightItems: rightItems.slice(0, 12)
    };
  }

  function findMatchingItems(root, pattern) {
    const seen = new Set();
    const items = [];
    const candidates = Array.from(root.querySelectorAll("button, [role='button'], [role='option'], li, div"));
    for (const element of candidates) {
      if (isSensitiveOrHidden(element) || isLikelyPageChrome(element, String(element.className || ""))) {
        continue;
      }

      const rawText = collectVisibleText(element);
      const text = cleanText(rawText);
      const match = text.match(pattern);
      if (!match) {
        continue;
      }

      const label = cleanText(match[1]).toUpperCase();
      const itemText = cleanText(match[2]);
      if (!label || !itemText || seen.has(label) || itemText.length > 600) {
        continue;
      }

      seen.add(label);
      items.push({
        label,
        text: itemText,
        element
      });
    }

    return items;
  }

  function parseMatchingAssignments(answerText) {
    const assignments = Array.from(cleanText(answerText).matchAll(/(\d{1,2})\s*(?:=|:|-|→|->)\s*([A-ZА-Я])/gi))
      .map((match) => ({
        leftLabel: cleanText(match[1]).toUpperCase(),
        rightLabel: cleanText(match[2]).toUpperCase()
      }));
    const seen = new Set();
    return assignments.filter((assignment) => {
      if (seen.has(assignment.leftLabel)) {
        return false;
      }
      seen.add(assignment.leftLabel);
      return true;
    });
  }

  function formatMatchingGroupForLog(group) {
    return {
      leftItems: group.leftItems.map(formatMatchingItemForLog),
      rightItems: group.rightItems.map(formatMatchingItemForLog)
    };
  }

  function formatMatchingItemForLog(item) {
    return {
      label: item.label,
      text: item.text,
      element: describeElement(item.element)
    };
  }

  function parseSelectAssignments(answerText, selects) {
    const value = cleanText(answerText).toLowerCase();
    const explicitAssignments = Array.from(value.matchAll(/(?:select|список|поле)?\s*(\d{1,2})\s*(?:=|:|-|→|->)\s*(\d{1,2})/gi))
      .map((match) => ({
        selectIndex: Number(match[1]),
        optionIndex: Number(match[2])
      }))
      .filter((assignment) => assignment.selectIndex > 0 && assignment.optionIndex > 0);

    if (explicitAssignments.length > 0) {
      return dedupeSelectAssignments(explicitAssignments);
    }

    const numbers = parseAnswerOptionNumbers(answerText);
    if (numbers.length === selects.length) {
      return numbers.map((optionIndex, index) => ({
        selectIndex: index + 1,
        optionIndex
      }));
    }

    return [];
  }

  function dedupeSelectAssignments(assignments) {
    const seen = new Set();
    return assignments.filter((assignment) => {
      if (seen.has(assignment.selectIndex)) {
        return false;
      }
      seen.add(assignment.selectIndex);
      return true;
    });
  }

  function formatSelectForLog(select, index) {
    return {
      index: index + 1,
      prompt: findSelectPromptText(select),
      select: describeElement(select),
      value: select.value,
      selectedIndex: select.selectedIndex,
      options: collectSelectOptions(select).map((option, optionIndex) => ({
        index: optionIndex + 1,
        text: option.text,
        value: option.value,
        originalIndex: option.originalIndex
      }))
    };
  }

  async function autoAdvanceIfNeeded(beforeQuestionSignature, diagnostics) {
    debugLog("auto-advance scheduled", {
      delayMs: AUTO_ADVANCE_DELAY_MS,
      beforeQuestionSignature: summarizeSignature(beforeQuestionSignature)
    });

    await delay(AUTO_ADVANCE_DELAY_MS);

    const afterQuestionSignature = getCurrentQuestionSignature();
    const beforeUrl = parseUrlFromQuestionSignature(beforeQuestionSignature);
    const afterUrl = document.location.href;
    diagnostics.advance = {
      delayMs: AUTO_ADVANCE_DELAY_MS,
      beforeUrl,
      afterUrl,
      beforeQuestionSignature,
      afterQuestionSignature,
      beforeQuestionSignatureSummary: summarizeSignature(beforeQuestionSignature),
      afterQuestionSignatureSummary: summarizeSignature(afterQuestionSignature),
      candidates: [],
      clicked: null,
      reason: ""
    };

    debugLog("auto-advance checking page state", {
      beforeQuestionSignature: diagnostics.advance.beforeQuestionSignatureSummary,
      afterQuestionSignature: diagnostics.advance.afterQuestionSignatureSummary,
      urlChanged: Boolean(beforeUrl && afterUrl && beforeUrl !== afterUrl)
    });

    if (beforeUrl && afterUrl && beforeUrl !== afterUrl) {
      diagnostics.advance.reason = "url-already-changed";
      debugLog("auto-advance skipped: url already changed", diagnostics.advance);
      return { advanced: true, reason: "url-already-changed", control: null };
    }

    debugLog("auto-advance searching navigation controls");
    const navigationCandidates = collectNavigationCandidates(document);
    diagnostics.advance.candidates = navigationCandidates.map(formatNavigationCandidateForLog);
    debugLog("auto-advance navigation candidates", {
      count: diagnostics.advance.candidates.length,
      candidates: diagnostics.advance.candidates
    });

    const nextControl = navigationCandidates.find((candidate) => candidate.isSafeNext) || null;
    if (!nextControl) {
      diagnostics.advance.reason = "safe-next-control-not-found";
      debugWarn("auto-advance skipped: safe next control not found", diagnostics.advance);
      return { advanced: false, reason: "safe-next-control-not-found", control: null };
    }

    const controlDetails = formatNavigationCandidateForLog(nextControl);
    diagnostics.advance.clicked = controlDetails;
    diagnostics.advance.reason = "clicked-safe-next-control";
    diagnostics.advance.clickAttempt = createAdvanceClickAttempt(nextControl);
    debugLog("auto-advance clicking safe next control", {
      control: controlDetails,
      clickAttempt: diagnostics.advance.clickAttempt
    });
    nextControl.element.click();
    diagnostics.advance.clickAttempt.clickCalled = true;

    await delay(AUTO_ADVANCE_AFTER_CLICK_DELAY_MS);
    diagnostics.advance.clickAttempt.afterClickUrl = document.location.href;
    diagnostics.advance.clickAttempt.afterClickQuestionSignature = getCurrentQuestionSignature();
    diagnostics.advance.clickAttempt.afterClickQuestionSignatureSummary = summarizeSignature(diagnostics.advance.clickAttempt.afterClickQuestionSignature);
    diagnostics.advance.clickAttempt.changedAfterClick = didQuestionOrUrlChange(
      diagnostics.advance.clickAttempt.beforeClickUrl,
      diagnostics.advance.clickAttempt.beforeClickQuestionSignature,
      diagnostics.advance.clickAttempt.afterClickUrl,
      diagnostics.advance.clickAttempt.afterClickQuestionSignature
    );
    debugLog("auto-advance click result", diagnostics.advance.clickAttempt);

    if (!diagnostics.advance.clickAttempt.changedAfterClick && canSubmitViaForm(nextControl.element)) {
      diagnostics.advance.clickAttempt.requestSubmitAttempted = true;
      debugWarn("auto-advance click did not change page, trying requestSubmit fallback", diagnostics.advance.clickAttempt);
      nextControl.element.form.requestSubmit(nextControl.element);

      await delay(AUTO_ADVANCE_AFTER_CLICK_DELAY_MS);
      diagnostics.advance.clickAttempt.afterRequestSubmitUrl = document.location.href;
      diagnostics.advance.clickAttempt.afterRequestSubmitQuestionSignature = getCurrentQuestionSignature();
      diagnostics.advance.clickAttempt.afterRequestSubmitQuestionSignatureSummary = summarizeSignature(diagnostics.advance.clickAttempt.afterRequestSubmitQuestionSignature);
      diagnostics.advance.clickAttempt.changedAfterRequestSubmit = didQuestionOrUrlChange(
        diagnostics.advance.clickAttempt.beforeClickUrl,
        diagnostics.advance.clickAttempt.beforeClickQuestionSignature,
        diagnostics.advance.clickAttempt.afterRequestSubmitUrl,
        diagnostics.advance.clickAttempt.afterRequestSubmitQuestionSignature
      );
      debugLog("auto-advance requestSubmit result", diagnostics.advance.clickAttempt);
    }

    return {
      advanced: true,
      reason: "clicked-safe-next-control",
      control: controlDetails
    };
  }

  function findSafeNextControl(doc) {
    return collectNavigationCandidates(doc)
      .find((candidate) => candidate.isSafeNext) || null;
  }

  function collectNavigationCandidates(doc) {
    const elements = Array.from(doc.querySelectorAll([
      "button",
      "input[type='button']",
      "input[type='submit']",
      "a",
      "[role='button']"
    ].join(",")));

    return elements
      .filter((element) => !isSensitiveOrHidden(element) && !isDisabledControl(element))
      .map((element, index) => {
        const text = cleanText([
          elementText(element),
          element.getAttribute?.("aria-label") || "",
          element.getAttribute?.("title") || ""
        ].join(" "));
        return {
          element,
          index,
          text,
          selector: buildDebugSelector(element),
          tagName: element.tagName,
          type: element.getAttribute?.("type") || "",
          isDangerous: isDangerousNavigationText(text),
          isNextLike: isNextLikeNavigationText(text)
        };
      })
      .map((candidate) => ({
        ...candidate,
        isSafeNext: candidate.isNextLike && !candidate.isDangerous,
        decisionReason: explainNavigationCandidate(candidate)
      }));
  }

  function isDisabledControl(element) {
    return Boolean(element.disabled || element.getAttribute?.("aria-disabled") === "true");
  }

  function createAdvanceClickAttempt(candidate) {
    const element = candidate.element;
    const form = element.form || element.closest?.("form") || null;
    const beforeClickQuestionSignature = getCurrentQuestionSignature();

    return {
      control: formatNavigationCandidateForLog(candidate),
      beforeClickUrl: document.location.href,
      beforeClickQuestionSignature,
      beforeClickQuestionSignatureSummary: summarizeSignature(beforeClickQuestionSignature),
      form: describeElement(form),
      formAction: form?.getAttribute?.("action") || "",
      formMethod: form?.getAttribute?.("method") || "",
      clickCalled: false,
      afterClickUrl: "",
      afterClickQuestionSignature: "",
      afterClickQuestionSignatureSummary: "",
      changedAfterClick: false,
      requestSubmitAvailable: typeof form?.requestSubmit === "function",
      requestSubmitAttempted: false,
      afterRequestSubmitUrl: "",
      afterRequestSubmitQuestionSignature: "",
      afterRequestSubmitQuestionSignatureSummary: "",
      changedAfterRequestSubmit: false
    };
  }

  function canSubmitViaForm(element) {
    const form = element.form || element.closest?.("form") || null;
    return Boolean(form && typeof form.requestSubmit === "function" && element instanceof HTMLElement);
  }

  function didQuestionOrUrlChange(beforeUrl, beforeSignature, afterUrl, afterSignature) {
    if (beforeUrl && afterUrl && beforeUrl !== afterUrl) {
      return true;
    }
    if (beforeSignature && afterSignature && beforeSignature !== afterSignature) {
      return true;
    }
    return false;
  }

  function isDangerousNavigationText(text) {
    return /заверш|finish|end attempt|submit all|отправить\s+(всё|все)|сдать|проверить|итог|review/i.test(text);
  }

  function isNextLikeNavigationText(text) {
    const normalizedText = cleanText(text).toLowerCase();
    if (!normalizedText) {
      return false;
    }

    const nextMarkers = [
      "далее",
      "следующ",
      "next",
      "continue",
      "продолжить",
      "сохранить и перейти",
      "save and next",
      "next page"
    ];

    return nextMarkers.some((marker) =>
      normalizedText === marker ||
      normalizedText.startsWith(`${marker} `) ||
      normalizedText.includes(marker)
    );
  }

  function formatNavigationCandidateForLog(candidate) {
    return {
      index: candidate.index + 1,
      text: candidate.text,
      selector: candidate.selector,
      tagName: candidate.tagName,
      type: candidate.type,
      isNextLike: candidate.isNextLike,
      isDangerous: candidate.isDangerous,
      isSafeNext: candidate.isSafeNext,
      decisionReason: candidate.decisionReason
    };
  }

  function explainNavigationCandidate(candidate) {
    if (candidate.isDangerous) {
      return "rejected-dangerous-text";
    }

    if (!candidate.isNextLike) {
      return "rejected-not-next-like";
    }

    return "accepted-safe-next";
  }

  function summarizeSignature(signature = "") {
    return String(signature).slice(0, 280);
  }

  function getCurrentQuestionSignature() {
    return [
      document.location.href,
      buildVisibleQuestionSignature(document).value
    ].join("::");
  }

  function parseUrlFromQuestionSignature(signature = "") {
    return String(signature).split("::")[0] || "";
  }

  function getQuestionNumber(questionRoot) {
    const questionNumber = questionRoot.querySelector?.(".qno, .no");
    return questionNumber ? collectVisibleText(questionNumber) : "";
  }

  function buildVisibleQuestionSignature(doc) {
    const root = findMainInteractiveRegion(doc) || findQuestionRoot(doc) || doc.body;
    const visibleText = limitText(collectVisibleText(root), 5000);
    const interactiveParts = collectInteractiveSignatureParts(root);
    const structuralParts = collectStructuralSignatureParts(root);
    const audioParts = collectAudioSources(root, doc).map((source) => `${source.src}:${source.type}`);
    const normalized = normalizeSignatureText([
      root.tagName || "",
      root.id || "",
      visibleText,
      interactiveParts.join("|"),
      structuralParts.join("|"),
      audioParts.join("|")
    ].join("::"));
    const hash = hashText(normalized);

    return {
      value: hash,
      summary: normalized.slice(0, 420),
      details: {
        root: describeElement(root),
        textLength: visibleText.length,
        interactiveCount: interactiveParts.length,
        structuralCount: structuralParts.length,
        audioCount: audioParts.length,
        hash
      }
    };
  }

  function findMainInteractiveRegion(doc) {
    const selectors = [
      ".que",
      ".question",
      "[id*='question']",
      "[class*='question']",
      "form[action*='quiz']",
      "form",
      "main",
      "[role='main']",
      "section",
      "article",
      "div"
    ];
    const seen = new Set();
    const candidates = [];

    for (const selector of selectors) {
      for (const element of Array.from(doc.querySelectorAll(selector))) {
        if (seen.has(element) || isSensitiveOrHidden(element)) {
          continue;
        }
        seen.add(element);
        const score = scoreInteractiveRegion(element);
        if (score > 0) {
          candidates.push({ element, score });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function scoreInteractiveRegion(element) {
    const text = collectVisibleText(element);
    const controls = countVisibleInteractiveElements(element);
    const rect = getElementRect(element);
    const className = String(element.className || "");
    const tagName = String(element.tagName || "").toLowerCase();

    let score = 0;
    if (text.length > 40) score += 3;
    if (text.length > 120) score += 2;
    if (controls > 0) score += 5;
    if (controls >= 3) score += 3;
    if (rect.width > 240 && rect.height > 100) score += 2;
    if (isNearViewportCenter(rect)) score += 2;
    if (/^(main|form|section|article)$/i.test(tagName)) score += 1;
    if (isLikelyPageChrome(element, className)) score -= 10;
    if (text.length > 7000 && controls < 3) score -= 5;

    return score;
  }

  function collectInteractiveSignatureParts(root) {
    return Array.from(root.querySelectorAll([
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='radio']",
      "[role='checkbox']",
      "[role='option']"
    ].join(",")))
      .filter((element) => !isSensitiveOrHidden(element))
      .map((element) => normalizeSignatureText([
        element.tagName || "",
        element.getAttribute?.("type") || "",
        element.getAttribute?.("role") || "",
        elementText(element) || element.getAttribute?.("aria-label") || element.getAttribute?.("title") || "",
        getControlState(element)
      ].join(":")))
      .filter(Boolean)
      .slice(0, 120);
  }

  function collectStructuralSignatureParts(root) {
    return [
      `choices:${findChoiceInputs(root).length}`,
      `selects:${findAnswerSelects(root).length}`,
      `customDropdowns:${findCustomDropdowns(root).length}`,
      `matching:${findMatchingGroup(root) ? 1 : 0}`,
      `textInputs:${root.querySelectorAll("input[type='text'], input[type='number'], textarea").length}`,
      `buttons:${Array.from(root.querySelectorAll("button, [role='button']")).filter((element) => !isSensitiveOrHidden(element)).length}`
    ];
  }

  function countVisibleInteractiveElements(root) {
    return Array.from(root.querySelectorAll("button, input, select, textarea, [role='button'], [role='radio'], [role='checkbox'], [role='option']"))
      .filter((element) => !isSensitiveOrHidden(element))
      .length;
  }

  function getControlState(element) {
    const parts = [];
    if (element.checked) parts.push("checked");
    if (element.disabled || isDisabledControl(element)) parts.push("disabled");
    if (element.value && /^(input|textarea|select)$/i.test(element.tagName || "")) parts.push(`value=${element.value}`);
    if (element.selectedIndex >= 0) parts.push(`selected=${element.selectedIndex}`);
    return parts.join(",");
  }

  function isLikelyPageChrome(element, className = "") {
    const selector = "nav, header, footer, aside";
    if (element.matches?.(selector) || element.closest?.(selector)) {
      return true;
    }

    return /cookie|consent|banner|modal|menu|navbar|footer|header|breadcrumb|sidebar|drawer/i.test(className);
  }

  function getElementRect(element) {
    if (!element?.getBoundingClientRect) {
      return { width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };
    }

    return element.getBoundingClientRect();
  }

  function isNearViewportCenter(rect) {
    const viewportWidth = document.defaultView?.innerWidth || 0;
    const viewportHeight = document.defaultView?.innerHeight || 0;
    if (!viewportWidth || !viewportHeight || !rect.width || !rect.height) {
      return false;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return centerX > viewportWidth * 0.15 &&
      centerX < viewportWidth * 0.85 &&
      centerY > viewportHeight * 0.12 &&
      centerY < viewportHeight * 0.88;
  }

  function normalizeSignatureText(value = "") {
    return cleanText(value).toLowerCase();
  }

  function hashText(value = "") {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `qsa-${(hash >>> 0).toString(36)}`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findAnswerTextInput(questionRoot) {
    const textInputs = Array.from(questionRoot.querySelectorAll([
      "input[type='text']",
      "input[type='number']",
      "input:not([type])",
      "textarea"
    ].join(",")))
      .filter((input) => input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
      .filter((input) => !input.disabled && !input.readOnly && !isSensitiveOrHidden(input));

    return textInputs[0] || null;
  }

  function normalizeMatchesForSelection(matches) {
    const selected = [];
    const seenRadioGroups = new Set();

    for (const match of matches) {
      if (!(match.input instanceof HTMLInputElement)) {
        continue;
      }

      if (match.input.type !== "radio") {
        selected.push(match);
        continue;
      }

      const groupKey = match.input.name || `__radio_${match.index}`;
      if (seenRadioGroups.has(groupKey)) {
        continue;
      }

      seenRadioGroups.add(groupKey);
      selected.push(match);
    }

    return selected;
  }

  function applyChoiceInput(input) {
    const beforeChecked = input.checked;
    const inputType = input.type;
    let clickAttempted = false;
    let fallbackApplied = false;

    if (inputType === "checkbox") {
      if (!input.checked) {
        input.click();
        clickAttempted = true;
      }

      if (!input.checked) {
        input.checked = true;
        fallbackApplied = true;
      }
    } else {
      if (!input.checked) {
        input.click();
        clickAttempted = true;
      }

      if (!input.checked) {
        input.checked = true;
        fallbackApplied = true;
      }
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return {
      type: inputType,
      beforeChecked,
      afterChecked: input.checked,
      clickAttempted,
      fallbackApplied
    };
  }

  function findBestOptionMatches(root, answer, diagnostics = null) {
    const normalizedAnswer = normalizeForMatch(answer);
    if (diagnostics) {
      diagnostics.normalizedAnswer = normalizedAnswer;
      diagnostics.parsedAnswerNumbers = parseAnswerOptionNumbers(answer);
    }

    const candidates = findChoiceInputs(root)
      .map((input, index) => {
        const text = cleanText(findInputOptionText(input));
        const imageSources = findInputOptionImageSources(input);
        return {
          input,
          index,
          text,
          imageSources,
          matchText: cleanText(formatOptionForPrompt(text, imageSources, index + 1)),
          inputDetails: describeElement(input),
          optionRoot: describeElement(findInputOptionRoot(input))
        };
      });

    if (diagnostics) {
      diagnostics.candidateCount = candidates.length;
      diagnostics.candidates = candidates.map(formatCandidateForLog);
    }

    debugLog("auto-apply candidates", {
      answer,
      normalizedAnswer,
      candidates: candidates.map(formatCandidateForLog)
    });

    const indexedMatches = findOptionMatchesByIndex(answer, candidates);
    if (indexedMatches.length > 0) {
      indexedMatches.forEach((match) => {
        match.score = 1;
        match.matchReason = "answer-number";
      });
      if (diagnostics) {
        diagnostics.matchMode = "answer-number";
        diagnostics.matched = indexedMatches.map(formatCandidateForLog);
      }
      debugLog("auto-apply matched by answer number", {
        requestedOptions: indexedMatches.map((match) => match.index + 1),
        candidates: indexedMatches.map(formatCandidateForLog)
      });
      return indexedMatches;
    }

    let best = null;
    let bestScore = 0;

    for (const candidate of candidates.filter((item) => item.matchText)) {
      const normalizedOption = normalizeForMatch(candidate.matchText);
      const score = scoreOptionMatch(normalizedAnswer, normalizedOption);
      candidate.score = score;
      candidate.normalizedOption = normalizedOption;
      candidate.matchReason = explainScore(normalizedAnswer, normalizedOption, score);
      if (diagnostics?.candidates?.[candidate.index]) {
        diagnostics.candidates[candidate.index] = formatCandidateForLog(candidate);
      }
      debugLog("auto-apply candidate scored", {
        candidate: formatCandidateForLog(candidate),
        normalizedOption,
        score,
        reason: candidate.matchReason
      });
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (bestScore >= 0.65) {
      if (diagnostics) {
        diagnostics.matchMode = "text-score";
        diagnostics.threshold = 0.65;
        diagnostics.best = formatCandidateForLog(best);
        diagnostics.bestScore = bestScore;
        diagnostics.matched = [formatCandidateForLog(best)];
      }
      debugLog("auto-apply matched by text score", {
        threshold: 0.65,
        best: formatCandidateForLog(best),
        score: bestScore,
        reason: best.matchReason
      });
      return [best];
    }

    debugWarn("auto-apply no candidate reached threshold", {
      threshold: 0.65,
      best: best ? formatCandidateForLog(best) : null,
      bestScore,
      candidates: candidates.map(formatCandidateForLog)
    });
    if (diagnostics) {
      diagnostics.failureReason = candidates.length === 0 ? "no-radio-or-checkbox-candidates" : "score-below-threshold";
      diagnostics.threshold = 0.65;
      diagnostics.best = best ? formatCandidateForLog(best) : null;
      diagnostics.bestScore = bestScore;
      diagnostics.candidates = candidates.map(formatCandidateForLog);
    }
    return [];
  }

  function findOptionMatchesByIndex(answer, candidates) {
    const optionNumbers = parseAnswerOptionNumbers(answer);
    if (optionNumbers.length === 0) {
      return [];
    }

    return optionNumbers
      .map((optionNumber) => candidates.find((candidate) => candidate.index === optionNumber - 1))
      .filter(Boolean);
  }

  function parseAnswerOptionNumbers(answer) {
    const value = cleanText(answer).toLowerCase();
    const strippedValue = value
      .replace(/^(?:варианты|вариант|options|option|answers|answer|ответы|ответ|номера|номер|№|#)\s*/i, "")
      .replace(/[()[\]{}]/g, " ");

    if (!/\d/.test(strippedValue)) {
      return [];
    }

    return Array.from(new Set(
      strippedValue
        .split(/(?:\s*(?:,|;|\/|\+|&|и|and)\s*)|\s+/i)
        .map((part) => part.match(/^\d{1,2}[).:-]?$/)?.[0]?.match(/\d{1,2}/)?.[0] || "")
        .filter(Boolean)
        .map(Number)
        .filter((number) => number > 0)
    ));
  }

  function scoreOptionMatch(answer, option) {
    if (!answer || !option) {
      return 0;
    }

    if (answer === option) {
      return 1;
    }

    if (answer.includes(option) || option.includes(answer)) {
      return 0.85;
    }

    const answerWords = new Set(answer.split(" ").filter((word) => word.length > 2));
    const optionWords = option.split(" ").filter((word) => word.length > 2);
    if (answerWords.size === 0 || optionWords.length === 0) {
      return 0;
    }

    const matchedWords = optionWords.filter((word) => answerWords.has(word)).length;
    return matchedWords / optionWords.length;
  }

  function explainScore(answer, option, score) {
    if (!answer || !option) {
      return "empty-answer-or-option";
    }

    if (answer === option) {
      return "exact-match";
    }

    if (answer.includes(option) || option.includes(answer)) {
      return "substring-match";
    }

    return `word-overlap-${score.toFixed(2)}`;
  }

  function formatCandidateForLog(candidate) {
    return {
      index: candidate.index + 1,
      text: candidate.text,
      matchText: candidate.matchText,
      imageSources: candidate.imageSources,
      score: candidate.score,
      matchReason: candidate.matchReason,
      normalizedOption: candidate.normalizedOption,
      input: candidate.inputDetails,
      optionRoot: candidate.optionRoot
    };
  }

  function createAutoApplyDiagnostics(answer) {
    return {
      pageUrl: document.location.href,
      rawAnswer: answer,
      cleanAnswer: "",
      normalizedAnswer: "",
      parsedAnswerNumbers: [],
      candidateCount: 0,
      candidates: [],
      threshold: 0.65,
      best: null,
      bestScore: 0,
      matchMode: "",
      matched: null,
      failureReason: ""
    };
  }

  function createAutoApplyError(message, diagnostics) {
    const error = new Error(message);
    error.diagnostics = diagnostics;
    return error;
  }

  function describeElement(element) {
    if (!element) {
      return null;
    }

    return {
      tagName: element.tagName,
      id: element.id || "",
      name: element.getAttribute?.("name") || "",
      type: element.getAttribute?.("type") || "",
      className: typeof element.className === "string" ? element.className : "",
      selector: buildDebugSelector(element)
    };
  }

  function buildDebugSelector(element) {
    if (!element) {
      return "";
    }

    const tagName = element.tagName ? element.tagName.toLowerCase() : "element";
    if (element.id) {
      return `${tagName}#${cssEscape(element.id)}`;
    }

    const name = element.getAttribute?.("name");
    if (name) {
      return `${tagName}[name="${cssEscape(name)}"]`;
    }

    const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    return className.length ? `${tagName}.${className.map(cssEscape).join(".")}` : tagName;
  }

  function collectVisibleText(root) {
    if (!root) {
      return "";
    }

    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        if (isSensitiveOrHidden(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const parts = [];
    while (walker.nextNode()) {
      parts.push(walker.currentNode.nodeValue);
    }

    return cleanText(parts.join(" "));
  }

  function isSensitiveOrHidden(element) {
    const blockedSelector = [
      "script",
      "style",
      "noscript",
      "template",
      "input[type='password']",
      "[type='password']",
      "[aria-hidden='true']",
      "[hidden]"
    ].join(",");

    if (element.closest(blockedSelector)) {
      return true;
    }

    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
  }

  function elementText(element) {
    if (element instanceof HTMLInputElement) {
      return element.value || element.getAttribute("aria-label") || "";
    }
    return collectVisibleText(element);
  }

  function cleanText(value = "") {
    return String(value)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanAnswer(value = "") {
    return cleanText(value)
      .replace(/^ответ\s*[:：-]\s*/i, "")
      .replace(/^["'«»]+|["'«»]+$/g, "");
  }

  function normalizeForMatch(value = "") {
    return cleanText(value)
      .toLowerCase()
      .replace(/[.,;:!?()[\]{}"'«»]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function limitText(value) {
    return cleanText(value).slice(0, MAX_TEXT_LENGTH);
  }

  const __qsaLogBuffer = [];

  function debugLog(message, details) {
    __qsaLogBuffer.push({ level: "log", source: LOG_PREFIX, message, details: details ?? null });
  }

  function debugWarn(message, details) {
    __qsaLogBuffer.push({ level: "warn", source: LOG_PREFIX, message, details: details ?? null });
  }

  function flushLogEvents() {
    return __qsaLogBuffer.splice(0);
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
