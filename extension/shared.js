(function initializeQuizStudyAssistantShared() {
  const DEFAULT_MODEL = "gpt-5.4-mini";
  const DEFAULT_ECONOMY_MODEL = "gpt-5.4-nano";
  const DEFAULT_ECONOMY_MODE = true;
  const DEFAULT_AUTO_APPLY_ALLOWED_URLS = [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*",
    "https://edu.rosdistant.ru/mod/quiz/*",
    "file://*/demo/quiz.html"
  ].join("\n");

  const shared = {
    DEFAULT_MODEL,
    DEFAULT_ECONOMY_MODEL,
    DEFAULT_ECONOMY_MODE,
    DEFAULT_AUTO_APPLY_ALLOWED_URLS,
    normalizeAllowedUrls,
    parseAllowedUrlPatterns,
    isUrlAllowedForAutoApply
  };

  globalThis.QuizStudyAssistantShared = shared;
  if (globalThis.window) {
    globalThis.window.QuizStudyAssistantShared = shared;
  }

  function normalizeAllowedUrls(value) {
    return parseAllowedUrlPatterns(value).join("\n");
  }

  function parseAllowedUrlPatterns(value = "") {
    return String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function isUrlAllowedForAutoApply(url, allowedUrls) {
    if (!url) {
      return false;
    }

    return parseAllowedUrlPatterns(allowedUrls).some((pattern) => globMatches(pattern, url));
  }

  function globMatches(pattern, value) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }
})();
