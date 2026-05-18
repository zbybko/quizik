import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageBubble, TypingIndicator } from "@entities/message";
import { ChatComposer, SuggestionList } from "@features/chat-composer";
import { ModeToggles } from "@features/mode-toggles";
import { useChatLoop } from "@features/auto-loop";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

interface ChatPageProps {
  onOpenSettings: () => void;
}

export function ChatPage({ onOpenSettings }: ChatPageProps) {
  const { t } = useTranslation();

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const standaloneTargetTabId = useMemo(() => {
    const raw = Number(queryParams.get("targetTabId"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [queryParams]);
  const isStandaloneWindow = queryParams.get("standalone") === "1";

  const {
    status,
    errorText,
    isLoading,
    detected,
    messages,
    answerMode,
    autoMode,
    toggleAnswerMode,
    toggleAutoMode,
    resetChat,
    refreshSettingsStatus,
    send
  } = useChatLoop({ standaloneTargetTabId });

  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.classList.toggle("standalone", isStandaloneWindow);
    void refreshSettingsStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const detectedText = useMemo(() => {
    if (!detected) return "";
    const subject = detected.subject || detected.pageTitle || t("detected.pageContext");
    const count = detected.optionCount != null ? ` · ${t("detected.options", { count: detected.optionCount })}` : "";
    const screenshot = detected.hasScreenshot ? ` · ${t("detected.screenshot")}` : "";
    return `${subject}${count}${screenshot}`;
  }, [detected, t]);

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
            <MessageBubble key={i} message={msg} assistantLabel={t("chat.assistant")} />
          ))}
          {isLoading && <TypingIndicator assistantLabel={t("chat.assistant")} />}
        </div>
      </section>

      <ChatComposer
        isLoading={isLoading}
        answerMode={answerMode}
        autoMode={autoMode}
        hasMessages={messages.length > 0}
        onSend={send}
        topSlot={messages.length === 0 ? <SuggestionList onPick={(text) => void send(text)} /> : null}
        toolbar={
          <ModeToggles
            answerMode={answerMode}
            autoMode={autoMode}
            hasMessages={messages.length > 0}
            onToggleAnswer={toggleAnswerMode}
            onToggleAuto={toggleAutoMode}
            onClear={resetChat}
          />
        }
        bottomSlot={
          errorText ? (
            <p className="m-0 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[12px]">
              {errorText}
            </p>
          ) : null
        }
      />
    </main>
  );
}
