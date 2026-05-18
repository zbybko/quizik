import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });
function renderMarkdown(text) {
  const html = marked.parse(text || "", { async: false });
  return DOMPurify.sanitize(html);
}

const AUTO_LOOP_DELAY_MS = 1200;
const AUTO_LOOP_MAX_ITERATIONS = 50;

const SUGGESTIONS = [
  "Break down the current question for me",
  "Explain the key concept in simple terms",
  "Which options are definitely wrong, and why?"
];

const queryParams = new URLSearchParams(window.location.search);
const standaloneTargetTabId = Number(queryParams.get("targetTabId"));
const isStandaloneWindow = queryParams.get("standalone") === "1";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const err = new Error(response?.error || "Failed to read the page.");
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
  throw new Error("Reload the quiz page and try again.");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(error.message)); return; }
      printForwardedEvents(message?.type, response);
      if (!response?.ok) {
        reject(new Error(response?.error || "Request failed."));
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
    if (!tab?.windowId) { reject(new Error("Could not determine the tab window for screenshot.")); return; }
    chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(`Screenshot failed: ${error.message}`)); return; }
      resolve(dataUrl || "");
    });
  });
}

function modeLabel(mode, auto) {
  if (mode === "answer" && auto) return "Auto";
  if (mode === "answer") return "Answer";
  return "Chat";
}

export default function App() {
  const [status, setStatus] = useState("Ready");
  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answerMode, setAnswerMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [detected, setDetected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  const messagesRef = useRef(null);
  // refs to read latest mode flags inside async loops without retriggering
  const answerModeRef = useRef(answerMode);
  const autoModeRef = useRef(autoMode);
  useEffect(() => { answerModeRef.current = answerMode; }, [answerMode]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);

  useEffect(() => {
    document.body.classList.toggle("standalone", isStandaloneWindow);
    refreshSettingsStatus();
  }, []);

  // turning off "answer" turns off "auto"
  useEffect(() => {
    if (!answerMode && autoMode) setAutoMode(false);
  }, [answerMode, autoMode]);

  // scroll to bottom on new messages
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const placeholderText = useMemo(() => {
    if (autoMode) return "Auto mode: hit ↑, I'll pick answers and move on.";
    if (answerMode) return "Hit ↑ to get just the answer. You can add a hint.";
    return "Ask about the question, request a breakdown, give me a hint...";
  }, [answerMode, autoMode]);

  const detectedText = useMemo(() => {
    if (!detected) return "";
    const subject = detected.subject || detected.pageTitle || "Page context";
    const count = detected.optionCount != null ? ` · ${detected.optionCount} options` : "";
    const screenshot = detected.hasScreenshot ? " · screenshot attached" : "";
    return `${subject}${count}${screenshot}`;
  }, [detected]);

  async function refreshSettingsStatus() {
    try {
      const settings = await sendRuntimeMessage({ type: "QSA_GET_SETTINGS" });
      if (!settings.backendUrl) setStatus("Add the backend URL in settings");
      else if (!settings.hasSharedSecret) setStatus("Backend connected without secret");
      else setStatus("Ready");
    } catch {
      setStatus("Check extension settings");
    }
  }

  const openOptions = useCallback(() => chrome.runtime.openOptionsPage(), []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setDetected(null);
    setErrorText("");
    setStatus("Ready");
  }, []);

  const toggleAnswerMode = useCallback(() => setAnswerMode((v) => !v), []);
  const toggleAutoMode = useCallback(() => {
    setAutoMode((v) => {
      if (!answerModeRef.current) return false;
      return !v;
    });
  }, []);

  const runIteration = useCallback(async ({ initialUserText, iteration }) => {
    setErrorText("");
    const mode = answerModeRef.current ? "answer" : "chat";
    const userText = initialUserText || (mode === "answer"
      ? (iteration === 0 ? "Give me the answer to the current question" : "Give me the answer to this question")
      : "");

    if (!userText && mode !== "answer") {
      setErrorText('Type a message or turn on "Answer only".');
      return;
    }

    if (userText) {
      setMessages((prev) => [...prev, { role: "user", text: userText, modeLabel: modeLabel(mode, autoModeRef.current) }]);
    }

    setIsLoading(true);
    setStatus(iteration === 0
      ? "Reading the question and capturing a screenshot..."
      : `Moving to the next question #${iteration + 1}...`);

    let assistantText = "";
    let advanced = false;

    try {
      const targetTab = await getTargetTab();
      if (!targetTab?.id) throw new Error("Could not find the active tab.");

      const [extracted, screenshotDataUrl] = await Promise.all([
        sendTabMessage(targetTab.id, { type: "QSA_EXTRACT_QUESTION" }).catch(() => null),
        captureTabScreenshot(targetTab)
      ]);

      setStatus(mode === "answer" ? "Requesting answer..." : "Requesting hint...");

      // history excludes the just-added user message; backend gets it via userText
      const history = [];
      setMessages((prev) => {
        for (const m of prev.slice(0, -1)) {
          if (m.role === "user" || m.role === "assistant") history.push({ role: m.role, text: m.text });
        }
        return prev;
      });

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

      setDetected(response.detected);
      assistantText = response.hint;
      setMessages((prev) => [...prev, { role: "assistant", text: assistantText, modeLabel: modeLabel(mode, autoModeRef.current) }]);

      if (mode === "answer" && autoModeRef.current) {
        advanced = await applyDemoAnswer(targetTab.id, assistantText);
      } else {
        setStatus(mode === "answer" ? "Answer ready" : "Done");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Request failed.";
      setErrorText(msg);
      setStatus("Error");
      setIsLoading(false);
      return;
    }

    setIsLoading(false);

    if (
      advanced &&
      answerModeRef.current &&
      autoModeRef.current &&
      iteration + 1 < AUTO_LOOP_MAX_ITERATIONS
    ) {
      await delay(AUTO_LOOP_DELAY_MS);
      if (!autoModeRef.current) {
        setStatus("Auto mode stopped.");
        return;
      }
      await runIteration({ initialUserText: "", iteration: iteration + 1 });
    } else if (advanced) {
      setStatus("Auto mode finished.");
    }
  }, []);

  const applyDemoAnswer = useCallback(async (tabId, answer) => {
    try {
      const applyResult = await sendTabMessage(tabId, {
        type: "QSA_APPLY_DEMO_ANSWER",
        payload: { answer }
      });
      setStatus(applyResult.advanced ? "Answer selected · advanced" : "Answer selected");
      return Boolean(applyResult.advanced);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Answer ready, but auto-select failed.";
      setErrorText(msg);
      return false;
    }
  }, []);

  const onSubmit = useCallback(async (e) => {
    e?.preventDefault();
    if (isLoading) return;
    const text = draft.trim();
    setDraft("");
    await runIteration({ initialUserText: text, iteration: 0 });
  }, [draft, isLoading, runIteration]);

  const useSuggestion = useCallback(async (text) => {
    if (isLoading) return;
    setDraft("");
    await runIteration({ initialUserText: text, iteration: 0 });
  }, [isLoading, runIteration]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <main className="grid grid-rows-[auto_auto_1fr_auto] flex-1 min-h-0">
      {/* Header */}
      <header className="flex items-center gap-2.5 px-3.5 py-3 border-b border-line bg-surface">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img src={iconUrl} alt="" className="w-7 h-7 rounded-md bg-accent-soft p-[3px] object-contain" />
          <div className="min-w-0">
            <h1 className="m-0 text-[13px] font-semibold tracking-tight">Quiz Study Assistant</h1>
            <p className="mt-px mb-0 text-[11px] text-ink-3 truncate">{status}</p>
          </div>
        </div>
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={openOptions}
          className="w-[30px] h-[30px] rounded-md text-ink-2 text-[15px] hover:bg-surface-soft hover:text-ink-1 transition-colors"
        >⚙</button>
      </header>

      {/* Detected context */}
      {detectedText && (
        <section className="flex items-center gap-2 px-3.5 py-1.5 border-b border-line bg-surface-soft text-[11px] text-ink-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="truncate">{detectedText}</span>
        </section>
      )}

      {/* Messages */}
      <section
        ref={messagesRef}
        className="flex flex-col overflow-y-auto min-h-0 px-3.5 py-4 qsa-scroll"
        aria-live="polite"
      >
        <div className="flex flex-col gap-3.5 mt-auto">
          {messages.map((msg, i) => (
            <article
              key={i}
              className={msg.role === "user"
                ? "flex flex-col gap-1 self-end max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br bg-accent-soft text-ink-1 text-sm leading-relaxed break-words"
                : "flex flex-col gap-1 self-stretch text-ink-1 text-sm leading-relaxed break-words"
              }
            >
              {msg.role === "assistant" && (
                <div className="flex gap-1.5 items-center text-[11px] font-semibold text-ink-3">
                  Assistant
                  {msg.modeLabel && (
                    <span className="px-1.5 py-px text-[10px] rounded font-medium bg-secondary-soft text-secondary">
                      {msg.modeLabel}
                    </span>
                  )}
                </div>
              )}
              {msg.role === "assistant" ? (
                <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
              ) : (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              )}
            </article>
          ))}

          {isLoading && (
            <article className="flex flex-col gap-1 self-stretch">
              <div className="flex gap-1.5 items-center text-[11px] font-semibold text-ink-3">Assistant</div>
              <div className="flex gap-1 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-3 qsa-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent qsa-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-secondary qsa-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </article>
          )}
        </div>
      </section>

      {/* Composer */}
      <section className="flex flex-col gap-2 px-3.5 pt-2.5 pb-3.5 border-t border-line bg-surface">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1.5 mb-0.5">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => useSuggestion(s)}
                className="text-left px-3 py-2 border border-line rounded-[10px] bg-surface text-ink-1 text-[13px] leading-snug hover:border-accent hover:bg-accent-soft hover:text-accent transition-colors"
              >{s}</button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap items-center" role="group" aria-label="Modes">
          <button
            type="button"
            onClick={toggleAnswerMode}
            title={answerMode ? "Turn off Answer-only" : "Return only the answer"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors ${
              answerMode
                ? "text-accent bg-accent-soft border-accent"
                : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${answerMode ? "bg-accent" : "bg-ink-3"}`} />
            Answer only
          </button>
          <button
            type="button"
            onClick={toggleAutoMode}
            disabled={!answerMode}
            title={autoMode ? "Turn off auto mode" : "Pick the answer and move to next question"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              autoMode
                ? "text-secondary bg-secondary-soft border-secondary"
                : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoMode ? "bg-secondary" : "bg-ink-3"}`} />
            Auto mode
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetChat}
              title="Clear chat"
              className="ml-auto px-2.5 py-1 rounded-full text-[12px] text-ink-3 hover:text-ink-1 hover:bg-surface-soft transition-colors"
            >Clear</button>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2 px-2.5 py-2 border border-line rounded-xl bg-surface focus-within:border-accent transition-colors">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholderText}
            rows={2}
            className="flex-1 resize-none max-h-[140px] border-0 bg-transparent text-ink-1 text-sm leading-snug outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-8 h-8 shrink-0 rounded-lg bg-accent text-white text-base font-semibold hover:bg-accent-hover disabled:bg-line-strong disabled:cursor-not-allowed transition-colors"
          >{isLoading ? "…" : "↑"}</button>
        </form>

        {errorText && (
          <p className="m-0 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[12px]">
            {errorText}
          </p>
        )}
      </section>
    </main>
  );
}
