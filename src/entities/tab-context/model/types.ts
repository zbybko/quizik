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

export interface ApplyDemoAnswerResult {
  advanced: boolean;
  [key: string]: unknown;
}
