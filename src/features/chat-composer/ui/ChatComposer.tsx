import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface ChatComposerProps {
  isLoading: boolean;
  answerMode: boolean;
  autoMode: boolean;
  hasMessages: boolean;
  onSend: (text: string) => Promise<void> | void;
  /** Render slot above the input — typically toggles + clear */
  toolbar: React.ReactNode;
  /** Render slot at the very top — typically suggestion chips */
  topSlot?: React.ReactNode;
  /** Render slot at the bottom — typically error banner */
  bottomSlot?: React.ReactNode;
}

export function ChatComposer({
  isLoading,
  answerMode,
  autoMode,
  hasMessages: _hasMessages,
  onSend,
  toolbar,
  topSlot,
  bottomSlot
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const placeholderText = useMemo(() => {
    if (autoMode) return t("chat.placeholder.auto");
    if (answerMode) return t("chat.placeholder.answer");
    return t("chat.placeholder.chat");
  }, [answerMode, autoMode, t]);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    const text = draft.trim();
    setDraft("");
    await onSend(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void onSubmit();
    }
  };

  return (
    <section className="shrink-0 flex flex-col gap-2 px-3.5 pt-2.5 pb-3.5 border-t border-line bg-surface">
      {topSlot}
      {toolbar}
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 px-2.5 py-2 border border-line rounded-xl bg-surface focus-within:border-accent transition-colors"
      >
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
      {bottomSlot}
    </section>
  );
}
