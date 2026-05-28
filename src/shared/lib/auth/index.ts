/**
 * Auth state management for the Quizik extension.
 *
 * Flow:
 *  1. On every boot, load stored token + deviceId from chrome.storage.
 *  2. Device ID is a random UUID generated once and persisted forever.
 *  3. JWT token is set after user completes Clerk sign-in in a browser tab.
 *  4. background.js listens for QUIZIK_AUTH messages from the auth tab
 *     and stores the token via chrome.storage.
 */

export interface AuthState {
  token: string | null;       // Clerk JWT
  deviceId: string;           // anonymous device UUID
  plan: "anon" | "free" | "pro";
  usageToday: number;
  dailyLimit: number;
}

const STORAGE_KEY = "authState";

export async function loadAuthState(): Promise<AuthState> {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
  if (stored[STORAGE_KEY]) return stored[STORAGE_KEY] as AuthState;

  // First run — generate device ID
  const deviceId = "dev_" + crypto.randomUUID();
  const state: AuthState = {
    token: null,
    deviceId,
    plan: "anon",
    usageToday: 0,
    dailyLimit: 20,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
}

export async function saveAuthState(state: AuthState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function clearToken(): Promise<void> {
  const state = await loadAuthState();
  state.token = null;
  state.plan = "anon";
  await saveAuthState(state);
}

/** Open Clerk auth page in a new tab. Extension ID is passed so auth page can message back. */
export function openAuthTab(backendUrl: string): void {
  const extId = chrome.runtime.id;
  chrome.tabs.create({
    url: `${backendUrl}/auth?ext_id=${extId}`,
  });
}
