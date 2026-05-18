/** Shared shapes for chrome.runtime message protocol. */

export interface ForwardedEvent {
  level?: "log" | "warn";
  source?: string;
  message: string;
  details?: unknown;
}

export interface RuntimeOk<T> { ok: true; result: T; events?: ForwardedEvent[] }
export interface RuntimeErr {
  ok: false;
  error: string;
  events?: ForwardedEvent[];
  diagnostics?: unknown;
}
export type RuntimeResponse<T> = RuntimeOk<T> | RuntimeErr;
