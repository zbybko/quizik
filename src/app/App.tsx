import { useEffect, useState } from "react";
import { ChatPage } from "@pages/chat";
import { SettingsPage } from "@pages/settings";

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

  useEffect(() => {
    document.body.classList.toggle("view-settings", settingsAsPage);
  }, [settingsAsPage]);

  if (settingsAsPage) {
    return <SettingsPage />;
  }

  return <ChatWithSettingsDrawer />;
}

/** Chat with an inline Settings drawer overlay, toggled by the gear icon. */
function ChatWithSettingsDrawer() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <ChatPage onOpenSettings={() => setShowSettings(true)} />
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
