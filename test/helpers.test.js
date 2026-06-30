"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getDisplayName,
  getWindowPosition,
  hasUnreadTitle,
  makeChromeUserAgent,
  normalizeUrl,
  shouldOpenInApp,
} = require("../src/helpers");

test("normalizes pasted URLs", () => {
  assert.equal(normalizeUrl("example.com/path"), "https://example.com/path");
  assert.equal(normalizeUrl(" https://example.com/a "), "https://example.com/a");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
});

test("uses the hostname as a default display name", () => {
  assert.equal(getDisplayName("https://www.notion.so/foo"), "notion.so");
});

test("Chrome UA hides Electron and reports the embedded engine", () => {
  const ua = makeChromeUserAgent("142.0.7444.175", "darwin");
  assert.match(ua, /Chrome\/142\.0\.7444\.175/);
  assert.doesNotMatch(ua, /Electron/);
});

test("window is centered below the tray and clamped to the work area", () => {
  const position = getWindowPosition(
    { x: 1390, y: 0, width: 22, height: 24 },
    { width: 430, height: 720 },
    { x: 0, y: 24, width: 1440, height: 876 },
  );
  assert.deepEqual(position, { x: 1010, y: 24 });
});

test("same-site and authentication navigations stay in the app", () => {
  assert.equal(
    shouldOpenInApp(
      "https://app.example.com/page",
      "https://example.com/",
      "https://example.com/",
    ),
    true,
  );
  assert.equal(
    shouldOpenInApp(
      "https://accounts.google.com/o/oauth2/auth",
      "https://example.com/",
      "https://example.com/",
    ),
    true,
  );
});

test("ordinary external links leave the app", () => {
  assert.equal(
    shouldOpenInApp(
      "https://elsewhere.test/docs",
      "https://example.com/app",
      "https://example.com/",
    ),
    false,
  );
});

test("unread titles are detected", () => {
  assert.equal(hasUnreadTitle("(3) general | Slack"), true);
  assert.equal(hasUnreadTitle("• inbox"), true);
  assert.equal(hasUnreadTitle("inbox"), false);
});
