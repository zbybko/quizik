import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "extension/build",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: "src/popup/main.js",
        options: "src/options/main.js"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  }
});
