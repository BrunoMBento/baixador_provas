const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function getBrowserDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ".local-browsers");
  }

  return path.join(
    path.dirname(require.resolve("playwright-core")),
    ".local-browsers",
  );
}

async function launchBrowser() {
  const browserDirectory = getBrowserDirectory();
  if (!fs.existsSync(browserDirectory)) {
    throw new Error(
      "O navegador necessário não foi instalado. Consulte as instruções de instalação do projeto.",
    );
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = browserDirectory;
  const { chromium } = require("playwright");
  return chromium.launch({ headless: true });
}

module.exports = { launchBrowser };
