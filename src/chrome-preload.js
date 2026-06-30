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

contextBridge.exposeInMainWorld("pinbarChrome", {
  action: (name, payload) =>
    ipcRenderer.invoke("chrome:action", { name, payload }),
  onState: (callback) => {
    ipcRenderer.on("chrome:state", (_event, state) => callback(state));
  },
  onFocusAddress: (callback) => {
    ipcRenderer.on("chrome:focus-address", () => callback());
  },
});
