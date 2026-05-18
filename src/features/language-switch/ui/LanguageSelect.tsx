import { useTranslation } from "react-i18next";
import { LANGUAGE_NAMES, SUPPORTED_LOCALES } from "@entities/locale";
import { setLocale } from "@shared/lib/i18n";

interface LanguageSelectProps {
  value: string;
  onChange: (locale: string) => void;
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useTranslation();

  async function handle(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    onChange(next);
    await setLocale(next);
  }

  return (
    <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
      {t("options.language")}
      <select
        value={value}
        onChange={handle}
        className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>{LANGUAGE_NAMES[loc] || loc}</option>
        ))}
      </select>
    </label>
  );
}
