import { useTranslation } from "react-i18next";

interface ModeTogglesProps {
  answerMode: boolean;
  autoMode: boolean;
  hasMessages: boolean;
  onToggleAnswer: () => void;
  onToggleAuto: () => void;
  onClear: () => void;
}

export function ModeToggles({
  answerMode,
  autoMode,
  hasMessages,
  onToggleAnswer,
  onToggleAuto,
  onClear
}: ModeTogglesProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-1.5 flex-wrap items-center" role="group" aria-label="Modes">
      <button
        type="button"
        onClick={onToggleAnswer}
        title={answerMode ? t("toggles.answerOnlyTooltip.on") : t("toggles.answerOnlyTooltip.off")}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors ${
          answerMode
            ? "text-accent bg-accent-soft border-accent"
            : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${answerMode ? "bg-accent" : "bg-ink-3"}`} />
        {t("toggles.answerOnly")}
      </button>
      <button
        type="button"
        onClick={onToggleAuto}
        disabled={!answerMode}
        title={autoMode ? t("toggles.autoModeTooltip.on") : t("toggles.autoModeTooltip.off")}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          autoMode
            ? "text-secondary bg-secondary-soft border-secondary"
            : "text-ink-2 bg-surface border-line hover:text-ink-1 hover:border-line-strong"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${autoMode ? "bg-secondary" : "bg-ink-3"}`} />
        {t("toggles.autoMode")}
      </button>
      {hasMessages && (
        <button
          type="button"
          onClick={onClear}
          title={t("chat.clear")}
          className="ml-auto px-2.5 py-1 rounded-full text-[12px] text-ink-3 hover:text-ink-1 hover:bg-surface-soft transition-colors"
        >{t("chat.clear")}</button>
      )}
    </div>
  );
}
