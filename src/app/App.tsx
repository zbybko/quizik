import { useEffect, useState } from "react";
import Chat from "./Chat";
import Settings from "./Settings";

type View = "chat" | "settings";

function initialView(): View {
  // The options page sets `data-view="settings"` on <body> via inline boot script.
  if (document.body.dataset.view === "settings") return "settings";
  const queryView = new URLSearchParams(window.location.search).get("view");
  if (queryView === "settings") return "settings";
  // Fallback: filename
  return window.location.pathname.includes("options") ? "settings" : "chat";
}

export default function App() {
  const [view, setView] = useState<View>(() => initialView());
  // `settingsAsPage` distinguishes "settings via gear icon in chat" (drawer)
  // from "settings via right-click → Options" (full page).
  const settingsAsPage = view === "settings";

  // Persist view in body class so global CSS can tweak background.
  useEffect(() => {
    document.body.classList.toggle("view-settings", settingsAsPage);
  }, [settingsAsPage]);

  if (settingsAsPage) {
    return <Settings />;
  }

  return (
    <ChatWithSettingsDrawer
      onClose={() => {/* drawer toggles internally */}}
    />
  );
}

/**
 * Wraps Chat with an inline Settings drawer overlay, toggled by the gear icon.
 * Keeps everything in one app — no need to navigate to options page for quick edits.
 */
function ChatWithSettingsDrawer({ onClose: _ }: { onClose: () => void }) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <Chat onOpenSettings={() => setShowSettings(true)} />
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface animate-in"
          role="dialog"
          aria-modal="true"
        >
          <Settings embedded onClose={() => setShowSettings(false)} />
        </div>
      )}
    </>
  );
}
