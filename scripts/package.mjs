#!/usr/bin/env node
/**
 * Build a CWS-ready zip from extension/.
 * Usage: node scripts/package.mjs
 * Output: dist/quizik-v{version}.zip
 *
 * Reads version from extension/manifest.json. Excludes source maps and
 * any sneaky files (.DS_Store, *.map) that the store rejects.
 */
import { execSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const extDir = resolve(root, "extension");
const distDir = resolve(root, "dist");
const manifest = JSON.parse(readFileSync(resolve(extDir, "manifest.json"), "utf8"));
const zipName = `quizik-v${manifest.version}.zip`;
const zipPath = resolve(distDir, zipName);

console.log(`📦 Packaging Quizik v${manifest.version}…`);

if (!existsSync(resolve(extDir, "build/app.js"))) {
  console.error("❌ extension/build/app.js missing. Run `npm run build` first.");
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// Zip from inside extension/ so the archive root contains manifest.json,
// not extension/. Exclude source maps and OS junk.
execSync(
  `cd "${extDir}" && zip -r "${zipPath}" . -x "*.map" -x ".DS_Store" -x "**/.DS_Store"`,
  { stdio: "inherit" }
);

const sizeKb = Math.round(execSync(`du -k "${zipPath}"`).toString().split("\t")[0]);
console.log(`\n✅ ${zipName}  (${sizeKb} KB)`);
console.log(`   ${zipPath}`);
console.log(`\nNext: upload to https://chrome.google.com/webstore/devconsole`);
