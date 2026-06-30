"use strict";

const { build, Platform } = require("electron-builder");

process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

build({
  targets: Platform.MAC.createTarget(["mas"]),
  publish: "never",
  config: {
    mas: {
      identity: null,
    },
  },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
