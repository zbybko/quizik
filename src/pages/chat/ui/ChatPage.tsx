import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MessageBubble, TypingIndicator } from "@entities/message";
import { ChatComposer, ChatEmptyState } from "@features/chat-composer";
import { ModeToggles } from "@features/mode-toggles";
import { useChatLoop } from "@features/auto-loop";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

interface ChatPageProps {
  onOpenSettings: () => void;
}

export function ChatPage({ onOpenSettings }: ChatPageProps) {
  const { t } = useTranslation();

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
  } = useChatLoop({ standaloneTargetTabId: null });

  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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

  const hasMessages = messages.length > 0;

  return (
    <main className="flex flex-col flex-1 h-full min-h-0 min-w-0">
      <header className="shrink-0 flex items-center gap-2.5 px-3.5 py-3 border-b border-line bg-surface">
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
        <section className="shrink-0 flex items-center gap-2 min-w-0 overflow-hidden px-3.5 py-1.5 border-b border-line bg-surface-soft text-[11px] text-ink-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="truncate min-w-0 flex-1">{detectedText}</span>
        </section>
      )}

      <section
        ref={messagesRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 qsa-scroll"
        aria-live="polite"
      >
        {hasMessages ? (
          <div className="flex flex-col gap-3.5 min-w-0 px-3.5 py-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} assistantLabel={t("chat.assistant")} />
            ))}
            {isLoading && <TypingIndicator assistantLabel={t("chat.assistant")} />}
          </div>
        ) : (
          <div className="h-full px-3.5">
            <ChatEmptyState onPick={(text) => void send(text)} />
          </div>
        )}
      </section>

      <ChatComposer
        isLoading={isLoading}
        answerMode={answerMode}
        autoMode={autoMode}
        hasMessages={hasMessages}
        onSend={send}
        toolbar={
          <ModeToggles
            answerMode={answerMode}
            autoMode={autoMode}
            hasMessages={hasMessages}
            onToggleAnswer={toggleAnswerMode}
            onToggleAuto={toggleAutoMode}
            onClear={resetChat}
          />
        }
        bottomSlot={
          errorText ? (
            <p className="m-0 px-2.5 py-1.5 rounded-lg bg-[color-mix(in_srgb,#ef4444_10%,transparent)] border border-[color-mix(in_srgb,#ef4444_30%,transparent)] text-[#dc2626] dark:text-[#f87171] text-[12px]">
              {errorText}
            </p>
          ) : null
        }
      />
    </main>
  );
}
