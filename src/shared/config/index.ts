/**
 * True only when the bundle was built with `vite build --mode development`
 * (i.e. `npm run build:dev`). Production `npm run build` flips this to false,
 * which hides the auto-mode toggle and disables the auto-mode iteration loop.
 * Used to keep the "select answer + advance" capability out of public builds
 * for Chrome Web Store / academic-integrity reasons.
 *
 * Note: must check MODE, not DEV — `import.meta.env.DEV` is always false during
 * `vite build` regardless of --mode (DEV is only true under `vite serve`).
 */
export const IS_DEV_MODE: boolean = import.meta.env.MODE === "development";

export const AUTO_LOOP_DELAY_MS = 1200;
export const AUTO_LOOP_MAX_ITERATIONS = 50;

/**
 * Production Cloudflare Worker. Extension uses this by default so new installs
 * work out-of-the-box without any configuration.
 * Override via Settings (visible only in dev builds) for local backend testing.
 */
export const DEFAULT_BACKEND_URL = "https://quizik-backend.zakhar-bybko.workers.dev";

export const TAB_MESSAGE_RETRIES = 6;
export const TAB_MESSAGE_RETRY_DELAY_MS = 500;

export const I18N_CACHE_KEY_PREFIX = "i18nCache:";
export const I18N_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
