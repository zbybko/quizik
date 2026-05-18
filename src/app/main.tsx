import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initI18n } from "../i18n";
import "./app.css";

(async () => {
  await initI18n();
  const root = document.getElementById("app");
  if (!root) throw new Error("#app root not found");
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
})();
