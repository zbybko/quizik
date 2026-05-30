import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import App from "./App";
import { initI18n } from "@shared/lib/i18n";
import { CLERK_PUBLISHABLE_KEY } from "@shared/config";
import "./app.css";

const EXTENSION_URL = chrome.runtime.getURL(".");

(async () => {
  await initI18n();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app root not found");
  createRoot(root).render(
    <StrictMode>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        afterSignOutUrl={`${EXTENSION_URL}popup.html`}
        signInFallbackRedirectUrl={`${EXTENSION_URL}popup.html`}
        signUpFallbackRedirectUrl={`${EXTENSION_URL}popup.html`}
      >
        <App />
      </ClerkProvider>
    </StrictMode>
  );
})();
