"use strict";

function makeChromeUserAgent(chromeVersion, platform = process.platform) {
  if (!chromeVersion) throw new TypeError("chromeVersion is required");
  const platforms = {
    darwin: "Macintosh; Intel Mac OS X 10_15_7",
    win32: "Windows NT 10.0; Win64; x64",
    linux: "X11; Linux x86_64",
  };
  const platformToken = platforms[platform] || platforms.darwin;
  return `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getWindowPosition(trayBounds, windowBounds, workArea, gap = 0) {
  const centeredX = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2,
  );
  const maxX = workArea.x + workArea.width - windowBounds.width;
  const x = clamp(centeredX, workArea.x, Math.max(workArea.x, maxX));
  const belowTray = trayBounds.y + trayBounds.height + gap;
  const maxY = workArea.y + workArea.height - windowBounds.height;
  const aboveTray = trayBounds.y - windowBounds.height - gap;
  const y = belowTray <= maxY ? belowTray : clamp(aboveTray, workArea.y, maxY);
  return { x, y };
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isWebUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && (url.protocol === "https:" || url.protocol === "http:"));
}

function normalizeUrl(value) {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  const url = parseUrl(candidate);
  if (!url || !isWebUrl(url.href) || !url.hostname) return null;
  return url.href;
}

function getDisplayName(value) {
  const url = parseUrl(value);
  if (!url) return "Website";
  return url.hostname.replace(/^www\./i, "");
}

function sameHostFamily(leftValue, rightValue) {
  const left = parseUrl(leftValue);
  const right = parseUrl(rightValue);
  if (!left || !right) return false;
  return (
    left.hostname === right.hostname ||
    left.hostname.endsWith(`.${right.hostname}`) ||
    right.hostname.endsWith(`.${left.hostname}`)
  );
}

function isAuthenticationUrl(value) {
  const url = parseUrl(value);
  if (!url) return false;
  return /(?:accounts\.|login\.|auth\.|oauth|openid|signin|sign-in|login|sso|saml|authorize|callback)/i.test(
    `${url.hostname}${url.pathname}`,
  );
}

function shouldOpenInApp(targetValue, currentValue = "", homeValue = "") {
  if (!isWebUrl(targetValue)) return false;
  if (sameHostFamily(targetValue, homeValue)) return true;
  if (sameHostFamily(targetValue, currentValue)) return true;
  if (isAuthenticationUrl(targetValue)) return true;
  return isAuthenticationUrl(currentValue);
}

function hasUnreadTitle(title) {
  return /^\s*(?:\(\d+\)|[•●])/.test(title || "");
}

module.exports = {
  getDisplayName,
  getWindowPosition,
  hasUnreadTitle,
  isWebUrl,
  makeChromeUserAgent,
  normalizeUrl,
  shouldOpenInApp,
};
