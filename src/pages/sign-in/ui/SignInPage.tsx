import { SignIn } from "@clerk/chrome-extension";

const iconUrl = chrome.runtime.getURL("icons/icon-48.png");

export function SignInPage() {
  return (
    <div className="flex flex-col flex-1 h-full min-h-0 items-center justify-center bg-surface px-4 gap-6">
      <div className="flex flex-col items-center gap-2">
        <img src={iconUrl} alt="" className="w-10 h-10 rounded-xl bg-accent-soft p-1.5 object-contain" />
        <h1 className="text-[15px] font-semibold text-ink-1">Sign in to Quizik</h1>
        <p className="text-[12px] text-ink-2 text-center max-w-[240px]">
          Sign in to unlock more daily requests and sync across devices.
        </p>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
