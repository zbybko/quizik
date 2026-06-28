/**
 * Pure request-normalization helpers. Kept in a leaf module (no JSON/locale
 * imports) so they can be unit-tested directly with `node --test`.
 */

export function normalizeMode(value: unknown): "answer" | "chat" | "hint" {
  if (value === "answer") return "answer";
  if (value === "chat") return "chat";
  return "hint";
}

export function normalizeModel(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  // Only accept plausible GPT model ids; reject anything else to avoid passing
  // arbitrary strings to the OpenAI API.
  return /^gpt-[a-z0-9.\-]{1,40}$/i.test(v) ? v : "";
}

export function normalizeScreenshotDataUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) ? value : "";
}
