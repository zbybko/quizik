/**
 * Auth page — hosted on the Cloudflare Worker.
 * Opens Clerk sign-in, gets JWT, sends it back to the extension.
 */

export function authPage(clerkPublishableKey: string | undefined, extId: string): Response {
  if (!clerkPublishableKey) {
    return new Response("Auth not configured.", { status: 503 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — Quizik</title>
  <script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
      background: #1a0a2e;
      color: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #1f1f23;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 32px; margin-bottom: 8px; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 14px; color: #a1a1aa; margin-bottom: 28px; }
    #clerk-mount { min-height: 60px; }
    .success {
      display: none;
      color: #4ade80;
      font-size: 15px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
<div class="card">
  <div class="logo">⚡</div>
  <h1>Sign in to Quizik</h1>
  <p>Sign in to unlock more daily requests and sync across devices.</p>
  <div id="clerk-mount"></div>
  <p class="success" id="success-msg">✅ Signed in! You can close this tab.</p>
</div>

<script>
const EXT_ID = ${JSON.stringify(extId)};
const BACKEND = ${JSON.stringify("https://quizik-backend.zakhar-bybko.workers.dev")};

async function init() {
  const clerk = window.Clerk;
  await clerk.load({ publishableKey: ${JSON.stringify(clerkPublishableKey)} });

  if (clerk.user) {
    await onSignedIn(clerk);
    return;
  }

  clerk.mountSignIn(document.getElementById('clerk-mount'), {
    afterSignInUrl: window.location.href,
  });

  clerk.addListener(async ({ user }) => {
    if (user) await onSignedIn(clerk);
  });
}

async function onSignedIn(clerk) {
  try {
    const token = await clerk.session.getToken();

    // Sync user to our backend
    await fetch(BACKEND + '/auth/sync-user', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    });

    // Send token to extension
    if (EXT_ID && chrome?.runtime) {
      chrome.runtime.sendMessage(EXT_ID, {
        type: 'QUIZIK_AUTH_TOKEN',
        token,
        email: clerk.user.primaryEmailAddress?.emailAddress,
      });
    }

    document.getElementById('clerk-mount').style.display = 'none';
    document.getElementById('success-msg').style.display = 'block';

    // Auto-close after 2s
    setTimeout(() => window.close(), 2000);
  } catch (e) {
    console.error('Auth error', e);
  }
}

init().catch(console.error);
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
