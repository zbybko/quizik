import i18n, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE,
  RTL_LOCALES,
  detectBrowserLocale,
  enFallbackTree,
  isSupportedLocale,
  type LocaleTree,
  type CachedTree,
  type SupportedLocale
} from "@entities/locale";
import { I18N_CACHE_KEY_PREFIX, I18N_CACHE_TTL_MS } from "@shared/config";
import { storageGet, storageSet } from "@shared/lib/storage";

async function readCache(locale: SupportedLocale): Promise<LocaleTree | null> {
  const key = I18N_CACHE_KEY_PREFIX + locale;
  const res = await storageGet<Record<string, CachedTree | undefined>>({ [key]: undefined });
  const cached = res[key];
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < I18N_CACHE_TTL_MS) {
    return cached.tree;
  }
  return null;
}

async function writeCache(locale: SupportedLocale, tree: LocaleTree): Promise<void> {
  await storageSet({
    [I18N_CACHE_KEY_PREFIX + locale]: { tree, fetchedAt: Date.now() } satisfies CachedTree
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
        if (!response?.ok || !response.result) {
          reject(new Error(response?.error || "Locale fetch failed"));
          return;
        }
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
  document.documentElement.dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/**
 * Initialize i18next with bundled English fallback, then asynchronously
 * fetch the user's locale and swap to it.
 */
export async function initI18n(): Promise<I18nInstance> {
  const { uiLocale } = await storageGet({ uiLocale: "" });
  const requested: SupportedLocale = uiLocale && isSupportedLocale(uiLocale)
    ? uiLocale
    : detectBrowserLocale();

  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources: { [DEFAULT_LOCALE]: { translation: enFallbackTree } },
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

/** Manual language switch. */
export async function setLocale(locale: string): Promise<void> {
  const target: SupportedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  await storageSet({ uiLocale: target });
  if (target !== DEFAULT_LOCALE) {
    const tree = await loadLocale(target);
    if (tree) i18n.addResourceBundle(target, "translation", tree, true, true);
  }
  await i18n.changeLanguage(target);
  applyDirAndLang(target);
}

export default i18n;
