/**
 * Static legal pages served by the Worker:
 *   GET /privacy  → Privacy Policy
 *   GET /terms    → Terms of Service
 *
 * Required for Chrome Web Store submission. Keep the wording user-facing
 * but plain; this is not a substitute for real legal review before a
 * commercial launch.
 */

const CSS = `
  body { max-width: 720px; margin: 48px auto; padding: 0 20px;
    font: 16px/1.6 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    color: #1a1a1a; background: #faf9fb; }
  h1 { font-size: 26px; letter-spacing: -0.02em; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; }
  .updated { color: #a1a1aa; font-size: 13px; margin: 0 0 32px; }
  p, li { color: #2a2a2a; }
  a { color: #ea580c; text-underline-offset: 2px; }
  code { background: #ececf0; padding: 1px 6px; border-radius: 4px; font-size: 14px; }
  nav { margin-top: 48px; padding-top: 16px; border-top: 1px solid #ececf0;
    font-size: 14px; color: #52525b; }
  nav a { margin-right: 16px; }
`;

function page(title: string, lastUpdated: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Quizik</title>
<style>${CSS}</style>
</head>
<body>
<h1>${title}</h1>
<p class="updated">Last updated: ${lastUpdated}</p>
${body}
<nav>
  <a href="/privacy">Privacy</a>
  <a href="/terms">Terms</a>
  <a href="https://github.com/zbybko/quizik">Source on GitHub</a>
</nav>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

export function privacyPage(): Response {
  return page("Privacy Policy", "2026-05-18", `
<p>Quizik is a Chrome extension that helps students study quizzes. This page describes what data the extension and its hosted backend collect, how it is used, and who it is shared with.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Visible page text and a screenshot of the current tab</strong> — collected only when you actively ask the assistant a question. The content script reads only visible elements (password fields, hidden inputs, scripts, styles, cookies, and browser storage are excluded).</li>
  <li><strong>Your chat messages</strong> — sent with each request as part of the conversation history.</li>
  <li><strong>Your IP address</strong> — visible to Cloudflare for routing, rate limiting, and abuse prevention. We do not store it.</li>
</ul>

<h2>What we do NOT collect</h2>
<ul>
  <li>Account information (Quizik has no accounts yet).</li>
  <li>Browsing history outside of the moments you ask a question.</li>
  <li>Cookies, browser storage, or page data we do not explicitly need.</li>
  <li>Analytics, tracking pixels, or third-party trackers.</li>
</ul>

<h2>How your data is used</h2>
<p>When you send a message, the extension forwards the question, screenshot, and chat history to our Cloudflare Worker, which proxies the request to OpenAI's API. OpenAI returns a response that is shown to you in the chat panel. The request and response are not persisted on our backend.</p>

<h2>Third parties</h2>
<ul>
  <li><strong>OpenAI</strong> — model inference. Your question and screenshot are sent to OpenAI's <a href="https://openai.com/api/">API</a>. OpenAI's data usage is governed by their <a href="https://openai.com/policies/api-data-usage-policies/">API Data Usage Policies</a>; in particular, API inputs are not used to train models by default.</li>
  <li><strong>Cloudflare</strong> — request routing, edge compute, and rate limiting. Cloudflare may retain standard request logs for a short period as described in their <a href="https://www.cloudflare.com/privacypolicy/">Privacy Policy</a>.</li>
</ul>

<h2>Local storage</h2>
<p>The extension uses <code>chrome.storage.local</code> to remember your chosen UI language and cache localization files for 24 hours. Chat history exists only in the popup's memory and is discarded when the popup is closed. Nothing in <code>chrome.storage.local</code> leaves your device.</p>

<h2>Children</h2>
<p>Quizik is not directed at children under 13. We do not knowingly collect data from children.</p>

<h2>Your choices</h2>
<p>You can stop using Quizik at any time by removing the extension from <code>chrome://extensions</code>. This deletes all local storage data associated with it.</p>

<h2>Changes</h2>
<p>If we change this policy, we will update the "Last updated" date at the top. Substantive changes will be announced in the extension's release notes.</p>

<h2>Contact</h2>
<p>Questions: open an issue at <a href="https://github.com/zbybko/quizik/issues">github.com/zbybko/quizik/issues</a>.</p>
`);
}

export function termsPage(): Response {
  return page("Terms of Service", "2026-05-18", `
<p>By installing or using the Quizik browser extension and its hosted backend, you agree to these terms.</p>

<h2>The service</h2>
<p>Quizik is provided as a learning aid for understanding quiz questions. It returns AI-generated explanations and answers based on the content visible on your screen.</p>

<h2>"As is" — no warranty</h2>
<p>Quizik is provided "as is", without warranty of any kind. We do not guarantee that responses are correct, complete, or appropriate for your context. Always verify before relying on answers in graded work.</p>

<h2>Acceptable use</h2>
<p>You are responsible for how you use Quizik. Do not use it:</p>
<ul>
  <li>To violate any law or the rules of your institution, exam provider, or platform.</li>
  <li>To submit AI-generated work as your own where prohibited.</li>
  <li>To attempt to disrupt, attack, or overload our backend.</li>
  <li>To reverse-engineer the service for the purpose of building a competing product, except as permitted by the MIT license of the open-source code.</li>
</ul>

<h2>Academic integrity</h2>
<p>Quizik is a study companion. Most schools, universities, and certification providers have rules about using AI tools during graded assessments. You are solely responsible for understanding and following those rules. We disclaim any responsibility for academic consequences of your use.</p>

<h2>Open source</h2>
<p>The extension and Worker source code are released under the MIT license at <a href="https://github.com/zbybko/quizik">github.com/zbybko/quizik</a>. The hosted backend infrastructure is operated by the project maintainer and is not part of the open-source distribution.</p>

<h2>Rate limits and abuse</h2>
<p>To protect the service, we apply per-IP rate limits and may block clients that appear abusive. We may suspend or terminate access without notice for any reason, including violations of these terms.</p>

<h2>Liability</h2>
<p>To the maximum extent permitted by law, the maintainers of Quizik are not liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, arising from your use of the service.</p>

<h2>Changes</h2>
<p>We may update these terms. Continued use after a change indicates acceptance of the new terms. The "Last updated" date at the top of this page reflects the most recent change.</p>

<h2>Contact</h2>
<p>Questions: open an issue at <a href="https://github.com/zbybko/quizik/issues">github.com/zbybko/quizik/issues</a>.</p>
`);
}
