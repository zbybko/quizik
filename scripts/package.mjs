#!/usr/bin/env node
/**
 * Build a CWS-ready zip from extension/.
 *
 * Usage:
 *   node scripts/package.mjs           # production build
 *   node scripts/package.mjs --dev     # development build (dev backend URL)
 *
 * Output: dist/quizik-v{version}.zip  (prod)
 *         dist/quizik-v{version}-dev.zip (dev)
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const extDir = resolve(root, "extension");
const distDir = resolve(root, "dist");

const isDev = process.argv.includes("--dev");

const PROD_BACKEND = "https://quizik-backend.zakhar-bybko.workers.dev";
const DEV_BACKEND  = "https://quizik-backend-dev.zakhar-bybko.workers.dev";
const backendUrl   = isDev ? DEV_BACKEND : PROD_BACKEND;

const manifest = JSON.parse(readFileSync(resolve(extDir, "manifest.json"), "utf8"));
const suffix   = isDev ? "-dev" : "";
const zipName  = `quizik-v${manifest.version}${suffix}.zip`;
const zipPath  = resolve(distDir, zipName);

console.log(`📦 Packaging Quizik v${manifest.version} [${isDev ? "DEV" : "PROD"}]…`);
console.log(`   Backend: ${backendUrl}`);

if (!existsSync(resolve(extDir, "build/app.js"))) {
  console.error("❌ extension/build/app.js missing. Run `npm run build` or `npm run build:dev` first.");
  process.exit(1);
}

// Patch background.js with the correct backend URL, zip, then restore
const bgPath     = resolve(extDir, "background.js");
const bgOriginal = readFileSync(bgPath, "utf8");
const bgPatched  = bgOriginal.replace(
  /const DEFAULT_BACKEND_URL = "https?:\/\/[^"]+";/,
  `const DEFAULT_BACKEND_URL = "${backendUrl}";`
);

if (bgPatched === bgOriginal && !bgOriginal.includes(backendUrl)) {
  console.warn("⚠️  Could not find DEFAULT_BACKEND_URL in background.js — zipping as-is.");
}

try {
  writeFileSync(bgPath, bgPatched);
  mkdirSync(distDir, { recursive: true });
  if (existsSync(zipPath)) rmSync(zipPath);

  execSync(
    `cd "${extDir}" && zip -r "${zipPath}" . -x "*.map" -x ".DS_Store" -x "**/.DS_Store"`,
    { stdio: "inherit" }
  );
} finally {
  // Always restore original background.js
  writeFileSync(bgPath, bgOriginal);
}

const sizeKb = Math.round(execSync(`du -k "${zipPath}"`).toString().split("\t")[0]);
console.log(`\n✅ ${zipName}  (${sizeKb} KB)`);
console.log(`   ${zipPath}`);
if (!isDev) {
  console.log(`\nNext: upload to https://chrome.google.com/webstore/devconsole`);
}
