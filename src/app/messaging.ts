import type { ForwardedEvent, RuntimeResponse } from "./types";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function printForwardedEvents(messageType: string | undefined, response: { events?: ForwardedEvent[] } | undefined): void {
  if (!response || !Array.isArray(response.events) || response.events.length === 0) return;
  const label = `[QSA forwarded] ${messageType} (${response.events.length})`;
  console.groupCollapsed(label);
  for (const event of response.events) {
    const logger = event.level === "warn" ? console.warn : console.log;
    logger(event.source || "[QSA]", event.message, event.details ?? "");
  }
  console.groupEnd();
}

interface NoReceiverError extends Error {
  isNoReceiver?: boolean;
  diagnostics?: unknown;
}

export function sendTabMessageOnce<T = unknown>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: RuntimeResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) {
        const err: NoReceiverError = new Error(error.message || "no-receiver");
        err.isNoReceiver = /Receiving end does not exist|message port closed|Could not establish connection/i.test(error.message || "");
        reject(err);
        return;
      }
      printForwardedEvents((message as { type?: string })?.type, response);
      if (!response?.ok) {
        const err: NoReceiverError = new Error(response?.error || "Failed");
        err.diagnostics = (response as { diagnostics?: unknown })?.diagnostics ?? null;
        reject(err);
        return;
      }
      resolve(response.result);
    });
  });
}

export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: unknown,
  { retries = 6, retryDelayMs = 500 }: { retries?: number; retryDelayMs?: number } = {},
  onGiveUp?: () => Error
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sendTabMessageOnce<T>(tabId, message);
    } catch (error) {
      const err = error as NoReceiverError;
      if (!err?.isNoReceiver) throw err;
      if (attempt < retries) {
        console.log(`[QSA] tab not ready, retry ${attempt + 1}/${retries} in ${retryDelayMs}ms`);
        await delay(retryDelayMs);
      }
    }
  }
  throw onGiveUp ? onGiveUp() : new Error("Tab is not responding.");
}

export function sendRuntimeMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(error.message)); return; }
      printForwardedEvents((message as { type?: string })?.type, response);
      if (!response?.ok) { reject(new Error(response?.error || "Request failed.")); return; }
      resolve(response.result);
    });
  });
}

export async function getTargetTab(standaloneTargetTabId: number | null): Promise<chrome.tabs.Tab | null> {
  if (standaloneTargetTabId !== null && Number.isInteger(standaloneTargetTabId) && standaloneTargetTabId > 0) {
    return chrome.tabs.get(standaloneTargetTabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

export function captureTabScreenshot(
  tab: chrome.tabs.Tab | null,
  errorWindow: string,
  errorFailed: (msg: string) => string
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tab?.windowId) { reject(new Error(errorWindow)); return; }
    chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 }, (dataUrl: string) => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(errorFailed(error.message || ""))); return; }
      resolve(dataUrl || "");
    });
  });
}
