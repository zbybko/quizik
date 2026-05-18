import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  setLocale,
  type SupportedLocale
} from "../i18n";

const DEFAULT_BACKEND_URL = "http://localhost:8787";
const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  zh: "中文",
  hi: "हिन्दी",
  ar: "العربية",
  ru: "Русский",
  uk: "Українська"
};

function normalizeBackendUrl(value: string): string {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}

interface SettingsProps {
  /** When true, render as inline panel (no card chrome). */
  embedded?: boolean;
  /** Shown when embedded — close button in header. */
  onClose?: () => void;
}

export default function Settings({ embedded = false, onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);
  const [appSharedSecret, setAppSharedSecret] = useState<string>("");
  const [uiLocale, setUiLocaleState] = useState<string>(i18n.language || DEFAULT_LOCALE);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    chrome.storage.local.get(
      { backendUrl: DEFAULT_BACKEND_URL, appSharedSecret: "", uiLocale: "" },
      (res: { backendUrl: string; appSharedSecret: string; uiLocale: string }) => {
        setBackendUrl(res.backendUrl);
        setAppSharedSecret(res.appSharedSecret);
        setUiLocaleState(res.uiLocale || detectBrowserLocale());
      }
    );
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await chrome.storage.local.set({
      backendUrl: normalizeBackendUrl(backendUrl),
      appSharedSecret
    });
    setStatus(t("options.saved"));
    setTimeout(() => setStatus(""), 2000);
  }

  async function onLocaleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setUiLocaleState(next);
    await setLocale(next);
  }

  const card = (
    <>
      <header className="flex items-center gap-3 mb-6 pb-5 border-b border-line">
        <img src={iconUrl} alt="" className="w-8 h-8 rounded-lg bg-accent-soft p-1 object-contain" />
        <h1 className="m-0 text-base font-semibold tracking-tight flex-1">{t("options.title")}</h1>
        {embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-md text-ink-2 hover:bg-surface-soft hover:text-ink-1 transition-colors text-[18px] leading-none"
          >×</button>
        )}
      </header>

      <form onSubmit={onSubmit} className="grid gap-[18px]">
        <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          {t("options.language")}
          <select
            value={uiLocale}
            onChange={onLocaleChange}
            className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <option key={loc} value={loc}>{LANGUAGE_NAMES[loc] || loc}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          {t("options.backendUrl")}
          <input
            type="url"
            autoComplete="off"
            placeholder="http://localhost:8787"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value.trim())}
            className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
          />
        </label>

        <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          {t("options.sharedSecret")}
          <input
            type="password"
            autoComplete="off"
            placeholder="change-me"
            value={appSharedSecret}
            onChange={(e) => setAppSharedSecret(e.target.value.trim())}
            className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
          />
        </label>

        <button
          type="submit"
          className="justify-self-start px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >{t("options.save")}</button>
      </form>

      {status && (
        <p className="mt-4 px-3.5 py-2.5 rounded-lg bg-accent-soft text-accent text-[13px] font-medium">{status}</p>
      )}

      <p className="mt-6 px-4 py-3.5 rounded-lg bg-surface-soft text-ink-2 text-xs leading-relaxed">
        {t("options.note")}
      </p>
    </>
  );

  if (embedded) {
    // Inline drawer inside the chat popup: no outer page chrome, fills container
    return <div className="p-4 overflow-y-auto qsa-scroll">{card}</div>;
  }

  return (
    <main className="w-[min(560px,calc(100vw-32px))] mx-auto my-12 p-8 border border-line rounded-xl bg-surface">
      {card}
    </main>
  );
}
