"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");

module.exports = async function afterPack(context) {
  if (!["darwin", "mas"].includes(context.electronPlatformName)) return;

  const appName = context.packager.appInfo.productFilename;
  const infoPlist = path.join(
    context.appOutDir,
    `${appName}.app`,
    "Contents",
    "Info.plist",
  );

  // Electron's base Info.plist includes Bluetooth usage strings even when the
  // app does not request Bluetooth. Remove those unused declarations so the
  // binary accurately reflects Pinbar's behavior and App Privacy answers.
  for (const key of [
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
  ]) {
    try {
      execFileSync("/usr/bin/plutil", ["-remove", key, infoPlist]);
    } catch {
      // The key may no longer exist in a future Electron release.
    }
  }
};
