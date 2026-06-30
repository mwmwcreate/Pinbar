"use strict";

const { contextBridge, ipcRenderer } = require("electron");

let notchX = null;

function applyNotchPosition() {
  if (notchX === null || !document.documentElement) return;
  document.documentElement.style.setProperty("--notch-x", `${notchX}px`);
}

ipcRenderer.on("chrome:set-notch", (_event, value) => {
  if (!Number.isFinite(value)) return;
  notchX = Math.round(value);
  applyNotchPosition();
});

window.addEventListener("DOMContentLoaded", applyNotchPosition);

contextBridge.exposeInMainWorld("pinbar", {
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  openAppLink: (url) => ipcRenderer.invoke("app:open-link", url),
  listSites: () => ipcRenderer.invoke("sites:list"),
  addSite: (input) => ipcRenderer.invoke("sites:add", input),
  updateSite: (input) => ipcRenderer.invoke("sites:update", input),
  removeSite: (id) => ipcRenderer.invoke("sites:remove", id),
  showSite: (id) => ipcRenderer.invoke("sites:show", id),
  setSiteSize: (id, presetId) =>
    ipcRenderer.invoke("sites:resize", id, presetId),
  listWindowSizes: () => ipcRenderer.invoke("window-sizes:list"),
  listUserAgents: () => ipcRenderer.invoke("user-agents:list"),
  hideManager: () => ipcRenderer.invoke("manager:hide"),
  onSitesChanged: (callback) => {
    ipcRenderer.on("sites:changed", (_event, sites) => callback(sites));
  },
  onShowAbout: (callback) => {
    ipcRenderer.on("manager:show-about", () => callback());
  },
});
