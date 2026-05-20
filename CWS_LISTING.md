# Chrome Web Store — Submission Guide

Everything needed to submit Quizik to the Chrome Web Store. Copy/paste sections directly into the developer console.

---

## 0. Prerequisites

- **Developer account** — sign up at https://chrome.google.com/webstore/devconsole
  - One-time **$5 USD** fee, requires a Google account and a payment method
  - Typical first-time-developer review takes **3–7 days**; subsequent updates usually <24h
- **Hosted Privacy Policy URL** — https://quizik-backend.zakhar-bybko.workers.dev/privacy ✅
- **Hosted Terms URL** — https://quizik-backend.zakhar-bybko.workers.dev/terms ✅
- **Production build packaged**:
  ```sh
  npm run package
  ```
  Output: `dist/quizik-v0.1.0.zip` — this is the file you upload.

---

## 1. Listing copy

### Name
```
Quizik — AI study chat for any quiz page
```

### Short description (max 132 chars)
```
AI study chat for any quiz page. Ask questions, get hints, understand the concept behind the answer.
```

### Detailed description (markdown is NOT supported; plain text only)
```
Quizik turns any online quiz into a chat with an AI tutor.

Open a quiz page (Moodle, online courses, certification practice tests, anything), click the Quizik icon, and start asking:

• "Break down this question for me"
• "Explain the key concept in simple terms"
• "Which options are definitely wrong, and why?"
• Or just paste your own follow-up question

Quizik reads the visible question and answer options, optionally captures a screenshot of the visible tab, and sends them to an AI model along with your chat history. The response is shown in a clean chat panel right next to the page.

WHY QUIZIK
✓ Conversational, not one-shot — keep asking follow-ups
✓ Markdown rendering for code, lists, tables
✓ Works on any quiz site — no per-site setup
✓ Multilingual UI: English, Español, 中文, हिन्दी, العربية, Русский, Українська
✓ Browser language auto-detected, switch anytime
✓ Open source: github.com/zbybko/quizik

PRIVACY
• Only visible page text is read; password fields, hidden elements, scripts, styles, cookies, and storage are skipped.
• Each request is sent to our backend, which proxies it to OpenAI's API. Neither party stores your messages or screenshots.
• No analytics, no tracking, no ads.
• Full Privacy Policy: https://quizik-backend.zakhar-bybko.workers.dev/privacy

ACADEMIC INTEGRITY
Quizik is a study companion. Most institutions have rules about AI tools during graded assessments — you are responsible for following them. See full Terms: https://quizik-backend.zakhar-bybko.workers.dev/terms
```

### Category
- **Productivity** (primary)

### Language
- English (US) — listing primary
- (Localizations for other languages can be added later via the developer console)

---

## 2. Privacy practices answers

In the **Privacy practices** tab, answer:

**Single purpose**
```
Quizik provides an AI-powered chat panel that helps users understand questions on quiz pages.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `activeTab` | Read the visible text and capture a screenshot of the current quiz page only when the user opens the popup and asks a question. |
| `storage` | Persist the user's chosen UI language and cached localization files in `chrome.storage.local`. |
| `host_permissions: <all_urls>` | The content script needs to read visible quiz content on any site the user opens it on. Reads happen only when the user explicitly opens the popup. |

**Remote code**
- ❌ "I am not using remote code." — all extension JS is bundled, only data is fetched at runtime.

**Data usage** — declare collection of:
- ✅ **Web history** — only the URL/title of the page being asked about, sent with each request.
- ✅ **User communications** — the chat messages the user types and the AI responses.

For each data type, declare:
- Used to provide the core feature (chat with AI about visible page)
- Not sold to third parties
- Not used for purposes unrelated to the feature
- Not used for creditworthiness or lending

**Privacy Policy URL**
```
https://quizik-backend.zakhar-bybko.workers.dev/privacy
```

---

## 3. Visual assets

Take screenshots yourself — the Chrome Web Store rejects auto-generated mockups.

### Required: 1–5 screenshots
- **Size**: 1280×800 OR 640×400 (PNG/JPG)
- **Suggested**:
  1. Popup open on a real quiz page, showing the empty state with the 3 suggestion chips
  2. Popup mid-conversation with markdown-rendered answer (multi-paragraph, bold, lists)
  3. Mode toggles in focus — "Answer only" active
  4. Settings page with language selector
  5. Hero shot — Quizik popup next to a quiz, captioned

**How to take them on macOS**:
```sh
# Resize Chrome window to 1280×800 first (use Rectangle / Magnet)
# Cmd+Shift+5 → "Capture Selected Window" → click the popup
# Or popup as standalone window: click extension icon, then Cmd+Shift+4 → spacebar → click window
```

### Recommended: small promotional tile
- **440×280** PNG/JPG
- Shows up in search results & "Editor's picks"
- Should include the Quizik logo + tagline "AI study chat for any quiz"

### Optional: marquee promotional tile
- **1400×560** PNG/JPG — for featured listings (rarely shown to new extensions)

---

## 4. Submission flow

1. **Upload package**
   - https://chrome.google.com/webstore/devconsole → New item
   - Drag `dist/quizik-v0.1.0.zip`

2. **Store listing tab**
   - Paste Name, Short description, Detailed description from above
   - Upload screenshots (1280×800)
   - Upload promotional tile (440×280) if you have it
   - Pick category: Productivity
   - Language: English (US)

3. **Privacy practices tab**
   - Paste single-purpose statement
   - For each permission, paste justification
   - Tick "Not using remote code"
   - Declare data collection (Web history + User communications) with the answers above
   - Paste Privacy Policy URL

4. **Distribution tab**
   - Visibility: **Public** (or **Unlisted** for soft launch — works but doesn't show in search; share link manually)
   - Regions: All (or restrict if you have legal concerns)
   - Pricing: Free

5. **Submit for review**
   - First-time review: 3–7 business days
   - You'll get email when approved or if changes are required

---

## 5. Post-approval

- Pin the listing URL in the GitHub README
- Add an "Install from Chrome Web Store" badge
- Update `extension/manifest.json` → `homepage_url` to the CWS listing URL (more clicks back from the popup → store reviews)
- Start the marketing motion (Reddit, TikTok, Product Hunt — see plan)

---

## 6. Updating the listing later

After the initial review, future updates:
1. Bump `version` in `extension/manifest.json` (e.g. `0.1.1`)
2. `npm run package`
3. Upload the new zip in the devconsole → Package tab
4. Submit — updates usually approved in <24h

---

## Reference URLs

- Devconsole: https://chrome.google.com/webstore/devconsole
- Program policies: https://developer.chrome.com/docs/webstore/program-policies
- Privacy policy requirements: https://developer.chrome.com/docs/webstore/user-data
- Best practices: https://developer.chrome.com/docs/webstore/best_practices
