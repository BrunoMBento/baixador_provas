const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("updates the interval and estimate when paused and applies it on resume", async () => {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, {
          value: selector === "#delay" ? "2" : "",
          disabled: false,
          handlers: {},
          addEventListener(event, callback) { this.handlers[event] = callback; },
          checkValidity() { return true; },
          replaceChildren() {},
        });
      }
      return elements.get(selector);
    },
  };
  const progress = {
    contestCount: 10, scannedCount: 2, scanProcessed: 2, fileCount: 10,
    pendingFiles: 10, readDurationMs: 6000, readSamples: 2,
    estimateReady: true, stage: "scanning", failed: [],
  };
  let onProgress;
  let finish;
  let resumedDelay;
  const downloader = {
    start(options) {
      assert.equal(options.delayMs, 2000);
      onProgress({ ...progress, phase: "scanning" });
      return new Promise((resolve) => { finish = resolve; });
    },
    async pause() {
      onProgress({ ...progress, phase: "pausing" });
      assert.equal(document.querySelector("#delay").disabled, true);
      onProgress({ ...progress, phase: "paused" });
    },
    async resume(delay) {
      resumedDelay = delay;
      onProgress({ ...progress, phase: "scanning" });
    },
    async cancel() {
      onProgress({ ...progress, phase: "finished", cancelled: true });
      finish({ cancelled: true });
    },
    onProgress(callback) { onProgress = callback; },
  };
  const context = vm.createContext({ document, window: { downloader } });
  for (const file of ["estimate.js", "renderer.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "../src/renderer", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  const element = (selector) => document.querySelector(selector);
  element("#destination").value = "/downloads";
  const running = element("#download-form").handlers.submit({ preventDefault() {} });
  assert.equal(element("#delay").disabled, true);
  assert.equal(element("#time-estimate").textContent, "Tempo estimado: 2 min 4 s");

  await element("#pause").handlers.click();
  assert.equal(element("#delay").disabled, false);
  element("#delay").value = "0.5";
  element("#delay").handlers.input();
  assert.equal(element("#delay-value").textContent, "0,5 s");
  assert.equal(element("#time-estimate").textContent, "Tempo estimado: 49 s");

  await element("#pause").handlers.click();
  assert.equal(resumedDelay, 500);
  assert.equal(element("#delay").disabled, true);
  await element("#cancel").handlers.click();
  await running;
  assert.equal(element("#delay").disabled, false);
  assert.equal(element("#time-estimate").textContent, "Tempo estimado: indisponível");
});
