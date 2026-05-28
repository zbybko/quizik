import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ApplyDemoAnswerResult,
  type DetectedContext,
  type ExtractedQuestion,
  type HintResponse,
  captureTabScreenshot,
  getTargetTab
} from "@entities/tab-context";
import type { ChatMessage, ChatMode } from "@entities/message";
import {
  delay,
  sendRuntimeMessage,
  sendTabMessage
} from "@shared/lib/messaging";
import { AUTO_LOOP_DELAY_MS, AUTO_LOOP_MAX_ITERATIONS, IS_DEV_MODE } from "@shared/config";
import { analytics } from "@shared/lib/analytics";

interface UseChatLoopOptions {
  standaloneTargetTabId: number | null;
}

interface UseChatLoopApi {
  status: string;
  setStatus: (s: string) => void;
  errorText: string;
  isLoading: boolean;
  detected: DetectedContext | null;
  messages: ChatMessage[];
  answerMode: boolean;
  autoMode: boolean;
  toggleAnswerMode: () => void;
  toggleAutoMode: () => void;
  resetChat: () => void;
  refreshSettingsStatus: () => Promise<void>;
  send: (initialUserText: string) => Promise<void>;
}

/**
 * Owns chat conversation state, mode toggles, the request lifecycle,
 * and the auto-mode iteration loop (answer → apply on page → advance → repeat).
 */
export function useChatLoop({ standaloneTargetTabId }: UseChatLoopOptions): UseChatLoopApi {
  const { t } = useTranslation();

  const [status, setStatus] = useState<string>(() => t("status.ready"));
  const [errorText, setErrorText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [answerMode, setAnswerMode] = useState<boolean>(false);
  const [autoMode, setAutoMode] = useState<boolean>(false);
  const [detected, setDetected] = useState<DetectedContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const answerModeRef = useRef(answerMode);
  const autoModeRef = useRef(autoMode);
  useEffect(() => { answerModeRef.current = answerMode; }, [answerMode]);
  useEffect(() => { autoModeRef.current = autoMode; }, [autoMode]);

  // turning off "answer" turns off "auto"
  useEffect(() => {
    if (!answerMode && autoMode) setAutoMode(false);
  }, [answerMode, autoMode]);

  const toggleAnswerMode = useCallback(() => setAnswerMode((v) => !v), []);
  const toggleAutoMode = useCallback(() => {
    if (!IS_DEV_MODE) return; // auto-mode disabled in production builds
    setAutoMode((v) => answerModeRef.current ? !v : false);
  }, []);

  const resetChat = useCallback(() => {
    setMessages([]);
    setDetected(null);
    setErrorText("");
    setStatus(t("status.ready"));
  }, [t]);

  const refreshSettingsStatus = useCallback(async () => {
    try {
      const settings = await sendRuntimeMessage<{ backendUrl?: string }>({ type: "QSA_GET_SETTINGS" });
      if (!settings.backendUrl) setStatus(t("status.addBackend"));
      else setStatus(t("status.ready"));
    } catch {
      setStatus(t("status.checkSettings"));
    }
  }, [t]);

  function modeLabel(mode: ChatMode, auto: boolean): string {
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

      let history: { role: "user" | "assistant"; text: string }[] = [];
      setMessages((prev) => {
        history = prev.slice(0, -1)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, text: m.text }));
        return prev;
      });

      void analytics.messageSent({
        mode,
        hasScreenshot: Boolean(screenshotDataUrl),
        isFirstMessage: history.length === 0,
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

      if (IS_DEV_MODE && mode === "answer" && autoModeRef.current && targetTab.id) {
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
      IS_DEV_MODE &&
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

  const send = useCallback((initialUserText: string) => runIteration({ initialUserText, iteration: 0 }), [runIteration]);

  return {
    status,
    setStatus,
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
  };
}
