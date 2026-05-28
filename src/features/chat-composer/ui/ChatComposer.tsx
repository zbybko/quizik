import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface SlashCommand {
  name: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/status",  description: "Show your usage & plan" },
  { name: "/usage",   description: "Show requests used today" },
];

interface ChatComposerProps {
  isLoading: boolean;
  answerMode: boolean;
  autoMode: boolean;
  hasMessages: boolean;
  onSend: (text: string) => Promise<void> | void;
  toolbar: React.ReactNode;
  topSlot?: React.ReactNode;
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const placeholderText = useMemo(() => {
    if (autoMode) return t("chat.placeholder.auto");
    if (answerMode) return t("chat.placeholder.answer");
    return t("chat.placeholder.chat");
  }, [answerMode, autoMode, t]);

  // Filtered commands based on current draft
  const matchedCommands = useMemo(() => {
    if (!draft.startsWith("/")) return [];
    const query = draft.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.name.startsWith(query));
  }, [draft]);

  const showMenu = matchedCommands.length > 0;

  // Reset selection when menu changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [matchedCommands.length]);

  const selectCommand = useCallback((cmd: SlashCommand) => {
    setDraft(cmd.name + " ");
    textareaRef.current?.focus();
  }, []);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    const text = draft.trim();
    setDraft("");
    await onSend(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + matchedCommands.length) % matchedCommands.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % matchedCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && showMenu)) {
        e.preventDefault();
        selectCommand(matchedCommands[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setDraft("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void onSubmit();
    }
  };

  return (
    <section className="shrink-0 flex flex-col gap-2 px-3.5 pt-2.5 pb-3.5 border-t border-line bg-surface">
      {topSlot}

      {/* Slash command menu */}
      {showMenu && (
        <div className="flex flex-col rounded-xl border border-line bg-surface shadow-lg overflow-hidden">
          {matchedCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
              className={`flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                i === selectedIndex
                  ? "bg-accent-soft text-accent"
                  : "hover:bg-surface-soft text-ink-1"
              }`}
            >
              <span className="text-[13px] font-mono font-semibold w-20 shrink-0">{cmd.name}</span>
              <span className="text-[12px] text-ink-2">{cmd.description}</span>
            </button>
          ))}
          <div className="px-3.5 py-1.5 border-t border-line bg-surface-soft">
            <span className="text-[11px] text-ink-3">↑↓ navigate · Enter or Tab to select · Esc to close</span>
          </div>
        </div>
      )}

      {toolbar}

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 px-2.5 py-2 border border-line rounded-xl bg-surface focus-within:border-accent transition-colors"
      >
        <textarea
          ref={textareaRef}
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
