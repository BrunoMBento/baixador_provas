const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const config = require("../forge.config");

test("packages only the headless browser without duplicating installed browsers", () => {
  const { ignore, extraResource } = config.packagerConfig;
  assert.ok(ignore.some((pattern) =>
    pattern.test("/node_modules/playwright-core/.local-browsers/chromium-123/file"),
  ));
  assert.ok(!ignore.some((pattern) =>
    pattern.test("/node_modules/playwright-core/lib/coreBundle.js"),
  ));
  assert.equal(extraResource.length, 1);
  assert.match(path.basename(extraResource[0]), /^chromium_headless_shell-\d+$/);
});

test("rejects packaging when the target platform's headless executable is missing", async (t) => {
  let checkedPath;
  t.mock.method(fs, "existsSync", (filePath) => {
    checkedPath = filePath;
    return false;
  });

  await assert.rejects(
    config.hooks.prePackage(null, "win32", "x64"),
    /Chromium headless para win32-x64 ausente/,
  );
  assert.equal(
    path.basename(checkedPath),
    "chrome-headless-shell.exe",
  );
  assert.equal(path.basename(path.dirname(checkedPath)), "chrome-headless-shell-win64");
});
