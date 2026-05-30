import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { ChatPage } from "@pages/chat";
import { SettingsPage } from "@pages/settings";
import { SignInPage } from "@pages/sign-in";
import { DEFAULT_BACKEND_URL, IS_DEV_MODE } from "@shared/config";
import { analytics } from "@shared/lib/analytics";

type View = "chat" | "settings";
const PROD_BACKEND_URL = "https://quizik-backend.zakhar-bybko.workers.dev";

function initialView(): View {
  if (document.body.dataset.view === "settings") return "settings";
  const queryView = new URLSearchParams(window.location.search).get("view");
  if (queryView === "settings") return "settings";
  return window.location.pathname.includes("options") ? "settings" : "chat";
}

export default function App() {
  const [view] = useState<View>(() => initialView());
  const settingsAsPage = view === "settings";
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    document.body.classList.toggle("view-settings", settingsAsPage);
    if (!settingsAsPage) void analytics.extensionOpened();
  }, [settingsAsPage]);

  useEffect(() => {
    if (!IS_DEV_MODE) return;

    void chrome.storage.local.get({ backendUrl: "" }).then((stored) => {
      const backendUrl = String(stored.backendUrl || "").replace(/\/+$/, "");
      if (!backendUrl || backendUrl === PROD_BACKEND_URL) {
        return chrome.storage.local.set({ backendUrl: DEFAULT_BACKEND_URL });
      }
    });
  }, []);

  // Sync Clerk token → chrome.storage so background.js can use it
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      void getToken().then((token) => {
        if (token) {
          chrome.storage.local.set({
            authToken: token,
            authEmail: user?.primaryEmailAddress?.emailAddress || "",
            authPlan: "free",
          });
        }
      });
    } else {
      chrome.storage.local.remove(["authToken", "authEmail", "authPlan"]);
    }
  }, [getToken, isLoaded, isSignedIn, user]);

  useEffect(() => {
    if (!IS_DEV_MODE || !isLoaded) return;

    void (async () => {
      const token = isSignedIn ? await getToken().catch(() => null) : null;
      const stored = await chrome.storage.local.get({ authToken: "", authEmail: "", authPlan: "anon" });
      console.log("[QSA auth]", {
        isLoaded,
        isSignedIn,
        clerkUserId: user?.id || null,
        email: user?.primaryEmailAddress?.emailAddress || null,
        hasClerkToken: Boolean(token),
        hasStoredToken: Boolean(stored.authToken),
        storedEmail: stored.authEmail || null,
        storedPlan: stored.authPlan || null,
      });
    })();
  }, [getToken, isLoaded, isSignedIn, user]);

  // Settings page — always accessible
  if (settingsAsPage) {
    return <SettingsPage />;
  }

  // Chat is always accessible — sign-in shown only when user explicitly requests it
  return <ChatWithSettingsDrawer />;
}

function ChatWithSettingsDrawer() {
  const [showSettings, setShowSettings] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const { isSignedIn } = useAuth();

  // Auto-close sign-in drawer when user successfully signs in
  useEffect(() => {
    if (isSignedIn && showSignIn) setShowSignIn(false);
  }, [isSignedIn, showSignIn]);

  return (
    <>
      <ChatPage
        onOpenSettings={() => { setShowSettings(true); void analytics.settingsOpened(); }}
        onOpenSignIn={() => setShowSignIn(true)}
      />
      {showSettings && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-in" role="dialog" aria-modal="true">
          <SettingsPage embedded onClose={() => setShowSettings(false)} />
        </div>
      )}
      {showSignIn && !isSignedIn && (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface animate-in" role="dialog" aria-modal="true">
          <div className="shrink-0 flex items-center justify-between px-3.5 py-3 border-b border-line">
            <span className="text-[13px] font-semibold">Sign in</span>
            <button onClick={() => setShowSignIn(false)} className="w-7 h-7 text-ink-2 hover:text-ink-1 text-lg">×</button>
          </div>
          <SignInPage />
        </div>
      )}
    </>
  );
}
