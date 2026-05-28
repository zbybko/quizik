import { useTranslation } from "react-i18next";
import { DEFAULT_BACKEND_URL } from "@shared/config";

interface PaywallBannerProps {
  plan: "anon" | "free" | "pro";
  usageToday: number;
  dailyLimit: number;
  isSignedIn: boolean;
  onSignIn: () => void;
  onUpgrade: () => void;
}

export function PaywallBanner({
  plan,
  usageToday,
  dailyLimit,
  isSignedIn,
  onSignIn,
  onUpgrade,
}: PaywallBannerProps) {
  const { t } = useTranslation();
  const remaining = Math.max(0, dailyLimit - usageToday);
  const isLimitReached = remaining === 0;
  const isWarning = !isLimitReached && remaining <= 5;

  if (!isLimitReached && !isWarning) return null;

  return (
    <div className={`shrink-0 flex flex-col gap-2 px-3.5 py-3 border-t ${
      isLimitReached
        ? "bg-[color-mix(in_srgb,#ea580c_8%,transparent)] border-[color-mix(in_srgb,#ea580c_25%,transparent)]"
        : "bg-surface-soft border-line"
    }`}>
      {isLimitReached ? (
        <>
          <p className="text-[13px] font-semibold text-ink-1">
            {plan === "anon"
              ? t("paywall.anonLimitTitle", { defaultValue: "Daily limit reached" })
              : t("paywall.freeLimitTitle", { defaultValue: "Daily limit reached" })}
          </p>
          <p className="text-[12px] text-ink-2 leading-snug">
            {plan === "anon"
              ? t("paywall.anonLimitDesc", { defaultValue: "Sign in for 20 free requests/day. Upgrade to Pro for unlimited access." })
              : t("paywall.freeLimitDesc", { defaultValue: "You've used all 20 free requests today. Upgrade to Pro for unlimited access." })}
          </p>
          <div className="flex gap-2 mt-1">
            {!isSignedIn && (
              <button
                onClick={onSignIn}
                className="flex-1 py-2 rounded-lg border border-line bg-surface text-ink-1 text-[13px] font-medium hover:border-accent hover:text-accent transition-colors"
              >
                {t("paywall.signIn", { defaultValue: "Sign in" })}
              </button>
            )}
            <button
              onClick={onUpgrade}
              className="flex-1 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors"
            >
              {t("paywall.upgrade", { defaultValue: "Upgrade to Pro — $7/mo" })}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-ink-2">
          {t("paywall.warning", {
            defaultValue: `${remaining} free requests left today.`,
            remaining,
          })}
          {" "}
          <button
            onClick={onUpgrade}
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {t("paywall.upgradeLink", { defaultValue: "Upgrade to Pro" })}
          </button>
        </p>
      )}
    </div>
  );
}
