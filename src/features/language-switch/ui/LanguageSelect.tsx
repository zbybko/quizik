import { useTranslation } from "react-i18next";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES } from "@entities/locale";
import { setLocale } from "@shared/lib/i18n";
import { analytics } from "@shared/lib/analytics";

interface LanguageSelectProps {
  value: string;
  onChange: (locale: string) => void;
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useTranslation();

  async function handle(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    onChange(next);
    void analytics.languageChanged(next);
    await setLocale(next);
  }

  return (
    <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
      {t("options.language")}
      <div className="relative">
        <select
          value={value}
          onChange={handle}
          className="w-full appearance-none px-4 py-3 border border-line rounded-xl bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer pr-10"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc} value={loc}>{LANGUAGE_NAMES[loc] || loc}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-2 text-base">▾</span>
      </div>
    </label>
  );
}
