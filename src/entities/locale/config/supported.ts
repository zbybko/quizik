export const SUPPORTED_LOCALES = ["en", "es", "zh", "hi", "ar", "ru", "uk"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";
export const RTL_LOCALES: SupportedLocale[] = ["ar"];

export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  zh: "中文",
  hi: "हिन्दी",
  ar: "العربية",
  ru: "Русский",
  uk: "Українська"
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick best supported locale from browser preferences. */
export function detectBrowserLocale(): SupportedLocale {
  const raw: string[] = [
    ...((navigator.languages as readonly string[]) || []),
    ...(navigator.language ? [navigator.language] : [])
  ];
  for (const candidate of raw.map((l) => String(l).toLowerCase())) {
    const base = candidate.split("-")[0] ?? "";
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
