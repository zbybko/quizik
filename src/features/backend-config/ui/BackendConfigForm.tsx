import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_BACKEND_URL } from "@shared/config";
import { storageGet, storageSet } from "@shared/lib/storage";

function normalizeBackendUrl(value: string): string {
  return String(value || DEFAULT_BACKEND_URL).trim().replace(/\/+$/, "");
}

export function BackendConfigForm() {
  const { t } = useTranslation();
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [appSharedSecret, setAppSharedSecret] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await storageGet({ backendUrl: DEFAULT_BACKEND_URL, appSharedSecret: "" });
      setBackendUrl(res.backendUrl);
      setAppSharedSecret(res.appSharedSecret);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await storageSet({
      backendUrl: normalizeBackendUrl(backendUrl),
      appSharedSecret
    });
    setStatus(t("options.saved"));
    setTimeout(() => setStatus(""), 2000);
  }

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-[18px]">
        <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          {t("options.backendUrl")}
          <input
            type="url"
            autoComplete="off"
            placeholder="http://localhost:8787"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value.trim())}
            className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
          />
        </label>

        <label className="grid gap-1.5 text-[13px] font-medium text-ink-2">
          {t("options.sharedSecret")}
          <input
            type="password"
            autoComplete="off"
            placeholder="change-me"
            value={appSharedSecret}
            onChange={(e) => setAppSharedSecret(e.target.value.trim())}
            className="w-full px-3 py-2.5 border border-line rounded-lg bg-surface text-ink-1 text-sm focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft transition-shadow"
          />
        </label>

        <button
          type="submit"
          className="justify-self-start px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >{t("options.save")}</button>
      </form>

      {status && (
        <p className="mt-4 px-3.5 py-2.5 rounded-lg bg-accent-soft text-accent text-[13px] font-medium">{status}</p>
      )}
    </>
  );
}
