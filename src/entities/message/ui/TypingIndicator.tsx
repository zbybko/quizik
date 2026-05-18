interface TypingIndicatorProps {
  assistantLabel: string;
}

export function TypingIndicator({ assistantLabel }: TypingIndicatorProps) {
  return (
    <article className="flex flex-col gap-1 self-stretch">
      <div className="flex gap-1.5 items-center text-[11px] font-semibold text-ink-3">{assistantLabel}</div>
      <div className="flex gap-1 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-3 qsa-bounce" />
        <span className="w-1.5 h-1.5 rounded-full bg-accent qsa-bounce" style={{ animationDelay: "0.15s" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-secondary qsa-bounce" style={{ animationDelay: "0.3s" }} />
      </div>
    </article>
  );
}
