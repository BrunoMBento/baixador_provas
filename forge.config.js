const fs = require("node:fs");
const path = require("node:path");

const playwrightDirectory = path.dirname(require.resolve("playwright-core"));
const browserRevision = require(path.join(playwrightDirectory, "browsers.json"))
  .browsers.find((browser) => browser.name === "chromium-headless-shell")?.revision;

if (!browserRevision) {
  throw new Error("Não foi possível identificar a versão do Chromium headless.");
}

const headlessDirectory = path.join(
  playwrightDirectory,
  ".local-browsers",
  `chromium_headless_shell-${browserRevision}`,
);

module.exports = {
  packagerConfig: {
    asar: true,
    ignore: [/^\/node_modules\/playwright-core\/\.local-browsers(?:\/|$)/],
    extraResource: [headlessDirectory],
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  hooks: {
    prePackage: async (_config, platform, arch) => {
      const browserExecutables = {
        "win32-x64": ["chrome-headless-shell-win64", "chrome-headless-shell.exe"],
        "linux-x64": ["chrome-headless-shell-linux64", "chrome-headless-shell"],
        "linux-arm64": ["chrome-headless-shell-linux-arm64", "chrome-headless-shell"],
        "darwin-x64": ["chrome-headless-shell-mac-x64", "chrome-headless-shell"],
        "darwin-arm64": ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"],
      };
      const executable = browserExecutables[`${platform}-${arch}`];
      if (!executable) {
        throw new Error(`Plataforma não suportada para empacotamento: ${platform}-${arch}.`);
      }
      if (!fs.existsSync(path.join(headlessDirectory, ...executable))) {
        throw new Error(
          `Chromium headless para ${platform}-${arch} ausente. Execute npm run setup:browser no sistema de destino antes de empacotar.`,
        );
      }
    },
  },
};
