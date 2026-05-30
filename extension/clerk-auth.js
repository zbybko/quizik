/**
 * Content script injected on Clerk's sign-in pages.
 * Waits for the user to sign in, then sends the token to the extension background.
 */

(async function () {
  // Wait for Clerk to be available and user to sign in
  let attempts = 0;
  const maxAttempts = 120; // wait up to 2 minutes

  const check = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(check);
      return;
    }

    try {
      // Clerk stores session in window.__clerk_db_jwt or via window.Clerk
      const clerk = window.Clerk;
      if (!clerk || !clerk.user) return;

      clearInterval(check);

      const token = await clerk.session?.getToken();
      if (!token) return;

      const email = clerk.user?.primaryEmailAddress?.emailAddress || "";

      // Send token to background script
      chrome.runtime.sendMessage({
        type: "QUIZIK_AUTH_TOKEN_FROM_CLERK",
        token,
        email,
      });

      // Show success message briefly
      const banner = document.createElement("div");
      banner.style.cssText = `
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        background: #166534; color: #fff; padding: 12px 24px;
        border-radius: 8px; font-size: 14px; z-index: 99999;
        font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      banner.textContent = "✅ Signed in to Quizik! You can close this tab.";
      document.body.appendChild(banner);
      setTimeout(() => window.close(), 2000);
    } catch (e) {
      // Clerk not ready yet, keep waiting
    }
  }, 1000);
})();
