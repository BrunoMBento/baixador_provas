const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateRemainingMs } = require("../src/renderer/estimate");

test("projects unread contests using measured time and pending PDF averages", () => {
  const progress = {
    estimateReady: true,
    stage: "scanning",
    contestCount: 10,
    scanProcessed: 2,
    scannedCount: 2,
    readSamples: 2,
    readDurationMs: 6000,
    pendingFiles: 10,
  };
  assert.equal(estimateRemainingMs(progress, 2000), 124_000);
  assert.equal(estimateRemainingMs(progress, 500), 49_000);
});

test("uses known pending files after scanning and handles unavailable estimates", () => {
  const progress = {
    estimateReady: true,
    stage: "downloading",
    pendingFiles: 6,
  };
  assert.equal(estimateRemainingMs(progress, 500), 3000);
  assert.equal(estimateRemainingMs({ ...progress, pendingFiles: 0 }, 2000), 0);
  assert.equal(estimateRemainingMs({ ...progress, estimateReady: false }, 2000), null);
  assert.equal(
    estimateRemainingMs({ ...progress, phase: "finished", cancelled: true }, 2000),
    null,
  );
  assert.equal(
    estimateRemainingMs({ ...progress, phase: "finished", fatalError: true }, 2000),
    null,
  );
  assert.equal(
    estimateRemainingMs({
      ...progress,
      stage: "scanning",
      contestCount: 5,
      scanProcessed: 0,
      scannedCount: 0,
      readSamples: 0,
    }, 2000),
    null,
  );
});
