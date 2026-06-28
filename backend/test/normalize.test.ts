import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMode, normalizeModel, normalizeScreenshotDataUrl } from "../src/normalize.ts";

test("normalizeMode maps known modes and defaults to hint", () => {
  assert.equal(normalizeMode("answer"), "answer");
  assert.equal(normalizeMode("chat"), "chat");
  assert.equal(normalizeMode("hint"), "hint");
  assert.equal(normalizeMode("bogus"), "hint");
  assert.equal(normalizeMode(undefined), "hint");
  assert.equal(normalizeMode(42), "hint");
});

test("normalizeModel accepts valid gpt-* ids", () => {
  assert.equal(normalizeModel("gpt-5.5"), "gpt-5.5");
  assert.equal(normalizeModel("gpt-4o-mini"), "gpt-4o-mini");
  assert.equal(normalizeModel("gpt-4.1"), "gpt-4.1");
  assert.equal(normalizeModel("  gpt-5  "), "gpt-5"); // trims
});

test("normalizeModel rejects anything that is not a gpt id", () => {
  assert.equal(normalizeModel(""), "");
  assert.equal(normalizeModel("claude-3"), "");
  assert.equal(normalizeModel("o1-preview"), "");
  assert.equal(normalizeModel("gpt-"), "");
  assert.equal(normalizeModel("gpt-5; drop table"), ""); // no spaces/punctuation
  assert.equal(normalizeModel(undefined), "");
  assert.equal(normalizeModel(123), "");
});

test("normalizeScreenshotDataUrl only allows supported image data URLs", () => {
  const png = "data:image/png;base64,AAAA";
  assert.equal(normalizeScreenshotDataUrl(png), png);
  assert.equal(normalizeScreenshotDataUrl("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  assert.equal(normalizeScreenshotDataUrl("data:image/gif;base64,AAAA"), "");
  assert.equal(normalizeScreenshotDataUrl("https://example.com/a.png"), "");
  assert.equal(normalizeScreenshotDataUrl(null), "");
});
