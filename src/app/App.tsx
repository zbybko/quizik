import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { ChatPage } from "@pages/chat";
import { SettingsPage } from "@pages/settings";
import { SignInPage } from "@pages/sign-in";
import { analytics } from "@shared/lib/analytics";

type View = "chat" | "settings";

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
  }, [isLoaded, isSignedIn, user]);

  // Show nothing while Clerk loads
  if (!isLoaded) return null;

  // Settings page — always accessible
  if (settingsAsPage) {
    return <SettingsPage />;
  }

  // Not signed in — show sign-in screen
  if (!isSignedIn) {
    return <SignInPage />;
  }

  return <ChatWithSettingsDrawer />;
}

function ChatWithSettingsDrawer() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <ChatPage onOpenSettings={() => { setShowSettings(true); void analytics.settingsOpened(); }} />
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface animate-in"
          role="dialog"
          aria-modal="true"
        >
          <SettingsPage embedded onClose={() => setShowSettings(false)} />
        </div>
      )}
    </>
  );
}
