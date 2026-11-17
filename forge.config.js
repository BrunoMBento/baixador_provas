const fs = require("node:fs");
const path = require("node:path");

const browserDirectory = path.join(
  path.dirname(require.resolve("playwright-core")),
  ".local-browsers",
);

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: [browserDirectory],
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  hooks: {
    prePackage: async (_config, _buildPath, _electronVersion, _platform) => {
      if (!fs.existsSync(browserDirectory)) {
        throw new Error(
          "Navegador Playwright ausente. Execute npm run setup:browser antes de empacotar.",
        );
      }
    },
  },
};
