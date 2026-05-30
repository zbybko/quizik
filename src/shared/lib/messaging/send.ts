import type { RuntimeResponse } from "@shared/api";
import { TAB_MESSAGE_RETRIES, TAB_MESSAGE_RETRY_DELAY_MS } from "@shared/config";
import { printForwardedEvents } from "./print-events";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export interface SendTabOptions {
  retries?: number;
  retryDelayMs?: number;
}

export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: unknown,
  options: SendTabOptions = {},
  onGiveUp?: () => Error
): Promise<T> {
  const retries = options.retries ?? TAB_MESSAGE_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? TAB_MESSAGE_RETRY_DELAY_MS;
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
      if (!response?.ok) {
        const err = Object.assign(new Error(response?.error || "Request failed."), response?.diagnostics ?? {});
        reject(err);
        return;
      }
      resolve(response.result);
    });
  });
}
