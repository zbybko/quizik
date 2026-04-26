# Quiz Study Assistant

Chrome/Chromium Manifest V3 extension that provides learning hints or direct answers for visible quiz questions. It can attach a screenshot of the visible tab so image-based questions can be understood. It does not click controls or submit forms.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select the `extension` folder.
4. Open the extension options and paste your OpenAI API key.
5. Open a quiz page or `demo/quiz.html`, then click the extension icon.
6. Choose **Подсказка** for guided reasoning or **Ответ сразу** for a direct answer explanation.

## Privacy and safety

- The content script extracts only visible text from the current page.
- When a hint or answer is requested, the extension also captures the visible area of the current tab and sends it to OpenAI with the extracted text.
- Password fields, hidden elements, scripts, styles, cookies, and browser storage are not read by the extractor.
- The OpenAI API key is stored in `chrome.storage.local` and is used only by the extension service worker.
- The hint mode prompt instructs the model to explain concepts without choosing or ranking answers.
- The answer mode prompt asks for a direct answer with reasoning, but still does not interact with the page.

## Development checks

```sh
node --check extension/background.js
node --check extension/content.js
node --check extension/popup.js
node --check extension/options.js
node tests/extractor-smoke.mjs
```
