const { spawnSync } = require("node:child_process");
const path = require("node:path");

const playwrightEntry = require.resolve("playwright");
const playwrightCli = path.join(path.dirname(playwrightEntry), "cli.js");
const result = spawnSync(
  process.execPath,
  [playwrightCli, "install", "--only-shell", "chromium"],
  {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
