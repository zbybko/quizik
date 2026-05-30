import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import App from "./App";
import { initI18n } from "@shared/lib/i18n";
import { CLERK_PUBLISHABLE_KEY } from "@shared/config";
import "./app.css";

const POPUP_URL = chrome.runtime.getURL("popup.html");

function routeFromClerk(to: string, replace = false) {
  const targetUrl = new URL(to, window.location.href);
  const isCurrentExtensionPage = targetUrl.origin === window.location.origin
    && targetUrl.pathname === window.location.pathname;

  if (to.startsWith("#") || (isCurrentExtensionPage && targetUrl.hash)) {
    const nextHash = to.startsWith("#") ? to : targetUrl.hash;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    const updateHistory = replace ? window.history.replaceState : window.history.pushState;

    updateHistory.call(window.history, null, "", nextUrl);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }

  if (replace) {
    window.location.replace(targetUrl.href);
  } else {
    window.location.assign(targetUrl.href);
  }
}

(async () => {
  await initI18n();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app root not found");
  createRoot(root).render(
    <StrictMode>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        afterSignOutUrl={POPUP_URL}
        signInFallbackRedirectUrl={POPUP_URL}
        signInForceRedirectUrl={POPUP_URL}
        signUpFallbackRedirectUrl={POPUP_URL}
        signUpForceRedirectUrl={POPUP_URL}
        allowedRedirectProtocols={["chrome-extension:"]}
        routerPush={(to) => routeFromClerk(to)}
        routerReplace={(to) => routeFromClerk(to, true)}
      >
        <App />
      </ClerkProvider>
    </StrictMode>
  );
})();
