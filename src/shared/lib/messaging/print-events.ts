import type { ForwardedEvent } from "@shared/api";

/** Print chained content/background-script logs into the popup console. */
export function printForwardedEvents(
  messageType: string | undefined,
  response: { events?: ForwardedEvent[] } | undefined
): void {
  if (!response || !Array.isArray(response.events) || response.events.length === 0) return;
  const label = `[QSA forwarded] ${messageType} (${response.events.length})`;
  console.groupCollapsed(label);
  for (const event of response.events) {
    const logger = event.level === "warn" ? console.warn : console.log;
    logger(event.source || "[QSA]", event.message, event.details ?? "");
  }
  console.groupEnd();
}
