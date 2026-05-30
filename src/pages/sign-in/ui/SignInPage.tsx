import { useState } from "react";
import { SignIn, SignUp } from "@clerk/chrome-extension";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

export function SignInPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

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
          routing="hash"
          signUpUrl="#sign-up"
          fallbackRedirectUrl={chrome.runtime.getURL("popup.html")}
        />
      ) : (
        <SignUp
          routing="hash"
          signInUrl="#sign-in"
          fallbackRedirectUrl={chrome.runtime.getURL("popup.html")}
        />
      )}

      <p className="text-[12px] text-ink-3">
        {mode === "sign-in" ? (
          <>Don't have an account?{" "}
            <button onClick={() => setMode("sign-up")} className="text-accent underline underline-offset-2">
              Sign up
            </button>
          </>
        ) : (
          <>Already have an account?{" "}
            <button onClick={() => setMode("sign-in")} className="text-accent underline underline-offset-2">
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
