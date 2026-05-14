# Repository Instructions

- For extension debugging, always use the popup console as the primary log surface. Content scripts should return diagnostics to the popup when practical, and successful auto-apply flows should log the same high-signal diagnostics there instead of requiring the page DevTools console.
