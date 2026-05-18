import { renderMarkdown } from "@shared/lib/markdown";
import type { ChatMessage } from "../model/types";

interface MessageBubbleProps {
  message: ChatMessage;
  assistantLabel: string;
}

export function MessageBubble({ message, assistantLabel }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <article className="flex flex-col gap-1 self-end max-w-[85%] min-w-0 px-3.5 py-2.5 rounded-2xl rounded-br bg-accent-soft text-ink-1 text-sm leading-relaxed break-words">
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-1 self-stretch min-w-0 text-ink-1 text-sm leading-relaxed break-words">
      <div className="flex gap-1.5 items-center text-[11px] font-semibold text-ink-3">
        {assistantLabel}
        {message.modeLabel && (
          <span className="px-1.5 py-px text-[10px] rounded font-medium bg-secondary-soft text-secondary">
            {message.modeLabel}
          </span>
        )}
      </div>
      <div className="markdown min-w-0" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} />
    </article>
  );
}
