import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, detectBrowserLocale } from "@entities/locale";
import { BackendConfigForm } from "@features/backend-config";
import { LanguageSelect } from "@features/language-switch";
import { storageGet } from "@shared/lib/storage";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

interface SettingsPageProps {
  /** When true, render as inline panel (no card chrome). */
  embedded?: boolean;
  onClose?: () => void;
}

export function SettingsPage({ embedded = false, onClose }: SettingsPageProps) {
  const { t, i18n } = useTranslation();
  const [uiLocale, setUiLocale] = useState<string>(i18n.language || DEFAULT_LOCALE);

  useEffect(() => {
    void (async () => {
      const { uiLocale: stored } = await storageGet({ uiLocale: "" });
      setUiLocale(stored || detectBrowserLocale());
    })();
  }, []);

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

      <div className="grid gap-[18px]">
        <LanguageSelect value={uiLocale} onChange={setUiLocale} />
        <BackendConfigForm />
      </div>

      <p className="mt-6 px-4 py-3.5 rounded-lg bg-surface-soft text-ink-2 text-xs leading-relaxed">
        {t("options.note")}
      </p>
    </>
  );

  if (embedded) {
    return <div className="p-4 overflow-y-auto qsa-scroll">{card}</div>;
  }

  return (
    <main className="w-[min(560px,calc(100vw-32px))] mx-auto my-12 p-8 border border-line rounded-xl bg-surface">
      {card}
    </main>
  );
}
