import { useEffect, useState } from "react";
import { DEFAULT_BACKEND_URL } from "@shared/config";

interface UsageData {
  plan: "anon" | "free" | "pro";
  usageToday: number;
  dailyLimit: number;
  email?: string;
  isSignedIn: boolean;
}

export function UsageCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const stored = await chrome.storage.local.get({
          authToken: "", authEmail: "", deviceId: ""
        });
        const headers: Record<string, string> = { "X-Device-ID": stored.deviceId || "unknown" };
        if (stored.authToken) headers["Authorization"] = `Bearer ${stored.authToken}`;
        const res = await fetch(`${DEFAULT_BACKEND_URL}/user/status`, { headers });
        const json = await res.json();
        setData({
          ...json.result,
          email: stored.authEmail || "",
          isSignedIn: Boolean(stored.authToken),
        });
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    void load();
  }, []);

  const handleSignIn = () => {
    chrome.tabs.create({ url: `${DEFAULT_BACKEND_URL}/auth?ext_id=${chrome.runtime.id}` });
  };

  const handleUpgrade = async () => {
    const stored = await chrome.storage.local.get({ authToken: "" });
    if (!stored.authToken) { handleSignIn(); return; }
    const res = await fetch(`${DEFAULT_BACKEND_URL}/stripe/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stored.authToken}` },
    });
    const json = await res.json();
    if (json?.result?.url) chrome.tabs.create({ url: json.result.url });
  };

  if (loading) return (
    <div className="rounded-xl border border-line bg-surface-soft p-4 animate-pulse">
      <div className="h-3 w-24 bg-line rounded mb-3" />
      <div className="h-2 w-full bg-line rounded" />
    </div>
  );

  if (!data) return null;

  const { plan, usageToday, dailyLimit, email, isSignedIn } = data;
  const pct = Math.min(100, Math.round((usageToday / dailyLimit) * 100));
  const remaining = Math.max(0, dailyLimit - usageToday);
  const isPro = plan === "pro";
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      {/* Plan badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink-1">
            {isPro ? "⭐ Pro" : isSignedIn ? "Free" : "Anonymous"}
          </span>
          {email && (
            <span className="text-[11px] text-ink-3 truncate max-w-[140px]">{email}</span>
          )}
        </div>
        {!isPro && (
          <button
            onClick={handleUpgrade}
            className="text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            Upgrade →
          </button>
        )}
      </div>

      {/* Usage bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[12px] text-ink-2">Today's requests</span>
          <span className="text-[12px] font-medium text-ink-1">
            {isPro ? "∞ unlimited" : `${usageToday} / ${dailyLimit}`}
          </span>
        </div>
        {!isPro && (
          <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {!isPro && (
          <span className="text-[11px] text-ink-3">
            {remaining === 0 ? "Limit reached · resets at midnight UTC" : `${remaining} requests remaining today`}
          </span>
        )}
      </div>

      {/* Sign in CTA for anonymous */}
      {!isSignedIn && (
        <button
          onClick={handleSignIn}
          className="w-full py-2 rounded-lg border border-line text-[13px] text-ink-1 hover:border-accent hover:text-accent transition-colors"
        >
          Sign in to sync across devices
        </button>
      )}
    </div>
  );
}
