export type ChatRole = "user" | "assistant";
export type ChatMode = "answer" | "chat";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  modeLabel?: string;
}
