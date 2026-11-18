function estimateRemainingMs(progress, delayMs) {
  if (!progress?.estimateReady ||
      (progress.phase === "finished" && (progress.cancelled || progress.fatalError))) {
    return null;
  }

  const remainingReads = progress.stage === "scanning"
    ? Math.max(0, progress.contestCount - progress.scanProcessed)
    : 0;
  let readingMs = 0;
  let pendingFiles = progress.pendingFiles;

  if (remainingReads > 0) {
    if (!progress.readSamples || !progress.scannedCount) {
      return null;
    }
    readingMs = (progress.readDurationMs / progress.readSamples) * remainingReads;
    pendingFiles += (pendingFiles / progress.scannedCount) * remainingReads;
  }

  const estimate = readingMs + pendingFiles * delayMs;
  return Number.isFinite(estimate) ? Math.ceil(estimate) : null;
}

if (typeof module !== "undefined") {
  module.exports = { estimateRemainingMs };
}
