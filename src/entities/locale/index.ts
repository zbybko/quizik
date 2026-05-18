export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  LANGUAGE_NAMES,
  isSupportedLocale,
  detectBrowserLocale
} from "./config/supported";
export type { SupportedLocale } from "./config/supported";
export type { LocaleTree, CachedTree } from "./model/tree";
export { default as enFallbackTree } from "./config/en.fallback.json";
