# Repository Instructions

## Branching strategy
Every piece of new work must live in its own branch. Never commit new features,
fixes, or refactors directly to `main` or `fsd-refactor`.

| Type | Branch name |
|---|---|
| New feature | `feature/<short-description>` |
| Bug fix | `fix/<short-description>` |
| Refactor | `refactor/<short-description>` |
| Release / chore | `chore/<short-description>` |

Workflow: create branch → do work → open PR → merge → delete branch.
`main` is always deployable.

- For extension debugging, always use the popup console as the primary log surface. Content scripts should return diagnostics to the popup when practical, and successful auto-apply flows should log the same high-signal diagnostics there instead of requiring the page DevTools console.
- Logs must appear ONLY in the popup console. Do not call `console.log` / `console.warn` / `console.table` / `debugLog` / `debugWarn` from `extension/content.js` or `extension/background.js` — instead, attach the diagnostics to the response payload (e.g. on `result.detected` or `result.diagnostics`) and let the popup print them via `console.log` in `src/popup/App.vue`. Content-script and background logging pollutes the page's DevTools and the service-worker console, which the user does not check.
