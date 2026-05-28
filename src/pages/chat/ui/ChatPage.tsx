import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageBubble, TypingIndicator } from "@entities/message";
import { ChatComposer, ChatEmptyState } from "@features/chat-composer";
import { ModeToggles } from "@features/mode-toggles";
import { useChatLoop } from "@features/auto-loop";
import { sendRuntimeMessage } from "@shared/lib/messaging";
import { DEFAULT_BACKEND_URL } from "@shared/config";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

interface AuthStatus {
  isSignedIn: boolean;
  email: string;
  plan: "anon" | "free" | "pro";
  deviceId: string;
}

interface ChatPageProps {
  onOpenSettings: () => void;
}

export function ChatPage({ onOpenSettings }: ChatPageProps) {
  const { t } = useTranslation();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [usageToday, setUsageToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(20);

  const {
    status,
    errorText,
    isLoading,
    detected,
    messages,
    setMessages,
    answerMode,
    autoMode,
    toggleAnswerMode,
    toggleAutoMode,
    resetChat,
    refreshSettingsStatus,
    send: sendRaw,
  } = useChatLoop({ standaloneTargetTabId: null });

  const messagesRef = useRef<HTMLDivElement | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await sendRuntimeMessage<AuthStatus>({ type: "QSA_GET_AUTH_STATUS" });
      setAuth(res);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refreshSettingsStatus();
    void refreshAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle slash commands locally without sending to AI
  const handleSlashCommand = useCallback(async (text: string): Promise<boolean> => {
    const cmd = text.trim().toLowerCase();
    if (cmd !== "/status" && cmd !== "/usage") return false;

    const stored = await chrome.storage.local.get({
      authToken: "", authEmail: "", authPlan: "anon", deviceId: ""
    });
    const deviceId = stored.deviceId || "unknown";
    const isSignedIn = Boolean(stored.authToken);

    try {
      const headers: Record<string, string> = { "X-Device-ID": deviceId };
      if (stored.authToken) headers["Authorization"] = `Bearer ${stored.authToken}`;
      const res = await fetch(`${DEFAULT_BACKEND_URL}/user/status`, { headers });
      const data = await res.json();
      const { plan, usageToday: used, dailyLimit: limit } = data.result ?? {};
      const remaining = Math.max(0, limit - used);
      const bar = "█".repeat(Math.round((used / limit) * 10)) + "░".repeat(10 - Math.round((used / limit) * 10));

      const lines = [
        `**📊 Usage status**`,
        ``,
        `Plan: **${plan === "pro" ? "⭐ Pro" : plan === "free" ? "Free" : "Anonymous"}**`,
        isSignedIn ? `Account: ${stored.authEmail}` : ``,
        ``,
        `Today: **${used} / ${limit}** requests`,
        `\`${bar}\` ${remaining} left`,
        ``,
        plan !== "pro"
          ? `_Type \`/upgrade\` to go Pro — unlimited requests._`
          : `_Unlimited requests. Thank you! 🎉_`,
      ].filter(l => l !== undefined).join("\n");

      setMessages(prev => [
        ...prev,
        { role: "user" as const, text: cmd },
        { role: "assistant" as const, text: lines }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "user" as const, text: cmd },
        { role: "assistant" as const, text: "⚠️ Could not fetch usage status." }
      ]);
    }
    return true;
  }, [DEFAULT_BACKEND_URL, setMessages]);

  // Wrap send: slash commands always work, normal messages blocked when limit reached
  const send = useCallback(async (text: string) => {
    if (await handleSlashCommand(text)) return;
    if (limitReached) return; // block normal messages but allow slash commands above
    try {
      setLimitReached(false);
      await sendRaw(text);
    } catch (e: any) {
      if (e?.code === "limit_reached" || e?.message === "limit_reached") {
        setLimitReached(true);
        setUsageToday(e.usageToday ?? dailyLimit);
        setDailyLimit(e.dailyLimit ?? dailyLimit);
      }
    }
  }, [sendRaw, dailyLimit, limitReached, handleSlashCommand]);

  const handleSignIn = useCallback(() => {
    chrome.tabs.create({ url: `${DEFAULT_BACKEND_URL}/auth?ext_id=${chrome.runtime.id}` });
  }, []);

  const handleUpgrade = useCallback(async () => {
    try {
      const stored = await chrome.storage.local.get({ authToken: "" });
      if (!stored.authToken) { handleSignIn(); return; }
      const res = await fetch(`${DEFAULT_BACKEND_URL}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.authToken}` },
      });
      const data = await res.json();
      if (data?.result?.url) chrome.tabs.create({ url: data.result.url });
    } catch { /* ignore */ }
  }, [handleSignIn]);

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

      {limitReached && (
        <div className="shrink-0 flex flex-col gap-2 px-3.5 py-3 border-t bg-[color-mix(in_srgb,#ea580c_8%,transparent)] border-[color-mix(in_srgb,#ea580c_25%,transparent)]">
          <p className="text-[13px] font-semibold text-ink-1">Daily limit reached</p>
          <p className="text-[12px] text-ink-2 leading-snug">
            {auth?.isSignedIn
              ? "You've used all free requests today. Upgrade to Pro for unlimited access."
              : "Sign in for 20 free requests/day. Upgrade to Pro for unlimited access."}
          </p>
          <div className="flex gap-2 mt-1">
            {!auth?.isSignedIn && (
              <button onClick={handleSignIn} className="flex-1 py-2 rounded-lg border border-line bg-surface text-ink-1 text-[13px] font-medium hover:border-accent hover:text-accent transition-colors">
                Sign in
              </button>
            )}
            <button onClick={handleUpgrade} className="flex-1 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors">
              Upgrade to Pro — $7/mo
            </button>
          </div>
        </div>
      )}

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
