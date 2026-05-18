import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

/** Render arbitrary markdown to sanitized HTML. Safe to feed to dangerouslySetInnerHTML. */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text || "", { async: false }) as string;
  return DOMPurify.sanitize(html);
}
