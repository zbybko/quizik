import { useCallback, useEffect, useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/chrome-extension";
import { DEFAULT_BACKEND_URL } from "@shared/config";
import { storageGet } from "@shared/lib/storage";

interface UsageData {
  plan: "anon" | "free" | "pro";
  usageToday: number;
  dailyLimit: number;
}

export function UsageCard() {
  const { isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await storageGet({ authToken: "", deviceId: "" });
      const token = isSignedIn ? await getToken().catch(() => null) : null;
      const authToken = token || stored.authToken;

      if (token) {
        await chrome.storage.local.set({ authToken: token, authEmail: email, authPlan: "free" });
      }

      const headers: Record<string, string> = { "X-Device-ID": stored.deviceId || "unknown" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch(`${DEFAULT_BACKEND_URL}/user/status`, { headers });
      const json = await res.json().catch(() => ({}));
      const result = json?.result;
      setData({
        plan: result?.plan ?? "anon",
        usageToday: result?.usageToday ?? 0,
        dailyLimit: result?.dailyLimit ?? 20,
      });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [email, getToken, isSignedIn]);

  useEffect(() => { void load(); }, [load]);

  const handleSignOut = async () => {
    setSigningOut(true);
    setActionError("");
    try {
      await clerk.signOut({ redirectUrl: chrome.runtime.getURL("popup.html") });
      await chrome.storage.local.remove(["authToken", "authEmail", "authPlan"]);
      setData({ plan: "anon", usageToday: 0, dailyLimit: 5 });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    setActionError("");
    try {
      const token = await getToken();
      if (!token) {
        setActionError("Sign-in is still syncing. Close and reopen the panel, then try again.");
        return;
      }

      const res = await fetch(`${DEFAULT_BACKEND_URL}/stripe/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      const url = json?.result?.url;

      if (!res.ok || !url) {
        setActionError(json?.error || `Could not start checkout (${res.status}).`);
        return;
      }

      await chrome.tabs.create({ url });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not start checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setActionError("");
    try {
      const token = await getToken();
      if (!token) {
        setActionError("Sign-in is still syncing. Close and reopen the panel, then try again.");
        return;
      }
      const res = await fetch(`${DEFAULT_BACKEND_URL}/stripe/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      const url = json?.result?.url;

      if (!res.ok || !url) {
        setActionError(json?.error || `Could not open billing portal (${res.status}).`);
        return;
      }

      await chrome.tabs.create({ url });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not open billing portal.");
    }
    finally { setPortalLoading(false); }
  };

  if (loading) return (
    <div className="rounded-xl border border-line bg-surface-soft p-4 animate-pulse">
      <div className="h-3 w-24 bg-line rounded mb-3" />
      <div className="h-2 w-full bg-line rounded" />
    </div>
  );

  if (!data) return null;

  const { plan, usageToday, dailyLimit } = data;
  const pct = Math.min(100, Math.round((usageToday / dailyLimit) * 100));
  const remaining = Math.max(0, dailyLimit - usageToday);
  const isPro = plan === "pro";
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      {/* Plan + email + sign out */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${
            isPro ? "bg-secondary-soft text-secondary" : "bg-surface-soft text-ink-2"
          }`}>
            {isPro ? "⭐ Pro" : isSignedIn ? "Free" : "Anonymous"}
          </span>
          {email && <span className="text-[11px] text-ink-3 truncate">{email}</span>}
        </div>
        {isSignedIn && (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-[11px] text-ink-3 hover:text-ink-1 transition-colors shrink-0"
          >
            {signingOut ? "…" : "Sign out"}
          </button>
        )}
      </div>

      {/* Usage bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[12px] text-ink-2">Requests today</span>
          <span className="text-[12px] font-medium text-ink-1">
            {isPro ? "∞" : `${usageToday} / ${dailyLimit}`}
          </span>
        </div>
        {!isPro && (
          <>
            <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-ink-3">
              {remaining === 0 ? "Limit reached · resets at midnight UTC" : `${remaining} remaining today`}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-line">
        {isPro ? (
          <button
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="w-full py-2 rounded-lg border border-line text-[13px] text-ink-2 hover:border-accent hover:text-accent transition-colors"
          >
            {portalLoading ? "Opening…" : "Manage subscription →"}
          </button>
        ) : (
          <button
            onClick={handleUpgrade}
            disabled={checkoutLoading}
            className="w-full py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {checkoutLoading ? "Opening checkout..." : "Upgrade to Pro — $7/mo"}
          </button>
        )}
        {actionError && (
          <p className="m-0 text-[11px] leading-snug text-red-600 dark:text-red-400">
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}
