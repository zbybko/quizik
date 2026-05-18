import { useTranslation } from "react-i18next";

interface SuggestionListProps {
  onPick: (text: string) => void;
}

export function SuggestionList({ onPick }: SuggestionListProps) {
  const { t } = useTranslation();
  const raw = t("chat.suggestions", { returnObjects: true });
  const suggestions = Array.isArray(raw) ? (raw as string[]) : [];

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-0.5">
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(s)}
          className="text-left px-3 py-2 border border-line rounded-[10px] bg-surface text-ink-1 text-[13px] leading-snug hover:border-accent hover:bg-accent-soft hover:text-accent transition-colors"
        >{s}</button>
      ))}
    </div>
  );
}
