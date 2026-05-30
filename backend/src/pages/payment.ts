const SHARED_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1a0a2e;
    color: #f4f4f5;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #1f1f23;
    border: 1px solid #27272a;
    border-radius: 20px;
    padding: 48px 40px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    animation: fadeUp 0.4s ease-out;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .icon {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    margin: 0 auto 24px;
    animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
  }
  @keyframes pop {
    from { transform: scale(0); }
    to   { transform: scale(1); }
  }
  .icon.success { background: rgba(234, 88, 12, 0.15); }
  .icon.cancel  { background: rgba(113, 63, 18, 0.2); }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; letter-spacing: -0.02em; }
  p  { font-size: 15px; color: #a1a1aa; line-height: 1.6; margin-bottom: 32px; }
  .features {
    list-style: none;
    text-align: left;
    margin-bottom: 32px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .features li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #d4d4d8;
  }
  .features li::before {
    content: '✓';
    color: #ea580c;
    font-weight: 700;
    font-size: 16px;
    flex-shrink: 0;
  }
  .btn {
    display: inline-block;
    padding: 12px 28px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: #ea580c; color: #fff; }
  .btn-secondary {
    background: transparent;
    color: #a1a1aa;
    border: 1px solid #3f3f46;
    font-size: 13px;
    padding: 10px 20px;
  }
  .countdown {
    font-size: 12px;
    color: #52525b;
    margin-top: 20px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(124, 58, 237, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(124, 58, 237, 0.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 20px;
  }
`;

export function paymentSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Pro — Quizik</title>
  <style>
    ${SHARED_STYLES}
    .confetti-container {
      position: fixed; inset: 0; pointer-events: none; overflow: hidden;
    }
    .confetti {
      position: absolute;
      width: 8px; height: 8px;
      border-radius: 2px;
      animation: fall linear forwards;
    }
    @keyframes fall {
      from { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      to   { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="confetti-container" id="confetti"></div>
  <div class="card">
    <div class="badge">⭐ Pro Plan Activated</div>
    <div class="icon success">🎉</div>
    <h1>You're now on Pro!</h1>
    <p>Thank you for upgrading. Enjoy unlimited AI study requests every day.</p>
    <ul class="features">
      <li>Unlimited daily requests</li>
      <li>Priority AI responses</li>
      <li>All quiz sites supported</li>
      <li>7 languages supported</li>
    </ul>
    <p class="countdown">You can close this tab and return to Quizik.</p>
  </div>
  <script>
    // Confetti
    const colors = ['#ea580c', '#7c3aed', '#f97316', '#a78bfa', '#fdba74'];
    const container = document.getElementById('confetti');
    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.cssText = [
        'left:' + Math.random() * 100 + '%',
        'background:' + colors[Math.floor(Math.random() * colors.length)],
        'animation-duration:' + (1.5 + Math.random() * 2.5) + 's',
        'animation-delay:' + Math.random() * 1.5 + 's',
        'width:' + (6 + Math.random() * 8) + 'px',
        'height:' + (6 + Math.random() * 8) + 'px',
      ].join(';');
      container.appendChild(el);
    }
  </script>
</body>
</html>`;
}

export function paymentCancelPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Upgrade cancelled — Quizik</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon cancel">↩</div>
    <h1>No problem!</h1>
    <p>Your upgrade was cancelled. You can still use Quizik with 20 free requests per day.</p>
    <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
      <p style="font-size:14px;color:#a1a1aa;">You can close this tab and return to Quizik.</p>
    </div>
  </div>
</body>
</html>`;
}
