interface SelectedTextChipProps {
  text: string;
  onDismiss: () => void;
}

/** Shows a preview of the page text the user has selected, with a dismiss button. */
export function SelectedTextChip({ text, onDismiss }: SelectedTextChipProps) {
  const preview = text.length > 120 ? text.slice(0, 120).trimEnd() + "…" : text;

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-secondary-soft border border-secondary/20 text-[12px] animate-in">
      <span className="text-secondary shrink-0 mt-0.5">❝</span>
      <span className="flex-1 min-w-0 text-ink-2 leading-snug break-words">{preview}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Remove selected text"
        className="shrink-0 text-ink-3 hover:text-ink-1 transition-colors text-[14px] leading-none mt-0.5"
      >
        ×
      </button>
    </div>
  );
}
