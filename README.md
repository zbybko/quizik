# Quizik

Chrome / Chromium Manifest V3 extension that opens a chat panel over any quiz page. It extracts the visible question + options, takes a screenshot of the current tab, and asks an LLM via your own backend.

Features:
- Chat interface with multi-turn history, markdown rendering, and three suggested prompts on empty state
- **«Ответ сразу»** mode returns only the answer text
- **«Авто-режим»** auto-selects the answer on the page and clicks "Next", looping through the whole quiz
- All OpenAI traffic goes through your local backend — no API key is stored in the browser

## Stack

- Extension: Manifest V3, React + TypeScript + Tailwind CSS v4 (single bundle shared by popup and options), vanilla JS (content script, service worker), built with Vite
- Backend: Node 20+ (no dependencies, just `node --env-file`)
- LLM: OpenAI Responses API (model configurable via `OPENAI_MODEL`)

## Setup

1. Build the Vue popup and options UI:

   ```sh
   npm install
   npm run build
   ```

2. Configure and start the backend:

   ```sh
   cd backend
   cp .env.example .env
   # Edit .env — set OPENAI_API_KEY and APP_SHARED_SECRET
   npm start
   ```

   The backend loads `.env` with **override semantics**, so values in `.env` always win over shell env vars.

3. Load the extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `extension/` folder

4. Right-click the extension icon → **Options** → set:
   - Backend URL (default `http://localhost:8787`)
   - The same `APP_SHARED_SECRET` you put in `.env`

5. Open a quiz page, click the extension icon, and start chatting.

## Backend routes

- `GET /health` — liveness check
- `POST /ai/hint` — accepts `{ mode, screenshotDataUrl, history, userText, question, options, ... }` and returns `{ result: { hint, detected } }`

When `APP_SHARED_SECRET` is set, requests must include `Authorization: Bearer <secret>`.

## Development

```sh
npm run build       # build popup/options (Vite)
npm run dev         # build in watch mode
npm run check       # node --check + extractor smoke test
```

After editing files under `src/` (React + TS components, Tailwind CSS), rerun `npm run build`. Changes in `extension/content.js`, `extension/background.js`, `extension/manifest.json`, or `.html` files do not need a rebuild — just reload the extension in `chrome://extensions`.

`popup.html` and `options.html` load the **same bundle** (`extension/build/app.js`). The app picks the view from `<body data-view="settings">` on the options page; otherwise it renders the chat with a slide-in settings drawer when you click the gear icon.

## Privacy

- The content script extracts only visible text. Password fields, hidden elements, scripts, styles, cookies, and browser storage are ignored.
- Each request sends the visible-tab screenshot, extracted text, and the chat history to **your** backend.
- The OpenAI API key lives only on the backend (`OPENAI_API_KEY` env var).
- The shared secret in `chrome.storage.local` is an MVP — replace with real auth before any public use.
- Auto-mode selects radios/checkboxes and clicks "next" buttons. It does **not** click "finish" / "submit all" / "сдать" / "завершить" controls (see `isDangerousNavigationText` in `extension/content.js`).

## Project layout

```
backend/         Node HTTP server proxying to OpenAI
extension/       Manifest V3 extension (loaded directly by Chrome)
extension/build/ Compiled popup/options bundles (gitignored, run npm run build)
src/app/         Unified React + TypeScript app (Chat + Settings)
src/i18n/        i18next config and bundled English fallback
tests/           Extractor smoke test
```

## Notes for contributors

See [AGENTS.md](./AGENTS.md). TL;DR: all logs must go through the popup console — content/background scripts attach diagnostics to the message payload, popup prints them. Page DevTools and the service-worker console stay clean.
