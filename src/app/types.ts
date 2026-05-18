export type ChatRole = "user" | "assistant";
export type ChatMode = "answer" | "chat";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  modeLabel?: string;
}

export interface DetectedContext {
  subject?: string;
  pageTitle?: string;
  optionCount?: number;
  hasScreenshot?: boolean;
  mode?: string;
  historyLength?: number;
}

export interface HintResponse {
  hint: string;
  detected: DetectedContext;
}

export interface ExtractedQuestion {
  subject?: string;
  question?: string;
  options?: string[];
  pageTitle?: string;
  pageUrl?: string;
  audioSources?: unknown[];
  isQuizPage?: boolean;
  questionSignature?: string;
}

export interface ApplyDemoAnswerResult {
  advanced: boolean;
  [key: string]: unknown;
}

export interface ForwardedEvent {
  level?: "log" | "warn";
  source?: string;
  message: string;
  details?: unknown;
}

export interface RuntimeOk<T> { ok: true; result: T; events?: ForwardedEvent[] }
export interface RuntimeErr { ok: false; error: string; events?: ForwardedEvent[]; diagnostics?: unknown }
export type RuntimeResponse<T> = RuntimeOk<T> | RuntimeErr;
