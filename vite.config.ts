import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@app": r("./src/app"),
      "@pages": r("./src/pages"),
      "@features": r("./src/features"),
      "@entities": r("./src/entities"),
      "@shared": r("./src/shared")
    }
  },
  build: {
    outDir: "extension/build",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: "src/app/main.tsx"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        // Bundle into one file — no shared chunks. Popup and options load
        // the same app.js (smaller HTTP graph, simpler manifest).
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    }
  }
});
