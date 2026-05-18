import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { renderMarkdown } from "./markdown";
import {
  captureTabScreenshot,
  delay,
  getTargetTab,
  sendRuntimeMessage,
  sendTabMessage
} from "./messaging";
import type {
  ApplyDemoAnswerResult,
  ChatMessage,
  ChatMode,
  ExtractedQuestion,
  HintResponse
} from "./types";

const AUTO_LOOP_DELAY_MS = 1200;
const AUTO_LOOP_MAX_ITERATIONS = 50;

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

interface ChatProps {
  onOpenSettings: () => void;
}

export default function Chat({ onOpenSettings }: ChatProps) {
  const { t } = useTranslation();

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const standaloneTargetTabId = useMemo(() => {
    const raw = Number(queryParams.get("targetTabId"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [queryParams]);
  const isStandaloneWindow = queryParams.get("standalone") === "1";

  const [status, setStatus] = useState(() => t("status.ready"));
  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [answerMode, setAnswerMode] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [detected, setDetected] = useState<HintResponse["detected"] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const answerModeRef = useRef(answerMode);
  const autoModeRef = useRef(autoMode);
  useEffect(() => { answerModeRef.current = answerMode; }, [answerMode]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);

  const suggestions = useMemo(() => {
    const v = t("chat.suggestions", { returnObjects: true });
    return Array.isArray(v) ? (v as string[]) : [];
  }, [t]);

  useEffect(() => {
    document.body.classList.toggle("standalone", isStandaloneWindow);
    void refreshSettingsStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!answerMode && autoMode) setAutoMode(false);
  }, [answerMode, autoMode]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const placeholderText = useMemo(() => {
    if (autoMode) return t("chat.placeholder.auto");
    if (answerMode) return t("chat.placeholder.answer");
    return t("chat.placeholder.chat");
  }, [answerMode, autoMode, t]);

  const detectedText = useMemo(() => {
    if (!detected) return "";
    const subject = detected.subject || detected.pageTitle || t("detected.pageContext");
    const count = detected.optionCount != null ? ` · ${t("detected.options", { count: detected.optionCount })}` : "";
    const screenshot = detected.hasScreenshot ? ` · ${t("detected.screenshot")}` : "";
    return `${subject}${count}${screenshot}`;
  }, [detected, t]);

  async function refreshSettingsStatus() {
    try {
      const settings = await sendRuntimeMessage<{ backendUrl?: string; hasSharedSecret?: boolean }>({ type: "QSA_GET_SETTINGS" });
      if (!settings.backendUrl) setStatus(t("status.addBackend"));
      else if (!settings.hasSharedSecret) setStatus(t("status.noSecret"));
      else setStatus(t("status.ready"));
    } catch {
      setStatus(t("status.checkSettings"));
    }
  }

  const resetChat = useCallback(() => {
    setMessages([]);
    setDetected(null);
    setErrorText("");
    setStatus(t("status.ready"));
  }, [t]);

  const toggleAnswerMode = useCallback(() => setAnswerMode((v) => !v), []);
  const toggleAutoMode = useCallback(() => {
    setAutoMode((v) => {
      if (!answerModeRef.current) return false;
      return !v;
    });
  }, []);

  function modeLabel(mode: ChatMode, auto: boolean) {
    if (mode === "answer" && auto) return t("chat.modeLabel.auto");
    if (mode === "answer") return t("chat.modeLabel.answer");
    return t("chat.modeLabel.chat");
  }

  const sendTabMessageT = useCallback(
    <T = unknown>(tabId: number, message: unknown) =>
      sendTabMessage<T>(tabId, message, {}, () => new Error(t("errors.reloadPage"))),
    [t]
  );

  const applyDemoAnswer = useCallback(async (tabId: number, answer: string) => {
    try {
      const applyResult = await sendTabMessageT<ApplyDemoAnswerResult>(tabId, {
        type: "QSA_APPLY_DEMO_ANSWER",
        payload: { answer }
      });
      setStatus(applyResult.advanced ? t("status.answerSelectedAdvanced") : t("status.answerSelected"));
      return Boolean(applyResult.advanced);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("errors.autoSelectFailed");
      setErrorText(msg);
      return false;
    }
  }, [sendTabMessageT, t]);

  const runIteration = useCallback(async ({ initialUserText, iteration }: { initialUserText: string; iteration: number }) => {
    setErrorText("");
    const mode: ChatMode = answerModeRef.current ? "answer" : "chat";
    const userText = initialUserText || (mode === "answer"
      ? (iteration === 0 ? t("chat.userPrompt.firstAnswer") : t("chat.userPrompt.nextAnswer"))
      : "");

    if (!userText && mode !== "answer") {
      setErrorText(t("errors.needMessageOrAnswer"));
      return;
    }

    if (userText) {
      setMessages((prev) => [...prev, { role: "user", text: userText, modeLabel: modeLabel(mode, autoModeRef.current) }]);
    }

    setIsLoading(true);
    setStatus(iteration === 0
      ? t("status.reading")
      : t("status.movingNext", { n: iteration + 1 }));

    let assistantText = "";
    let advanced = false;

    try {
      const targetTab = await getTargetTab(standaloneTargetTabId);
      if (!targetTab?.id) throw new Error(t("errors.noTab"));

      const [extracted, screenshotDataUrl] = await Promise.all([
        sendTabMessageT<ExtractedQuestion>(targetTab.id, { type: "QSA_EXTRACT_QUESTION" }).catch(() => null),
        captureTabScreenshot(
          targetTab,
          t("errors.noScreenshotWindow"),
          (msg) => t("errors.screenshotFailed", { message: msg })
        )
      ]);

      setStatus(mode === "answer" ? t("status.requestingAnswer") : t("status.requestingHint"));

      // history excludes the just-added user message; backend gets it via userText
      let history: { role: "user" | "assistant"; text: string }[] = [];
      setMessages((prev) => {
        history = prev.slice(0, -1)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, text: m.text }));
        return prev;
      });

      const response = await sendRuntimeMessage<HintResponse>({
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

      if (mode === "answer" && autoModeRef.current && targetTab.id) {
        advanced = await applyDemoAnswer(targetTab.id, assistantText);
      } else {
        setStatus(mode === "answer" ? t("status.answerReady") : t("status.done"));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("errors.requestFailed");
      setErrorText(msg);
      setStatus(t("status.error"));
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
        setStatus(t("status.autoStopped"));
        return;
      }
      await runIteration({ initialUserText: "", iteration: iteration + 1 });
    } else if (advanced) {
      setStatus(t("status.autoFinished"));
    }
  }, [applyDemoAnswer, sendTabMessageT, standaloneTargetTabId, t]);

  const onSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    const text = draft.trim();
    setDraft("");
    await runIteration({ initialUserText: text, iteration: 0 });
  }, [draft, isLoading, runIteration]);

  const useSuggestion = useCallback(async (text: string) => {
    if (isLoading) return;
    setDraft("");
    await runIteration({ initialUserText: text, iteration: 0 });
  }, [isLoading, runIteration]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void onSubmit();
    }
  };

  return (
    <main className="grid grid-rows-[auto_auto_1fr_auto] flex-1 min-h-0">
      <header className="flex items-center gap-2.5 px-3.5 py-3 border-b border-line bg-surface">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img src={iconUrl} alt="" className="w-7 h-7 rounded-md bg-accent-soft p-[3px] object-contain" />
          <div className="min-w-0">
            <h1 className="m-0 text-[13px] font-semibold tracking-tight">{t("app.name")}</h1>
            <p className="mt-px mb-0 text-[11px] text-ink-3 truncate">{status}</p>
          </div>
        </div>
        <button
          type="button"
          title={t("app.settings")}
          aria-label={t("app.settings")}
          onClick={onOpenSettings}
          className="w-[30px] h-[30px] rounded-md text-ink-2 text-[15px] hover:bg-surface-soft hover:text-ink-1 transition-colors"
        >⚙</button>
      </header>

      {detectedText && (
        <section className="flex items-center gap-2 px-3.5 py-1.5 border-b border-line bg-surface-soft text-[11px] text-ink-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="truncate">{detectedText}</span>
        </section>
      )}

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
                  {t("chat.assistant")}
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
              <div className="flex gap-1.5 items-center text-[11px] font-semibold text-ink-3">{t("chat.assistant")}</div>
              <div className="flex gap-1 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-3 qsa-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent qsa-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-secondary qsa-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 px-3.5 pt-2.5 pb-3.5 border-t border-line bg-surface">
        {messages.length === 0 && suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-0.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void useSuggestion(s)}
                className="text-left px-3 py-2 border border-line rounded-[10px] bg-surface text-ink-1 text-[13px] leading-snug hover:border-accent hover:bg-accent-soft hover:text-accent transition-colors"
              >{s}</button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap items-center" role="group" aria-label="Modes">
          <button
            type="button"
            onClick={toggleAnswerMode}
            title={answerMode ? t("toggles.answerOnlyTooltip.on") : t("toggles.answerOnlyTooltip.off")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors ${
              answerMode
                ? "text-accent bg-accent-soft border-accent"
                : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${answerMode ? "bg-accent" : "bg-ink-3"}`} />
            {t("toggles.answerOnly")}
          </button>
          <button
            type="button"
            onClick={toggleAutoMode}
            disabled={!answerMode}
            title={autoMode ? t("toggles.autoModeTooltip.on") : t("toggles.autoModeTooltip.off")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              autoMode
                ? "text-secondary bg-secondary-soft border-secondary"
                : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoMode ? "bg-secondary" : "bg-ink-3"}`} />
            {t("toggles.autoMode")}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetChat}
              title={t("chat.clear")}
              className="ml-auto px-2.5 py-1 rounded-full text-[12px] text-ink-3 hover:text-ink-1 hover:bg-surface-soft transition-colors"
            >{t("chat.clear")}</button>
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
            aria-label={t("chat.send")}
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
