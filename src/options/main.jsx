import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { initI18n } from "../i18n/index.js";
import "./options.css";

(async () => {
  await initI18n();
  createRoot(document.getElementById("app")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
})();
