import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, setLocale, detectBrowserLocale } from "../i18n/index.js";

const DEFAULT_BACKEND_URL = "http://localhost:8787";
const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

const LANGUAGE_NAMES = {
  en: "English",
  es: "Español",
  zh: "中文",
  hi: "हिन्दी",
  ar: "العربية"
};

function normalizeBackendUrl(value) {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [appSharedSecret, setAppSharedSecret] = useState("");
  const [uiLocale, setUiLocaleState] = useState(i18n.language || DEFAULT_LOCALE);
  const [status, setStatus] = useState("");

  useEffect(() => {
    chrome.storage.local.get(
      { backendUrl: DEFAULT_BACKEND_URL, appSharedSecret: "", uiLocale: "" },
      (res) => {
        setBackendUrl(res.backendUrl);
        setAppSharedSecret(res.appSharedSecret);
        setUiLocaleState(res.uiLocale || detectBrowserLocale());
      }
    );
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    await chrome.storage.local.set({
      backendUrl: normalizeBackendUrl(backendUrl),
      appSharedSecret
    });
    setStatus(t("options.saved"));
    setTimeout(() => setStatus(""), 2000);
  }

  async function onLocaleChange(e) {
    const next = e.target.value;
    setUiLocaleState(next);
    await setLocale(next);
  }

  return (
    <main className="w-[min(560px,calc(100vw-32px))] mx-auto my-12 p-8 border border-line rounded-xl bg-surface">
      <header className="flex items-center gap-3 mb-6 pb-5 border-b border-line">
        <img src={iconUrl} alt="" className="w-8 h-8 rounded-lg bg-accent-soft p-1 object-contain" />
        <h1 className="m-0 text-base font-semibold tracking-tight">{t("options.title")}</h1>
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
    </main>
  );
}
