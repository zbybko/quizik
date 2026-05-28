/**
 * Lightweight PostHog analytics wrapper.
 * Uses the PostHog capture REST API directly — no SDK, no extra bundle weight.
 * The project API key is intentionally public (write-only, standard for client analytics).
 */

const POSTHOG_HOST = "https://eu.i.posthog.com";
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

/** Stable anonymous ID stored in chrome.storage.local */
let _distinctId: string | null = null;

async function getDistinctId(): Promise<string> {
  if (_distinctId) return _distinctId;
  const stored = await chrome.storage.local.get({ analyticsId: "" });
  if (stored.analyticsId) {
    _distinctId = stored.analyticsId;
    return _distinctId!;
  }
  // Generate a random anonymous ID
  const id = "anon_" + crypto.randomUUID();
  await chrome.storage.local.set({ analyticsId: id });
  _distinctId = id;
  return _distinctId!;
}

export async function capture(
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  if (!POSTHOG_KEY) return; // analytics disabled if key not set
  try {
    const distinctId = await getDistinctId();
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          $lib: "quizik-extension",
          $lib_version: "0.1.0",
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Analytics must never break the app
  }
}

// ── Typed event helpers ────────────────────────────────────────────────────

export const analytics = {
  extensionOpened: () => capture("extension_opened"),

  messageSent: (props: { mode: string; hasScreenshot: boolean; isFirstMessage: boolean }) =>
    capture("message_sent", props),

  suggestionClicked: (text: string) =>
    capture("suggestion_clicked", { text }),

  settingsOpened: () => capture("settings_opened"),

  languageChanged: (to: string) =>
    capture("language_changed", { to }),

  modeToggled: (mode: "answer" | "auto", enabled: boolean) =>
    capture("mode_toggled", { mode, enabled }),

  errorShown: (message: string) =>
    capture("error_shown", { message }),
};
