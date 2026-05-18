/** Resolve which tab the popup is operating on. Standalone window can pin one via ?targetTabId=. */
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
