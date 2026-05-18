import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./fallback/en.json";

export const SUPPORTED_LOCALES = ["en", "es", "zh", "hi", "ar", "ru", "uk"];
export const DEFAULT_LOCALE = "en";
const CACHE_KEY_PREFIX = "i18nCache:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h on client

/** Pick best supported locale from browser preferences. */
export function detectBrowserLocale() {
  const candidates = []
    .concat(navigator.languages || [])
    .concat(navigator.language ? [navigator.language] : [])
    .map((lang) => String(lang).toLowerCase());

  for (const candidate of candidates) {
    const base = candidate.split("-")[0];
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Read cached translation tree from chrome.storage.local. */
async function readCache(locale) {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY_PREFIX + locale], (res) => {
      const cached = res[CACHE_KEY_PREFIX + locale];
      if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        resolve(cached.tree);
      } else {
        resolve(null);
      }
    });
  });
}

async function writeCache(locale, tree) {
  await chrome.storage.local.set({
    [CACHE_KEY_PREFIX + locale]: { tree, fetchedAt: Date.now() }
  });
}

/** Ask background.js to proxy the locale fetch (it knows the backend URL + secret). */
function fetchLocaleViaBackground(locale) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "QSA_GET_LOCALE", payload: { locale } }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) { reject(new Error(err.message)); return; }
      if (!response?.ok) { reject(new Error(response?.error || "Locale fetch failed")); return; }
      resolve(response.result);
    });
  });
}

async function loadLocale(locale) {
  const cached = await readCache(locale);
  if (cached) return cached;

  try {
    const { tree } = await fetchLocaleViaBackground(locale);
    await writeCache(locale, tree);
    return tree;
  } catch (error) {
    console.warn(`[QSA i18n] failed to load locale "${locale}":`, error.message);
    return null;
  }
}

/**
 * Initialize i18next with bundled English fallback, then asynchronously
 * fetch the user's locale from the backend and swap to it.
 */
export async function initI18n() {
  const saved = await new Promise((resolve) => {
    chrome.storage.local.get({ uiLocale: "" }, (res) => resolve(res.uiLocale));
  });
  const requested = saved || detectBrowserLocale();

  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    resources: { [DEFAULT_LOCALE]: { translation: en } },
    interpolation: { escapeValue: false },
    returnObjects: true
  });

  if (requested !== DEFAULT_LOCALE) {
    const tree = await loadLocale(requested);
    if (tree) {
      i18n.addResourceBundle(requested, "translation", tree, true, true);
      await i18n.changeLanguage(requested);
      document.documentElement.lang = requested;
      document.documentElement.dir = requested === "ar" ? "rtl" : "ltr";
    }
  } else {
    document.documentElement.lang = DEFAULT_LOCALE;
    document.documentElement.dir = "ltr";
  }

  // Warm cache for en too (in case backend version differs from bundled fallback)
  loadLocale(DEFAULT_LOCALE).then((tree) => {
    if (tree) i18n.addResourceBundle(DEFAULT_LOCALE, "translation", tree, true, true);
  });

  return i18n;
}

/** Manual language switch — used by options UI. */
export async function setLocale(locale) {
  const target = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  await chrome.storage.local.set({ uiLocale: target });

  if (target !== DEFAULT_LOCALE) {
    const tree = await loadLocale(target);
    if (tree) i18n.addResourceBundle(target, "translation", tree, true, true);
  }
  await i18n.changeLanguage(target);
  document.documentElement.lang = target;
  document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
}

export default i18n;
