import { useEffect, useState } from "react";
import { SignIn, SignUp } from "@clerk/chrome-extension";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");
const popupUrl = chrome.runtime.getURL("popup.html");
const signInHash = "#sign-in";
const signUpHash = "#sign-up";

function getClickedLink(event: globalThis.MouseEvent) {
  return event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
    ?? (event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null);
}

export function SignInPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  // Intercept Clerk's own "Sign up" / "Sign in" links and handle
  // navigation internally instead of letting the extension try to navigate.
  useEffect(() => {
    function handleClerkAuthLink(event: globalThis.MouseEvent) {
      const link = getClickedLink(event);
      if (!link) return;

      const href = `${link.getAttribute("href") ?? ""} ${link.href}`.toLowerCase();
      const text = link.textContent?.trim().toLowerCase();
      const isClerkSignUpLink = mode === "sign-in" && (href.includes("sign-up") || text === "sign up");
      const isClerkSignInLink = mode === "sign-up" && (href.includes("sign-in") || text === "sign in");

      if (!isClerkSignUpLink && !isClerkSignInLink) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setMode(isClerkSignUpLink ? "sign-up" : "sign-in");
    }

    document.addEventListener("click", handleClerkAuthLink, true);
    return () => document.removeEventListener("click", handleClerkAuthLink, true);
  }, [mode]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto qsa-scroll items-center justify-start bg-surface px-4 py-6 gap-4">
      <div className="flex flex-col items-center gap-2">
        <img src={iconUrl} alt="" className="w-10 h-10 rounded-xl bg-accent-soft p-1.5 object-contain" />
        <h1 className="text-[15px] font-semibold text-ink-1">
          {mode === "sign-in" ? "Sign in to Quizik" : "Create your account"}
        </h1>
        <p className="text-[12px] text-ink-2 text-center max-w-[240px]">
          Unlock more daily requests and sync across devices.
        </p>
      </div>

      {mode === "sign-in" ? (
        <SignIn
          key="sign-in"
          routing="hash"
          signUpUrl={signUpHash}
          fallbackRedirectUrl={popupUrl}
          forceRedirectUrl={popupUrl}
        />
      ) : (
        <SignUp
          key="sign-up"
          routing="hash"
          signInUrl={signInHash}
          fallbackRedirectUrl={popupUrl}
          forceRedirectUrl={popupUrl}
        />
      )}
    </div>
  );
}
