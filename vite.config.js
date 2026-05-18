import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "extension/build",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: "src/popup/main.jsx",
        options: "src/options/main.jsx"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  }
});
