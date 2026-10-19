"use strict";

const { randomUUID } = require("node:crypto");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  screen,
  session,
  shell,
  Tray,
  WebContentsView,
} = require("electron");

const {
  getDisplayName,
  getWindowPosition,
  hasUnreadTitle,
  isWebUrl,
  makeChromeUserAgent,
  normalizeUrl,
  shouldOpenInApp,
} = require("./helpers");
const { SiteStore } = require("./store");
const {
  buildTrayIcons,
  normalizeFavicon,
  pickLargestImage,
  withBadge,
} = require("./tray-icons");
const {
  NOTIFICATION_HOOK_SCRIPT,
  NOTIFICATION_SIGNAL,
} = require("./notification-hook");

const DEFAULT_BOUNDS = {
  width: 430,
  height: 720,
  minWidth: 340,
  minHeight: 420,
};
// bubble.css の .surface（inset 17px 11px 11px / 角丸 14 - 1）と一致させる。
const PANEL_INSETS = {
  top: 17,
  right: 11,
  bottom: 11,
  left: 11,
  radius: 13,
};
const TOOLBAR_HEIGHT = 42;
const ADDRESS_BAR_HEIGHT = 38;
const WINDOW_SIZE_PRESETS = [
  { id: "compact", label: "コンパクト", width: 360, height: 520 },
  { id: "standard", label: "標準", width: 430, height: 720 },
  { id: "wide", label: "ワイド", width: 720, height: 680 },
  { id: "large", label: "大", width: 960, height: 820 },
];
const USER_AGENT_PRESETS = [
  { id: "mac", label: "Mac（デスクトップ）" },
  { id: "iphone", label: "iPhone" },
  { id: "ipad", label: "iPad" },
  { id: "android", label: "Android" },
  { id: "custom", label: "カスタム" },
];
const SUPPORT_URL = "https://github.com/mwmwcreate/Pinbar/issues";
const PRIVACY_URL =
  "https://github.com/mwmwcreate/Pinbar/blob/main/docs/PRIVACY.md";
const MAX_USER_AGENT_LENGTH = 512;
const MAX_FAVICON_BYTES = 2 * 1024 * 1024;
const MAX_FAVICON_CANDIDATES = 4;
const KEEP_WINDOWS_OPEN = process.env.PINBAR_KEEP_OPEN === "1";

let managerTray = null;
let managerWindow = null;
let store = null;
let quitting = false;
let lastActiveSiteId = null;
const siteEntries = new Map();

if (
  process.env.PINBAR_ALLOW_MULTIPLE_INSTANCES !== "1" &&
  !app.requestSingleInstanceLock()
) {
  // 黙って終了すると「起動しない」ように見えるので、理由をターミナルに出す。
  console.error(
    "Pinbar はすでに起動しています。先に起動中の Pinbar（メニューバーの + アイコンを右クリック →「Pinbarを終了」）を終了してください。",
  );
  app.quit();
}

function loadTemplateIcon(fileName) {
  const image = nativeImage.createFromPath(
    path.join(__dirname, "assets", fileName),
  );
  if (image.isEmpty()) {
    throw new Error(`Tray icon could not be loaded: ${fileName}`);
  }
  image.setTemplateImage(true);
  return image;
}

function createManagerIcon() {
  return loadTemplateIcon("addTemplate.png");
}

function createFallbackSiteIcon() {
  return loadTemplateIcon("siteTemplate.png");
}

let fallbackSiteIcons = null;
function getFallbackSiteIcons() {
  if (!fallbackSiteIcons) {
    const mono = createFallbackSiteIcon();
    fallbackSiteIcons = { color: mono, mono, badged: withBadge(mono) };
  }
  return fallbackSiteIcons;
}

// ポップオーバーを表示しているサイトだけカラー、それ以外はモノクロで出す。
// 閉じている間に通知が来たか、タイトルが未読を示していれば右上に丸を付ける。
// favicon が無いサイトは既定のテンプレートアイコン（メニューバー色に追従）。
function applyTrayIcon(entry) {
  if (entry.tray.isDestroyed()) return;
  const icons = entry.icons || getFallbackSiteIcons();
  const visible = !entry.window.isDestroyed() && entry.window.isVisible();
  if (visible) {
    entry.tray.setImage(icons.color);
    return;
  }
  const unread = entry.notified || entry.titleUnread;
  entry.tray.setImage(unread ? icons.badged : icons.mono);
}

// 閉じている間に届いた通知だけを数える。開いて見ている間の通知は丸にしない。
function markSiteNotified(entry) {
  if (entry.window.isDestroyed() || entry.window.isVisible()) return;
  entry.notified = true;
  applyTrayIcon(entry);
}

function positionWindow(tray, window) {
  const trayBounds = tray.getBounds();
  const windowBounds = window.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const position = getWindowPosition(
    trayBounds,
    windowBounds,
    display.workArea,
  );
  window.setPosition(position.x, position.y, false);
  const notchX = Math.round(
    trayBounds.x + trayBounds.width / 2 - position.x,
  );
  window.webContents.send("chrome:set-notch", notchX);
}

function hideAllWindows(exceptWindow = null) {
  if (managerWindow && managerWindow !== exceptWindow) managerWindow.hide();
  for (const entry of siteEntries.values()) {
    if (
      entry.window !== exceptWindow &&
      !entry.detached &&
      !entry.site.pinned
    ) {
      entry.window.hide();
    }
  }
}

function showManager() {
  if (!managerWindow || !managerTray) return;
  hideAllWindows(managerWindow);
  positionWindow(managerTray, managerWindow);
  managerWindow.show();
  managerWindow.focus();
}

function toggleManager() {
  if (managerWindow?.isVisible()) managerWindow.hide();
  else showManager();
}

function showSite(id) {
  const entry = siteEntries.get(id);
  if (!entry) return;
  lastActiveSiteId = id;
  hideAllWindows(entry.window);
  if (!entry.detached) positionWindow(entry.tray, entry.window);
  entry.window.show();
  entry.window.focus();
  entry.contents.focus();
}

function getUserAgent(site) {
  const preset = site.userAgentPreset || "mac";
  if (preset === "custom" && String(site.customUserAgent || "").trim()) {
    return String(site.customUserAgent)
      .trim()
      .slice(0, MAX_USER_AGENT_LENGTH);
  }
  if (preset === "iphone") {
    return "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  }
  if (preset === "ipad") {
    return "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  }
  if (preset === "android") {
    return `Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Mobile Safari/537.36`;
  }
  return makeChromeUserAgent(process.versions.chrome, process.platform);
}

function isCustomProtocol(value) {
  try {
    const protocol = new URL(value).protocol;
    return !["http:", "https:", "about:", "data:", "blob:"].includes(
      protocol,
    );
  } catch {
    return true;
  }
}

function toggleSite(id) {
  const entry = siteEntries.get(id);
  if (!entry) return;
  entry.window.isVisible() ? entry.window.hide() : showSite(id);
}

function sendSiteState(entry) {
  if (entry.window.isDestroyed() || entry.window.webContents.isDestroyed()) return;
  const navigation = entry.contents.navigationHistory;
  entry.window.webContents.send("chrome:state", {
    name: entry.site.name,
    url: entry.contents.getURL() || entry.site.url,
    canGoBack: navigation.canGoBack(),
    canGoForward: navigation.canGoForward(),
    pinned: Boolean(entry.site.pinned),
    detached: Boolean(entry.detached),
    showAddressBar: Boolean(entry.site.showAddressBar),
    loading: entry.contents.isLoading(),
  });
}

function setSitePinned(entry, pinned) {
  entry.site = store.update(entry.site.id, { pinned: Boolean(pinned) });
  sendSiteState(entry);
  broadcastSites();
}

function setAddressBarVisible(entry, visible, focus = false) {
  entry.site = store.update(entry.site.id, {
    showAddressBar: Boolean(visible),
  });
  layoutSiteView(entry);
  sendSiteState(entry);
  broadcastSites();
  if (focus) {
    entry.window.webContents.send("chrome:focus-address");
  }
}

function setDetached(entry, detached) {
  entry.detached = Boolean(detached);
  entry.window.setAlwaysOnTop(!entry.detached, "pop-up-menu");
  entry.window.setVisibleOnAllWorkspaces(!entry.detached, {
    visibleOnFullScreen: !entry.detached,
  });
  layoutSiteView(entry);
  if (!entry.detached) positionWindow(entry.tray, entry.window);
  sendSiteState(entry);
}

function openSiteInBrowser(entry) {
  const url = entry.contents.getURL() || entry.site.url;
  if (isWebUrl(url)) void shell.openExternal(url);
}

function navigateSite(entry, value) {
  const url = normalizeUrl(value);
  if (!url) return false;
  void entry.contents.loadURL(url);
  return true;
}

function runSiteAction(entry, name, payload) {
  const navigation = entry.contents.navigationHistory;
  switch (name) {
    case "back":
      if (navigation.canGoBack()) navigation.goBack();
      break;
    case "forward":
      if (navigation.canGoForward()) navigation.goForward();
      break;
    case "reload":
      entry.contents.reload();
      break;
    case "force-reload":
      entry.contents.reloadIgnoringCache();
      break;
    case "pin-toggle":
      setSitePinned(entry, !entry.site.pinned);
      break;
    case "detach-toggle":
      setDetached(entry, !entry.detached);
      break;
    case "address-toggle":
      setAddressBarVisible(entry, !entry.site.showAddressBar);
      break;
    case "open-browser":
      openSiteInBrowser(entry);
      break;
    case "navigate":
      return navigateSite(entry, payload);
    case "close":
      entry.window.hide();
      break;
    default:
      return false;
  }
  sendSiteState(entry);
  return true;
}

function handleSiteShortcut(entry, event, input) {
  if (!input.meta) return;
  const key = String(input.key || "").toLowerCase();
  let handled = true;

  if (key === "r" && input.shift) runSiteAction(entry, "force-reload");
  else if (key === "r") runSiteAction(entry, "reload");
  else if (key === "w") runSiteAction(entry, "close");
  else if (key === "l") setAddressBarVisible(entry, true, true);
  else if (key === "b" && input.shift) runSiteAction(entry, "address-toggle");
  else if (key === "p" && input.shift) runSiteAction(entry, "pin-toggle");
  else if (key === "d" && input.shift) runSiteAction(entry, "detach-toggle");
  else if (key === "o" && input.shift) runSiteAction(entry, "open-browser");
  else if (key === "n") showManager();
  else if (key === "+" || key === "=") {
    entry.contents.setZoomFactor(
      Math.min(3, entry.contents.getZoomFactor() + 0.1),
    );
  } else if (key === "-") {
    entry.contents.setZoomFactor(
      Math.max(0.5, entry.contents.getZoomFactor() - 0.1),
    );
  } else if (key === "0") entry.contents.setZoomFactor(1);
  else handled = false;

  if (handled) event.preventDefault();
}

function getSiteWindowSize(entry) {
  const [width, height] = entry.window.getSize();
  return { width, height };
}

function findSizePreset(bounds) {
  return WINDOW_SIZE_PRESETS.find(
    (preset) =>
      preset.width === bounds.width && preset.height === bounds.height,
  );
}

function setSiteWindowSize(entry, presetId) {
  const preset = WINDOW_SIZE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;

  const trayBounds = entry.tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  });
  const width = Math.min(preset.width, display.workArea.width);
  const height = Math.min(preset.height, display.workArea.height);
  entry.window.setSize(width, height, true);
  layoutSiteView(entry);
  positionWindow(entry.tray, entry.window);
  entry.site = store.update(entry.site.id, { bounds: { width, height } });
  broadcastSites();
  showSite(entry.site.id);
  return { width, height };
}

function broadcastSites() {
  if (!managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.webContents.send("sites:changed", store.list());
}

function verifyManagerSender(event) {
  if (!managerWindow || event.sender !== managerWindow.webContents) {
    throw new Error("Unauthorized IPC sender");
  }
}

function findEntryByShellContents(contents) {
  return [...siteEntries.values()].find(
    (entry) => entry.window.webContents === contents,
  );
}

function setUpIpc() {
  ipcMain.handle("chrome:action", (event, request) => {
    const entry = findEntryByShellContents(event.sender);
    if (!entry || typeof request?.name !== "string") return false;
    return runSiteAction(entry, request.name, request.payload);
  });

  ipcMain.handle("sites:list", (event) => {
    verifyManagerSender(event);
    return store.list();
  });

  ipcMain.handle("app:info", (event) => {
    verifyManagerSender(event);
    return {
      name: app.getName(),
      version: app.getVersion(),
      supportUrl: SUPPORT_URL,
      privacyUrl: PRIVACY_URL,
    };
  });

  ipcMain.handle("app:open-link", (event, url) => {
    verifyManagerSender(event);
    if (![SUPPORT_URL, PRIVACY_URL].includes(url)) return false;
    void shell.openExternal(url);
    return true;
  });

  ipcMain.handle("sites:add", (event, input) => {
    verifyManagerSender(event);
    const url = normalizeUrl(input?.url);
    if (!url) return { ok: false, error: "有効なWebサイトのURLを入力してください。" };
    if (store.list().some((site) => site.url === url)) {
      return { ok: false, error: "このURLはすでに固定されています。" };
    }

    const sizePreset =
      WINDOW_SIZE_PRESETS.find((preset) => preset.id === input?.sizePreset) ||
      WINDOW_SIZE_PRESETS.find((preset) => preset.id === "standard");
    const userAgentPreset = USER_AGENT_PRESETS.some(
      (preset) => preset.id === input?.userAgentPreset,
    )
      ? input.userAgentPreset
      : "mac";
    const site = {
      id: randomUUID(),
      name: String(input?.name || "").trim() || getDisplayName(url),
      autoName: !String(input?.name || "").trim(),
      url,
      bounds: {
        width: sizePreset.width,
        height: sizePreset.height,
      },
      userAgentPreset,
      customUserAgent: String(input?.customUserAgent || "")
        .trim()
        .slice(0, MAX_USER_AGENT_LENGTH),
      showAddressBar: Boolean(input?.showAddressBar),
      pinned: Boolean(input?.pinned),
      createdAt: new Date().toISOString(),
    };
    store.add(site);
    createSiteEntry(site);
    broadcastSites();
    showSite(site.id);
    return { ok: true, site };
  });

  ipcMain.handle("sites:update", (event, input) => {
    verifyManagerSender(event);
    const entry = siteEntries.get(input?.id);
    if (!entry) return { ok: false, error: "サイトが見つかりません。" };

    const url = normalizeUrl(input?.url);
    if (!url) return { ok: false, error: "有効なWebサイトのURLを入力してください。" };
    if (
      store.list().some(
        (site) => site.id !== entry.site.id && site.url === url,
      )
    ) {
      return { ok: false, error: "このURLはすでに固定されています。" };
    }

    const userAgentPreset = USER_AGENT_PRESETS.some(
      (preset) => preset.id === input?.userAgentPreset,
    )
      ? input.userAgentPreset
      : "mac";
    const previous = entry.site;
    const changes = {
      name: String(input?.name || "").trim() || getDisplayName(url),
      autoName: !String(input?.name || "").trim(),
      url,
      userAgentPreset,
      customUserAgent: String(input?.customUserAgent || "")
        .trim()
        .slice(0, MAX_USER_AGENT_LENGTH),
      showAddressBar: Boolean(input?.showAddressBar),
      pinned: Boolean(input?.pinned),
    };
    if (url !== previous.url) changes.faviconDataUrl = null;
    entry.site = store.update(entry.site.id, changes);
    entry.tray.setToolTip(entry.site.name);

    const userAgentChanged =
      previous.userAgentPreset !== entry.site.userAgentPreset ||
      previous.customUserAgent !== entry.site.customUserAgent;
    if (userAgentChanged) {
      const userAgent = getUserAgent(entry.site);
      entry.session.setUserAgent(userAgent, "ja-JP,ja,en-US,en");
      entry.contents.setUserAgent(userAgent);
    }
    if (url !== previous.url) {
      entry.icons = null;
      applyTrayIcon(entry);
      entry.faviconRequested = null;
      void entry.contents.loadURL(url);
    } else if (userAgentChanged) {
      entry.contents.reloadIgnoringCache();
    }

    if (input?.sizePreset) setSiteWindowSize(entry, input.sizePreset);
    else {
      layoutSiteView(entry);
      sendSiteState(entry);
      broadcastSites();
    }
    return { ok: true, site: entry.site };
  });

  ipcMain.handle("sites:remove", async (event, id) => {
    verifyManagerSender(event);
    const entry = siteEntries.get(id);
    if (!entry) return { ok: false };

    entry.window.destroy();
    entry.tray.destroy();
    siteEntries.delete(id);
    store.remove(id);
    await entry.session.clearStorageData();
    await entry.session.clearCache();
    broadcastSites();
    return { ok: true };
  });

  ipcMain.handle("sites:show", (event, id) => {
    verifyManagerSender(event);
    showSite(id);
  });

  ipcMain.handle("sites:resize", (event, id, presetId) => {
    verifyManagerSender(event);
    const entry = siteEntries.get(id);
    if (!entry) return { ok: false };
    const bounds = setSiteWindowSize(entry, presetId);
    return bounds ? { ok: true, bounds } : { ok: false };
  });

  ipcMain.handle("window-sizes:list", (event) => {
    verifyManagerSender(event);
    return WINDOW_SIZE_PRESETS;
  });

  ipcMain.handle("user-agents:list", (event) => {
    verifyManagerSender(event);
    return USER_AGENT_PRESETS;
  });

  ipcMain.handle("manager:hide", (event) => {
    verifyManagerSender(event);
    managerWindow.hide();
  });
}

function createManagerWindow() {
  managerWindow = new BrowserWindow({
    show: false,
    width: 500,
    height: 700,
    minWidth: 420,
    minHeight: 560,
    frame: false,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  managerWindow.setAlwaysOnTop(true, "pop-up-menu");
  managerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  managerWindow.on("blur", () => {
    if (!KEEP_WINDOWS_OPEN) managerWindow.hide();
  });
  managerWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      managerWindow.hide();
    }
  });
  managerWindow.webContents.on("did-finish-load", () => {
    if (managerWindow.isVisible()) positionWindow(managerTray, managerWindow);
  });
  void managerWindow.loadFile(path.join(__dirname, "manager.html"));
}

function createManagerTray() {
  managerTray = new Tray(createManagerIcon());
  managerTray.setToolTip("Pinbar — サイトを追加");
  managerTray.on("click", toggleManager);
  managerTray.on("right-click", () => {
    managerTray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "サイトを追加・管理", click: showManager },
        {
          label: "ログイン時に起動",
          type: "checkbox",
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({
              openAtLogin: item.checked,
              type: "mainAppService",
            });
          },
        },
        { type: "separator" },
        {
          label: "Pinbarについて…",
          click: () => {
            showManager();
            managerWindow.webContents.send("manager:show-about");
          },
        },
        { label: "サポート", click: () => void shell.openExternal(SUPPORT_URL) },
        { type: "separator" },
        { label: "Pinbarを終了", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ]),
    );
  });
}

const PERMISSION_LABELS = {
  notifications: "通知",
  media: "カメラまたはマイク",
  "display-capture": "画面共有",
  geolocation: "位置情報",
};

// サイトごとに記憶した権限の判断。値は "granted" か "denied"。
function normalizePermissions(value) {
  const permissions = {};
  if (!value || typeof value !== "object") return permissions;
  for (const [permission, decision] of Object.entries(value)) {
    if (PERMISSION_LABELS[permission] && (decision === "granted" || decision === "denied")) {
      permissions[permission] = decision;
    }
  }
  return permissions;
}

function setSitePermission(entry, permission, decision) {
  const permissions = { ...entry.site.permissions };
  if (decision === "granted" || decision === "denied") permissions[permission] = decision;
  else delete permissions[permission];
  entry.site = store.update(entry.site.id, { permissions });
  broadcastSites();
}

function isPermissionDenied(entry, permission) {
  return entry?.site.permissions?.[permission] === "denied";
}

// 初回だけ確認し、答えはサイトごとに記憶する（毎回聞かない）。
// ポップオーバーが見えているときはそのウィンドウに付けたシートで出す。
async function requestSensitivePermission(entry, permission, callback) {
  if (!PERMISSION_LABELS[permission]) {
    callback(false);
    return;
  }
  const remembered = entry.site.permissions?.[permission];
  if (remembered === "granted" || remembered === "denied") {
    callback(remembered === "granted");
    return;
  }

  entry.permissionPrompts ??= new Map();
  if (!entry.permissionPrompts.has(permission)) {
    const options = {
      type: "question",
      buttons: ["許可しない", "許可"],
      defaultId: 0,
      cancelId: 0,
      title: `${entry.site.name}の権限`,
      message: `${entry.site.name}が${PERMISSION_LABELS[permission]}へのアクセスを求めています。`,
      detail: "この選択は記憶されます。あとからアイコンの右クリックメニューで変更できます。",
    };
    const parent =
      !entry.window.isDestroyed() && entry.window.isVisible() ? entry.window : null;
    const prompt = (parent
      ? dialog.showMessageBox(parent, options)
      : dialog.showMessageBox(options)
    )
      .then((result) => {
        const granted = result.response === 1;
        if (!entry.window.isDestroyed()) {
          setSitePermission(entry, permission, granted ? "granted" : "denied");
        }
        return granted;
      })
      .finally(() => entry.permissionPrompts.delete(permission));
    entry.permissionPrompts.set(permission, prompt);
  }
  callback(await entry.permissionPrompts.get(permission));
}

function createSiteSession(site) {
  const siteSession = session.fromPartition(`persist:pinbar-${site.id}`);
  siteSession.setUserAgent(
    getUserAgent(site),
    "ja-JP,ja,en-US,en",
  );
  const allowedPermissions = new Set([
    "clipboard-sanitized-write",
    "display-capture",
    "fullscreen",
    "geolocation",
    "media",
    "notifications",
  ]);
  siteSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      allowedPermissions.has(permission) &&
      isWebUrl(requestingOrigin) &&
      !isPermissionDenied(siteEntries.get(site.id), permission),
  );
  siteSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    if (!isWebUrl(requestingUrl)) {
      callback(false);
      return;
    }
    if (["clipboard-sanitized-write", "fullscreen"].includes(permission)) {
      callback(true);
      return;
    }
    const entry = siteEntries.get(site.id);
    if (!entry) {
      callback(false);
      return;
    }
    void requestSensitivePermission(entry, permission, callback);
  });
  return siteSession;
}

function configureSiteNavigation(entry) {
  const contents = entry.contents;
  contents.on("will-attach-webview", (event) => event.preventDefault());

  contents.setWindowOpenHandler(({ url }) => {
    const currentUrl = contents.getURL();
    if (shouldOpenInApp(url, currentUrl, entry.site.url)) {
      setImmediate(() => {
        if (!contents.isDestroyed()) void contents.loadURL(url);
      });
      return { action: "deny" };
    }
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  contents.on("did-start-loading", () => sendSiteState(entry));
  contents.on("did-stop-loading", () => sendSiteState(entry));
  contents.on("did-navigate", () => sendSiteState(entry));
  contents.on("did-navigate-in-page", () => sendSiteState(entry));
  contents.on("will-navigate", (event, url) => {
    const currentUrl = contents.getURL();
    if (shouldOpenInApp(url, currentUrl, entry.site.url)) return;
    event.preventDefault();
    if (isWebUrl(url)) void shell.openExternal(url);
  });
  contents.on("will-frame-navigate", (event) => {
    if (isCustomProtocol(event.url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (isCustomProtocol(url)) event.preventDefault();
  });

  // 通知 API を包んで、通知が出たら合図を console に出してもらう（notification-hook.js）。
  contents.on("dom-ready", () => {
    contents.executeJavaScript(NOTIFICATION_HOOK_SCRIPT).catch(() => {});
  });
  contents.on("console-message", (details) => {
    if (details?.message === NOTIFICATION_SIGNAL) markSiteNotified(entry);
  });

  contents.on("page-favicon-updated", (_event, favicons) => {
    // 候補は複数来る（16px・32px など）。大きいものを選びたいので先頭数件をまとめて扱う。
    const faviconUrls = favicons.filter(isWebUrl).slice(0, MAX_FAVICON_CANDIDATES);
    const requestKey = faviconUrls.join("\n");
    if (faviconUrls.length > 0 && requestKey !== entry.faviconRequested) {
      entry.faviconRequested = requestKey;
      void updateSiteFavicon(entry, faviconUrls);
    }
  });

  contents.on("page-title-updated", (_event, title) => {
    if (entry.site.autoName && title) {
      const suggestedName = title
        .replace(/^\s*(?:\(\d+\)|[•●])\s*/, "")
        .split(/\s+[|–—]\s+/)[0]
        .trim();
      if (suggestedName) {
        entry.site = store.update(entry.site.id, {
          name: suggestedName.slice(0, 60),
          autoName: false,
        });
        broadcastSites();
      }
    }
    entry.tray.setToolTip(title ? `${entry.site.name} — ${title}` : entry.site.name);
    const titleUnread = hasUnreadTitle(title);
    if (titleUnread !== entry.titleUnread) {
      entry.titleUnread = titleUnread;
      applyTrayIcon(entry);
    }
    sendSiteState(entry);
  });
}

async function fetchFaviconImage(faviconUrl) {
  try {
    const response = await net.fetch(faviconUrl);
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_FAVICON_BYTES) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FAVICON_BYTES) return null;
    const image = nativeImage.createFromBuffer(Buffer.from(arrayBuffer));
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}

async function updateSiteFavicon(entry, faviconUrls) {
  try {
    const images = await Promise.all(faviconUrls.map(fetchFaviconImage));
    const image = pickLargestImage(images);
    if (!image || entry.window.isDestroyed()) return;

    const faviconDataUrl = normalizeFavicon(image).toDataURL();
    entry.icons = buildTrayIcons(faviconDataUrl);
    applyTrayIcon(entry);
    entry.site = store.update(entry.site.id, { faviconDataUrl });
    broadcastSites();
  } catch {
    // Keep the generated fallback icon when a site blocks favicon downloads.
  }
}

function buildSiteMenu(entry) {
  const currentBounds = getSiteWindowSize(entry);
  const currentPreset = findSizePreset(currentBounds);
  const sizeMenu = WINDOW_SIZE_PRESETS.map((preset) => ({
    label: `${preset.label}（${preset.width} × ${preset.height}）`,
    type: "radio",
    checked: currentPreset?.id === preset.id,
    click: () => setSiteWindowSize(entry, preset.id),
  }));
  if (!currentPreset) {
    sizeMenu.push({
      label: `カスタム（${currentBounds.width} × ${currentBounds.height}）`,
      type: "radio",
      checked: true,
      enabled: false,
    });
  }
  sizeMenu.push(
    { type: "separator" },
    { label: "辺や角のドラッグでも変更できます", enabled: false },
  );

  return Menu.buildFromTemplate([
    {
      label: entry.window.isVisible() ? `${entry.site.name}を隠す` : `${entry.site.name}を表示`,
      click: () => toggleSite(entry.site.id),
    },
    { type: "separator" },
    { label: "ウィンドウサイズ", submenu: sizeMenu },
    {
      label: "ピン留め",
      type: "checkbox",
      checked: Boolean(entry.site.pinned),
      click: () => runSiteAction(entry, "pin-toggle"),
    },
    {
      label: entry.detached ? "メニューバーへ戻す" : "ウィンドウを切り離す",
      click: () => runSiteAction(entry, "detach-toggle"),
    },
    {
      label: "アドレスバーを表示",
      type: "checkbox",
      checked: Boolean(entry.site.showAddressBar),
      click: () => runSiteAction(entry, "address-toggle"),
    },
    { type: "separator" },
    {
      label: "通知を許可",
      type: "checkbox",
      checked: !isPermissionDenied(entry, "notifications"),
      click: (item) =>
        setSitePermission(entry, "notifications", item.checked ? "granted" : "denied"),
    },
    {
      label: "記憶した権限の判断を消去",
      enabled: Object.keys(entry.site.permissions || {}).length > 0,
      click: () => {
        entry.site = store.update(entry.site.id, { permissions: {} });
        broadcastSites();
      },
    },
    { type: "separator" },
    { label: "再読み込み", click: () => entry.contents.reload() },
    { label: "キャッシュを無視して再読み込み", click: () => entry.contents.reloadIgnoringCache() },
    {
      label: "通常のブラウザで開く",
      click: () => {
        const url = entry.contents.getURL() || entry.site.url;
        if (isWebUrl(url)) void shell.openExternal(url);
      },
    },
    {
      label: "現在のURLをコピー",
      click: () => clipboard.writeText(entry.contents.getURL() || entry.site.url),
    },
    { type: "separator" },
    { label: "サイトを管理…", click: showManager },
    { label: "Pinbarを終了", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
  ]);
}

function persistSiteBounds(entry) {
  clearTimeout(entry.boundsTimer);
  entry.boundsTimer = setTimeout(() => {
    if (entry.window.isDestroyed()) return;
    const { width, height } = entry.window.getBounds();
    entry.site = store.update(entry.site.id, { bounds: { width, height } });
    broadcastSites();
  }, 250);
}

function layoutSiteView(entry) {
  if (entry.window.isDestroyed()) return;
  const [width, height] = entry.window.getContentSize();
  const panelTop = entry.detached ? 11 : PANEL_INSETS.top;
  const webTop =
    panelTop +
    TOOLBAR_HEIGHT +
    (entry.site.showAddressBar ? ADDRESS_BAR_HEIGHT : 0);
  entry.view.setBounds({
    x: PANEL_INSETS.left,
    y: webTop,
    width: Math.max(
      1,
      width - PANEL_INSETS.left - PANEL_INSETS.right,
    ),
    height: Math.max(
      1,
      height - webTop - PANEL_INSETS.bottom,
    ),
  });
  entry.view.setBorderRadius(PANEL_INSETS.radius);
}

function createSiteEntry(site) {
  site = {
    ...site,
    userAgentPreset: site.userAgentPreset || "mac",
    customUserAgent: site.customUserAgent || "",
    showAddressBar: Boolean(site.showAddressBar),
    pinned: Boolean(site.pinned),
    autoName: Boolean(site.autoName),
    permissions: normalizePermissions(site.permissions),
  };
  const siteSession = createSiteSession(site);
  const bounds = site.bounds || DEFAULT_BOUNDS;
  const window = new BrowserWindow({
    show: false,
    width: bounds.width || DEFAULT_BOUNDS.width,
    height: bounds.height || DEFAULT_BOUNDS.height,
    minWidth: DEFAULT_BOUNDS.minWidth,
    minHeight: DEFAULT_BOUNDS.minHeight,
    frame: false,
    hasShadow: false,
    transparent: true,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "chrome-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.setAlwaysOnTop(true, "pop-up-menu");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const icons = buildTrayIcons(site.faviconDataUrl);
  const tray = new Tray((icons || getFallbackSiteIcons()).mono);
  tray.setToolTip(site.name);

  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:pinbar-${site.id}`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      safeDialogs: true,
    },
  });
  window.contentView.addChildView(view);

  const entry = {
    site,
    window,
    view,
    contents: view.webContents,
    tray,
    icons,
    notified: false,
    titleUnread: false,
    session: siteSession,
    faviconRequested: null,
    boundsTimer: null,
    detached: false,
  };
  siteEntries.set(site.id, entry);
  layoutSiteView(entry);
  configureSiteNavigation(entry);

  tray.on("click", () => toggleSite(site.id));
  tray.on("right-click", () => tray.popUpContextMenu(buildSiteMenu(entry)));
  window.on("focus", () => {
    lastActiveSiteId = site.id;
  });
  window.on("show", () => {
    entry.notified = false;
    applyTrayIcon(entry);
  });
  window.on("hide", () => applyTrayIcon(entry));
  window.on("blur", () => {
    // 権限確認のシートが開いている間は、シートがキーになっても閉じない。
    const promptOpen = entry.permissionPrompts?.size > 0;
    if (
      !KEEP_WINDOWS_OPEN &&
      !entry.site.pinned &&
      !entry.detached &&
      !promptOpen
    ) {
      window.hide();
    }
  });
  window.on("resize", () => {
    layoutSiteView(entry);
    persistSiteBounds(entry);
  });
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (!entry.contents.isDestroyed()) entry.contents.close();
  });
  window.webContents.on("did-finish-load", () => {
    if (window.isVisible() && !entry.detached) positionWindow(tray, window);
    sendSiteState(entry);
  });
  window.webContents.on("before-input-event", (event, input) => {
    handleSiteShortcut(entry, event, input);
  });
  entry.contents.on("before-input-event", (event, input) => {
    handleSiteShortcut(entry, event, input);
  });
  entry.contents.setUserAgent(getUserAgent(site));
  void window.loadFile(path.join(__dirname, "chrome.html"));
  void entry.contents.loadURL(site.url);
  return entry;
}

app.on("second-instance", showManager);
app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  // Tray icons own the app lifecycle.
});

app.whenReady().then(() => {
  app.setName("Pinbar");
  app.dock?.hide();

  store = new SiteStore(path.join(app.getPath("userData"), "sites.json"));
  createManagerWindow();
  createManagerTray();
  setUpIpc();
  const savedSites = store.list();
  for (const site of savedSites) createSiteEntry(site);

  globalShortcut.register("Alt+X", () => {
    if (lastActiveSiteId && siteEntries.has(lastActiveSiteId)) {
      toggleSite(lastActiveSiteId);
    } else {
      toggleManager();
    }
  });

  if (process.env.PINBAR_PREVIEW_FIRST === "1" && savedSites[0]) {
    showSite(savedSites[0].id);
  } else if (
    savedSites.length === 0 &&
    !app.getLoginItemSettings({ type: "mainAppService" }).wasOpenedAtLogin
  ) {
    showManager();
  }
});
