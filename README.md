# Quizik

A Chrome / Chromium Manifest V3 extension that opens a chat panel over any quiz page. It extracts the visible question and options, captures a screenshot of the current tab, and asks an LLM via your own backend.

## Features

- **Chat UI** — multi-turn conversation with the assistant. Markdown rendering (headings, lists, code, tables, links). Three suggested prompts on empty state.
- **Answer-only mode** — returns just the answer text, nothing else.
- **Auto mode** — picks the answer on the page and clicks the "next" button, looping through the whole quiz until the assistant or the page runs out. **Dev-only** — hidden in production builds for Chrome Web Store / academic-integrity reasons.
- **Multilingual** — UI ships in 7 locales (English, Español, 中文, हिन्दी, العربية, Русский, Українська). Picks up the browser language automatically; manual switcher in settings. RTL for Arabic.
- **Translation tree served by backend** — JSON locale files live in `backend/locales/` and are served via `GET /i18n/:locale`. Optionally swap to a remote POEditor-style worker via `LOCALE_WORKER_URL`.
- **No browser-side OpenAI key** — all model traffic goes through your local backend. Only a shared secret lives in `chrome.storage.local`.

## Stack

- **Extension** — Manifest V3, React 19 + TypeScript + Tailwind CSS v4, vanilla JS content / service-worker scripts, built with Vite.
  - One bundle (`extension/build/app.js`) shared by the popup and the options page.
- **Backend** — Node 20+, zero external dependencies, serves both AI requests and the locale tree.
- **LLM** — OpenAI Responses API. Model configurable via `OPENAI_MODEL`.

## Setup

1. Install dependencies and build the bundle:

   ```sh
   npm install
   npm run build
   ```

2. Configure and start the backend:

   ```sh
   cd backend
   cp .env.example .env
   # Edit .env — at minimum set OPENAI_API_KEY and APP_SHARED_SECRET
   npm start          # production (run once, no reload)
   npm run dev        # hot reload: restarts on changes to server.mjs, locales/, config/, .env
   ```

   `npm run dev` uses Node 20's built-in `--watch` flag — no nodemon required.
   The backend loads `.env` with **override semantics**, so values in `.env` always win over shell env vars (no surprises if you have `OPENAI_API_KEY` exported globally).

3. Load the extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - **Load unpacked** → select the `extension/` folder

4. Open the settings (click the gear icon in the popup, or right-click the toolbar icon → **Options**) and set:
   - Backend URL (default `http://localhost:8787`)
   - The same `APP_SHARED_SECRET` you put in `.env`
   - Optional: pick a different UI language

5. Open a quiz page → click the extension icon → start chatting.

## Backend routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check. |
| `GET` | `/i18n/locales` | Returns `{ locales: [...], default: "en" }`. |
| `GET` | `/i18n/:locale` | Returns `{ locale, tree }`. Falls back to `en` for unsupported locales. |
| `GET` | `/config/navigation` | Returns `{ next, dangerous, back }` — multilingual button-text markers used by auto-mode to recognize "next question" / "finish attempt" / "back" buttons. Add new markers in `backend/config/navigation.json` — clients refresh on browser startup and every 6 h. |
| `POST` | `/ai/hint` | AI chat. Body: `{ mode, screenshotDataUrl, history, userText, question, options, ... }`. Returns `{ result: { hint, detected } }`. |

When `APP_SHARED_SECRET` is set, `/ai/hint` requires `Authorization: Bearer <secret>`. The `/i18n/*` endpoints are public so the extension can warm them before auth flows exist.

## Backend env

| Var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | _(required)_ | OpenAI key. |
| `OPENAI_MODEL` | `gpt-5.5` | Override model name. |
| `PORT` | `8787` | Listen port. |
| `APP_SHARED_SECRET` | `""` | If set, required as Bearer token on `/ai/hint`. |
| `LOCALE_WORKER_URL` | _(unset)_ | If set, backend proxies `GET /i18n/:locale` to `${LOCALE_WORKER_URL}/${locale}.json` (POEditor-style remote worker). Otherwise it reads `backend/locales/*.json` from disk. |
| `LOCALE_CACHE_TTL_MS` | `300000` | In-memory locale cache TTL (5 min). |

## Development

```sh
npm run build       # production build (auto-mode toggle hidden, loop disabled)
npm run build:dev   # development build (auto-mode toggle visible + active)
npm run dev         # development build in watch mode
npm run typecheck   # tsc --noEmit
npm run check       # typecheck + node --check + extractor smoke test + backend syntax check
```

The `IS_DEV_MODE` flag (`src/shared/config/index.ts`) is checked at compile time via `import.meta.env.MODE === "development"`. Vite tree-shakes the dev-only branches out of the production bundle, so the auto-mode JSX literally does not exist in `npm run build` output — verify with `grep "· dev" extension/build/app.js` (0 hits in prod, 1+ in dev).

Workflow rules:
- After editing anything under `src/` → run `npm run build`, then reload the extension in `chrome://extensions`.
- After editing `extension/content.js`, `extension/background.js`, `extension/manifest.json`, or any `.html` → just reload (no rebuild).
- After editing `backend/locales/*.json` → restart the backend, then in DevTools clear `chrome.storage.local` keys starting with `i18nCache:` (or wait 24h for the client-side cache to expire).

### Single bundle, two HTML entries

`popup.html` and `options.html` both load `extension/build/app.js`. The app picks its view from `<body data-view="settings">`:

- `popup.html` → no attribute → renders `<Chat />` (with a slide-in settings drawer triggered by the gear icon).
- `options.html` → `data-view="settings"` → renders the full-page `<Settings />`.

This means edits to the chat or settings UI compile to one file and there's no duplicated code.

## Privacy & safety

- The content script extracts only visible text. Password fields, hidden elements, scripts, styles, cookies, and browser storage are ignored.
- Each `/ai/hint` request sends the visible-tab screenshot, extracted text, and the chat history to **your** backend — nowhere else.
- The OpenAI API key lives only on the backend (`OPENAI_API_KEY` env var); it is never in `chrome.storage` or any extension file.
- The shared secret in `chrome.storage.local` is an MVP for single-user setups — replace with real auth before any public deployment.
- Auto-mode selects radios/checkboxes and clicks "next" buttons by visible text (`далее`, `next`, `continue`, `сохранить и перейти`, etc.). It does **not** click "finish" / "submit all" / "сдать" / "завершить" / `submit all and finish` — see `isDangerousNavigationText` in `extension/content.js`.
- All logs go to the popup console only — content / background scripts ship diagnostics back in the message payload. The page DevTools and service-worker console stay clean. See [AGENTS.md](./AGENTS.md).

## Project layout

```
backend/             Node HTTP server (AI proxy + locale tree + nav-marker config)
backend/locales/     {en,es,zh,hi,ar,ru,uk}.json — UI translations
backend/config/      navigation.json — multilingual "next" / "finish" / "back" markers
extension/           Manifest V3 extension (loaded directly by Chrome)
extension/build/     Compiled app.{js,css} (gitignored — run `npm run build`)
tests/               Extractor smoke test (no Chrome required)

src/                 Frontend in Feature-Sliced Design layout
src/app/             Entry point + root App (decides chat vs settings view)
src/pages/           Page compositions
   chat/               Popup chat page (header + messages + composer)
   settings/           Settings page (drawer-mode + standalone-mode)
src/features/        User actions
   auto-loop/          useChatLoop hook — conversation state + auto-mode loop
   chat-composer/      Composer textarea + suggestion chips
   mode-toggles/       "Answer only" / "Auto mode" pills
   language-switch/    UI language picker
   backend-config/     Backend URL + shared secret form
src/entities/        Business entities
   message/            ChatMessage type, MessageBubble, TypingIndicator
   locale/             SupportedLocale, language names, bundled en fallback
   tab-context/        chrome.tabs helpers + extracted-question / hint types
src/shared/          Reusable plumbing (no business logic)
   api/                RuntimeResponse, ForwardedEvent types
   config/             Constants (AUTO_LOOP_DELAY_MS, DEFAULT_BACKEND_URL, ...)
   lib/i18n/           initI18n, setLocale (uses entities/locale)
   lib/markdown/       renderMarkdown (marked + DOMPurify)
   lib/messaging/      sendTabMessage, sendRuntimeMessage, retry logic
   lib/storage/        Promise wrappers around chrome.storage.local

Path aliases (tsconfig + vite): @app, @pages, @features, @entities, @shared.
Imports flow downward through layers — pages → features → entities → shared.
```

## License

MIT — see [LICENSE](./LICENSE).
