/**
 * Promise-flavored wrappers around chrome.storage.local.
 * Strongly typed; pass a defaults object as the schema source.
 */

export function storageGet<T extends Record<string, unknown>>(defaults: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (res) => resolve(res as T));
  });
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}
