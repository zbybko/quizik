import { useTranslation } from "react-i18next";
import { analytics } from "@shared/lib/analytics";

interface ChatEmptyStateProps {
  onPick: (text: string) => void;
}

/**
 * Beautiful empty state shown inside the messages area when there is no
 * chat history. Fills the available vertical space and centers content,
 * showing a friendly greeting plus prompt suggestions.
 */
export function ChatEmptyState({ onPick }: ChatEmptyStateProps) {
  const { t } = useTranslation();
  const rawSuggestions = t("chat.suggestions", { returnObjects: true });
  const suggestions = Array.isArray(rawSuggestions) ? (rawSuggestions as string[]) : [];

  return (
    <div className="flex flex-col items-center justify-center gap-5 h-full min-h-0 px-2 py-6 text-center">
      <div className="flex flex-col items-center gap-2.5">
        <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center text-2xl">
          ✨
        </div>
        <div>
          <h2 className="m-0 text-[15px] font-semibold tracking-tight text-ink-1">
            {t("chat.empty.title", { defaultValue: "How can I help with this quiz?" })}
          </h2>
          <p className="mt-1 mb-0 text-[12px] text-ink-2 leading-snug max-w-[280px]">
            {t("chat.empty.subtitle", {
              defaultValue: "Ask anything about the visible question, or pick a starter below."
            })}
          </p>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="w-full flex flex-col gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { void analytics.suggestionClicked(s); onPick(s); }}
              className="text-left px-3 py-2 border border-line rounded-[10px] bg-surface text-ink-1 text-[13px] leading-snug hover:border-accent hover:bg-accent-soft hover:text-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
