"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { build, Platform } = require("electron-builder");

const profile = process.env.MAS_PROVISIONING_PROFILE;

if (!profile) {
  console.error(
    "MAS_PROVISIONING_PROFILE に Mac App Store 用 provisioning profile のパスを指定してください。",
  );
  process.exit(1);
}

const profilePath = path.resolve(profile);
if (!fs.existsSync(profilePath)) {
  console.error(`Provisioning profile が見つかりません: ${profilePath}`);
  process.exit(1);
}

build({
  targets: Platform.MAC.createTarget(["mas"]),
  publish: "never",
  config: {
    mas: {
      provisioningProfile: profilePath,
    },
  },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
