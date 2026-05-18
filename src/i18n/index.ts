import i18n, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./fallback/en.json";

export const SUPPORTED_LOCALES = ["en", "es", "zh", "hi", "ar", "ru", "uk"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

const CACHE_KEY_PREFIX = "i18nCache:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h on client

type LocaleTree = Record<string, unknown>;
type CachedTree = { tree: LocaleTree; fetchedAt: number };

function isSupported(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick best supported locale from browser preferences. */
export function detectBrowserLocale(): SupportedLocale {
  const raw: string[] = [
    ...((navigator.languages as readonly string[]) || []),
    ...(navigator.language ? [navigator.language] : [])
  ];
  const candidates = raw.map((lang) => String(lang).toLowerCase());

  for (const candidate of candidates) {
    const base = candidate.split("-")[0] ?? "";
    if (isSupported(base)) return base;
  }
  return DEFAULT_LOCALE;
}

async function readCache(locale: SupportedLocale): Promise<LocaleTree | null> {
  return new Promise((resolve) => {
    const key = CACHE_KEY_PREFIX + locale;
    chrome.storage.local.get([key], (res: Record<string, CachedTree | undefined>) => {
      const cached = res[key];
      if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        resolve(cached.tree);
      } else {
        resolve(null);
      }
    });
  });
}

async function writeCache(locale: SupportedLocale, tree: LocaleTree): Promise<void> {
  await chrome.storage.local.set({
    [CACHE_KEY_PREFIX + locale]: { tree, fetchedAt: Date.now() } satisfies CachedTree
  });
}

/** Ask background.js to proxy the locale fetch (it knows the backend URL + secret). */
function fetchLocaleViaBackground(locale: SupportedLocale): Promise<{ locale: string; tree: LocaleTree }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "QSA_GET_LOCALE", payload: { locale } },
      (response: { ok: boolean; result?: { locale: string; tree: LocaleTree }; error?: string }) => {
        const err = chrome.runtime.lastError;
        if (err) { reject(new Error(err.message)); return; }
        if (!response?.ok || !response.result) { reject(new Error(response?.error || "Locale fetch failed")); return; }
        resolve(response.result);
      }
    );
  });
}

async function loadLocale(locale: SupportedLocale): Promise<LocaleTree | null> {
  const cached = await readCache(locale);
  if (cached) return cached;

  try {
    const { tree } = await fetchLocaleViaBackground(locale);
    await writeCache(locale, tree);
    return tree;
  } catch (error) {
    console.warn(`[QSA i18n] failed to load locale "${locale}":`, (error as Error).message);
    return null;
  }
}

function applyDirAndLang(locale: SupportedLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

/**
 * Initialize i18next with bundled English fallback, then asynchronously
 * fetch the user's locale from the backend and swap to it.
 */
export async function initI18n(): Promise<I18nInstance> {
  const saved = await new Promise<string>((resolve) => {
    chrome.storage.local.get({ uiLocale: "" }, (res: { uiLocale: string }) => resolve(res.uiLocale));
  });
  const requested: SupportedLocale = saved && isSupported(saved) ? saved : detectBrowserLocale();

  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources: { [DEFAULT_LOCALE]: { translation: en } },
    interpolation: { escapeValue: false },
    returnObjects: true,
    returnNull: false
  });

  if (requested !== DEFAULT_LOCALE) {
    const tree = await loadLocale(requested);
    if (tree) {
      i18n.addResourceBundle(requested, "translation", tree, true, true);
      await i18n.changeLanguage(requested);
    }
    applyDirAndLang(tree ? requested : DEFAULT_LOCALE);
  } else {
    applyDirAndLang(DEFAULT_LOCALE);
  }

  // Warm cache for en (backend version may differ from bundled fallback)
  loadLocale(DEFAULT_LOCALE).then((tree) => {
    if (tree) i18n.addResourceBundle(DEFAULT_LOCALE, "translation", tree, true, true);
  });

  return i18n;
}

/** Manual language switch — used by settings UI. */
export async function setLocale(locale: string): Promise<void> {
  const target: SupportedLocale = isSupported(locale) ? locale : DEFAULT_LOCALE;
  await chrome.storage.local.set({ uiLocale: target });

  if (target !== DEFAULT_LOCALE) {
    const tree = await loadLocale(target);
    if (tree) i18n.addResourceBundle(target, "translation", tree, true, true);
  }
  await i18n.changeLanguage(target);
  applyDirAndLang(target);
}

export default i18n;
