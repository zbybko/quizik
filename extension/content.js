(function initializeQuizStudyAssistant() {
  const EXTRACT_MESSAGE_TYPE = "QSA_EXTRACT_QUESTION";
  const APPLY_DEMO_ANSWER_MESSAGE_TYPE = "QSA_APPLY_DEMO_ANSWER";
  const MAX_TEXT_LENGTH = 6000;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === EXTRACT_MESSAGE_TYPE) {
      try {
        const payload = extractQuizContext(document);
        sendResponse({ ok: true, result: payload });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Не удалось прочитать страницу."
        });
      }

      return false;
    }

    if (message?.type === APPLY_DEMO_ANSWER_MESSAGE_TYPE) {
      try {
        const result = applyDemoAnswer(message.payload?.answer || "");
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Не удалось выбрать ответ в демо."
        });
      }

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

  function extractQuizContext(doc) {
    const questionRoot = findQuestionRoot(doc);
    const source = questionRoot || doc.body;
    const question = collectQuestionText(source);
    const options = collectAnswerOptions(source);

    return {
      isQuizPage: isLikelyQuizPage(doc),
      subject: findSubject(doc),
      question,
      options,
      pageTitle: doc.title || "",
      pageUrl: doc.location?.href || ""
    };
  }

  function isLikelyQuizPage(doc) {
    const url = doc.location?.href?.toLowerCase() || "";
    if (/(quiz|test|attempt|control|mod\/quiz|тест|контроль)/i.test(url)) {
      return true;
    }

    const hasQuestionText = Boolean(findQuestionRoot(doc));
    const hasChoiceInputs = doc.querySelectorAll("input[type='radio'], input[type='checkbox']").length > 1;
    const hasSubmit = Array.from(doc.querySelectorAll("button, input[type='submit']"))
      .some((element) => /отправить|submit|finish|next|далее|проверить/i.test(elementText(element)));

    return hasQuestionText && (hasChoiceInputs || hasSubmit);
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
        const choiceCount = element.querySelectorAll("input[type='radio'], input[type='checkbox']").length;
        return text.length > 20 && (choiceCount > 1 || /вопрос|question|ответ|answer/i.test(text));
      });

      if (match) {
        return match;
      }
    }

    return null;
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

  function collectAnswerOptions(root) {
    const options = [];
    const seen = new Set();
    const choiceInputs = Array.from(root.querySelectorAll("input[type='radio'], input[type='checkbox']"));

    for (const input of choiceInputs) {
      const optionText = findInputOptionText(input);
      addOption(optionText);
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

  function findInputOptionText(input) {
    const label = input.id ? input.ownerDocument.querySelector(`label[for="${cssEscape(input.id)}"]`) : null;
    if (label) {
      return collectVisibleText(label);
    }

    const wrappedLabel = input.closest("label");
    if (wrappedLabel) {
      return collectVisibleText(wrappedLabel);
    }

    const optionContainer = input.closest(".answer, .r0, .r1, li, p, div");
    if (optionContainer) {
      return collectVisibleText(optionContainer);
    }

    return "";
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

  function applyDemoAnswer(answer) {
    const answerText = cleanAnswer(answer);
    if (!answerText) {
      throw new Error("Нет ответа для выбора.");
    }

    const questionRoot = findQuestionRoot(document);
    if (!questionRoot) {
      throw new Error("На демо-странице не найден текущий вопрос.");
    }

    const match = findBestOptionMatch(questionRoot, answerText);
    if (!match?.input) {
      throw new Error("Не удалось сопоставить ответ с вариантом на демо-странице.");
    }

    match.input.checked = true;
    match.input.click();
    match.input.dispatchEvent(new Event("change", { bubbles: true }));

    const nextButton = questionRoot.querySelector("[data-demo-next]");
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.click();
    }

    return {
      selectedText: match.text,
      advanced: Boolean(nextButton)
    };
  }

  function findBestOptionMatch(root, answer) {
    const normalizedAnswer = normalizeForMatch(answer);
    const candidates = Array.from(root.querySelectorAll("input[type='radio'], input[type='checkbox']"))
      .map((input) => ({
        input,
        text: cleanText(findInputOptionText(input))
      }))
      .filter((candidate) => candidate.text);

    let best = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const normalizedOption = normalizeForMatch(candidate.text);
      const score = scoreOptionMatch(normalizedAnswer, normalizedOption);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return bestScore >= 0.65 ? best : null;
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

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
