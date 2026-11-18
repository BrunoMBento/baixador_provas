const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { DownloadJob } = require("../src/services/downloader");
const { CHECKPOINT_FILE, loadCheckpoint } = require("../src/services/checkpoint");

const contests = ["CONCURSO_1", "CONCURSO_2"].map((identifier) => ({
  identifier,
  url: `https://www.cebraspe.org.br/concursos/${identifier}`,
}));

function pdfUrl(identifier) {
  return `https://cdn.cebraspe.org.br/concursos/${identifier}/arquivos/prova.pdf`;
}

function createDependencies() {
  const calls = { discovery: 0, scanned: [], downloaded: [] };
  return {
    calls,
    launchBrowser: async () => {
      let connected = true;
      return {
        isConnected: () => connected,
        newPage: async () => ({ isClosed: () => false }),
        close: async () => { connected = false; },
      };
    },
    discoverContests: async () => {
      calls.discovery += 1;
      return contests;
    },
    scrapeContestPdfs: async (_page, contest) => {
      calls.scanned.push(contest.identifier);
      return [pdfUrl(contest.identifier)];
    },
    fetchFile: async (url) => {
      calls.downloaded.push(url);
      const response = new Response("%PDF-1.7\nconteúdo");
      Object.defineProperty(response, "url", { value: url });
      return response;
    },
  };
}

async function withDestination(run) {
  const destinationPath = await fs.mkdtemp(path.join(os.tmpdir(), "baixador-provas-job-"));
  try {
    await run(destinationPath);
  } finally {
    await fs.rm(destinationPath, { recursive: true, force: true });
  }
}

function options(destinationPath, replaceExisting = false) {
  return { destinationPath, replaceExisting, delayMs: 0 };
}

test("resumes reading after cancellation without consulting completed contests again", async () => {
  await withDestination(async (destinationPath) => {
    const first = createDependencies();
    const firstJob = new DownloadJob(first);
    firstJob.on("progress", (progress) => {
      if (progress.scannedCount === 1 && progress.phase === "scanning") {
        void firstJob.cancel();
      }
    });
    const result = await firstJob.start(options(destinationPath));
    assert.equal(result.cancelled, true);
    assert.deepEqual(first.calls.scanned, ["CONCURSO_1"]);
    assert.deepEqual((await loadCheckpoint(destinationPath)).contests.map((contest) => contest.pdfs),
      [[pdfUrl("CONCURSO_1")], null]);

    const second = createDependencies();
    const resumed = await new DownloadJob(second).start(options(destinationPath));
    assert.equal(second.calls.discovery, 0);
    assert.deepEqual(second.calls.scanned, ["CONCURSO_2"]);
    assert.equal(resumed.downloaded, 2);
    assert.equal(resumed.scannedCount, 2);
  });
});

test("continues on a new page after a failed scan and retries it on the next run", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    const pages = [];
    dependencies.launchBrowser = async () => {
      let connected = true;
      return {
        isConnected: () => connected,
        newPage: async () => {
          const page = { closed: false, isClosed() { return this.closed; } };
          pages.push(page);
          return page;
        },
        close: async () => { connected = false; },
      };
    };
    const scan = dependencies.scrapeContestPdfs;
    dependencies.scrapeContestPdfs = async (page, contest) => {
      if (contest.identifier === "CONCURSO_1") {
        page.closed = true;
        throw new Error("limite de 3 segundos");
      }
      return scan(page, contest);
    };
    const result = await new DownloadJob(dependencies).start(options(destinationPath));
    assert.equal(pages.length, 2);
    assert.equal(result.downloaded, 1);
    assert.equal(result.failed.length, 1);
    assert.deepEqual((await loadCheckpoint(destinationPath)).contests.map((contest) => contest.pdfs),
      [null, [pdfUrl("CONCURSO_2")]]);

    const retry = createDependencies();
    const resumed = await new DownloadJob(retry).start(options(destinationPath));
    assert.deepEqual(retry.calls.scanned, ["CONCURSO_1"]);
    assert.equal(resumed.downloaded, 1);
    assert.equal(resumed.skipped, 1);
  });
});

test("resumes downloads from saved contest lists and skips existing PDFs", async () => {
  await withDestination(async (destinationPath) => {
    const first = createDependencies();
    const job = new DownloadJob(first);
    job.on("progress", (progress) => {
      if (progress.downloaded === 1 && progress.phase === "downloading") {
        void job.cancel();
      }
    });
    const stopped = await job.start(options(destinationPath));
    assert.equal(stopped.cancelled, true);
    assert.equal(stopped.downloaded, 1);

    const second = createDependencies();
    const result = await new DownloadJob(second).start(options(destinationPath));
    assert.equal(second.calls.discovery, 0);
    assert.deepEqual(second.calls.scanned, []);
    assert.deepEqual(second.calls.downloaded, [pdfUrl("CONCURSO_2")]);
    assert.equal(result.skipped, 1);
    assert.equal(result.downloaded, 1);
  });
});

test("replacement starts a fresh scan and downloads existing files again", async () => {
  await withDestination(async (destinationPath) => {
    await new DownloadJob(createDependencies()).start(options(destinationPath));
    const replacement = createDependencies();
    const result = await new DownloadJob(replacement).start(options(destinationPath, true));

    assert.equal(replacement.calls.discovery, 1);
    assert.deepEqual(replacement.calls.scanned, ["CONCURSO_1", "CONCURSO_2"]);
    assert.equal(result.downloaded, 2);
    assert.equal(result.skipped, 0);
  });
});

test("pauses after the active scan and continues without starting another operation", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    let finishScan;
    let scanStarted;
    const started = new Promise((resolve) => { scanStarted = resolve; });
    const originalScan = dependencies.scrapeContestPdfs;
    dependencies.scrapeContestPdfs = async (...args) => {
      if (args[1].identifier === "CONCURSO_1") {
        scanStarted();
        await new Promise((resolve) => { finishScan = resolve; });
      }
      return originalScan(...args);
    };
    const job = new DownloadJob(dependencies);
    const paused = new Promise((resolve) => {
      job.on("progress", (progress) => {
        if (progress.phase === "paused") resolve();
      });
    });
    const completion = job.start(options(destinationPath));
    await started;
    job.pause();
    finishScan();
    await paused;
    assert.deepEqual(dependencies.calls.scanned, ["CONCURSO_1"]);
    assert.deepEqual(dependencies.calls.downloaded, []);
    job.resume();
    const result = await completion;
    assert.equal(result.downloaded, 2);
  });
});

test("cancels while paused and retries failed scans on the next run", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    dependencies.scrapeContestPdfs = async (_page, contest) => {
      dependencies.calls.scanned.push(contest.identifier);
      if (contest.identifier === "CONCURSO_1") throw new Error("site indisponível");
      return [pdfUrl(contest.identifier)];
    };
    const job = new DownloadJob(dependencies);
    job.on("progress", (progress) => {
      if (progress.scannedCount === 1 && progress.phase === "scanning") {
        job.pause();
      }
      if (progress.phase === "paused") {
        void job.cancel();
      }
    });
    const stopped = await job.start(options(destinationPath));
    assert.equal(stopped.cancelled, true);
    assert.equal(stopped.failed.length, 1);

    const retry = createDependencies();
    const result = await new DownloadJob(retry).start(options(destinationPath));
    assert.deepEqual(retry.calls.scanned, ["CONCURSO_1"]);
    assert.equal(result.downloaded, 2);
  });
});

test("pauses promptly during the interval between downloads and can be cancelled", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    const job = new DownloadJob(dependencies);
    let pauseRequested = false;
    let reachedPause = false;
    let requestedTimer;
    const timeout = setTimeout(() => { void job.cancel(); }, 2_000);
    job.on("progress", (progress) => {
      if (!pauseRequested && progress.downloaded === 1 && progress.phase === "downloading") {
        pauseRequested = true;
        requestedTimer = setTimeout(() => job.pause(), 20);
      }
      if (progress.phase === "paused") {
        reachedPause = true;
        void job.cancel();
      }
    });
    try {
      const result = await job.start({ ...options(destinationPath), delayMs: 60_000 });
      assert.equal(reachedPause, true);
      assert.equal(result.cancelled, true);
      assert.equal(dependencies.calls.downloaded.length, 1);
    } finally {
      clearTimeout(timeout);
      clearTimeout(requestedTimer);
    }
  });
});

test("finishes an active download before pausing and continues with the next file", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    const fetchFile = dependencies.fetchFile;
    let downloadStarted;
    let finishDownload;
    const started = new Promise((resolve) => { downloadStarted = resolve; });
    dependencies.fetchFile = async (url) => {
      if (url === pdfUrl("CONCURSO_1")) {
        downloadStarted();
        await new Promise((resolve) => { finishDownload = resolve; });
      }
      return fetchFile(url);
    };
    const job = new DownloadJob(dependencies);
    const paused = new Promise((resolve) => {
      job.on("progress", (progress) => {
        if (progress.phase === "paused") resolve();
      });
    });
    const completion = job.start(options(destinationPath));
    await started;
    job.pause();
    finishDownload();
    await paused;
    assert.deepEqual(dependencies.calls.downloaded, [pdfUrl("CONCURSO_1")]);
    job.resume();
    const result = await completion;
    assert.equal(result.downloaded, 2);
  });
});

test("applies a changed interval after resuming", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    let clock = 1000;
    dependencies.now = () => clock;
    const job = new DownloadJob(dependencies);
    const waits = [];
    job.wait = async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    };
    let pauseRequested = false;
    job.on("progress", (progress) => {
      if (!pauseRequested && progress.downloaded === 1 && progress.phase === "downloading") {
        pauseRequested = true;
        job.pause();
      } else if (progress.phase === "paused") {
        job.resume(500);
      }
    });

    const result = await job.start({ ...options(destinationPath), delayMs: 3500 });
    assert.equal(result.downloaded, 2);
    assert.deepEqual(waits, [500]);
  });
});

test("estimates only files not already present when resuming", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    const initialJob = new DownloadJob(dependencies);
    initialJob.on("progress", (progress) => {
      if (progress.downloaded === 1 && progress.phase === "downloading") {
        void initialJob.cancel();
      }
    });
    await initialJob.start(options(destinationPath));

    const resumedJob = new DownloadJob(createDependencies());
    let pendingAtStart;
    resumedJob.on("progress", (progress) => {
      if (progress.phase === "downloading" && progress.downloadProcessed === 0) {
        pendingAtStart = progress.pendingFiles;
      }
    });
    const result = await resumedJob.start(options(destinationPath));
    assert.equal(pendingAtStart, 1);
    assert.equal(result.pendingFiles, 0);
  });
});

test("retries a failed download without rereading completed contests", async () => {
  await withDestination(async (destinationPath) => {
    const first = createDependencies();
    const fetchFile = first.fetchFile;
    first.fetchFile = async (url) => {
      if (url === pdfUrl("CONCURSO_1")) throw new Error("arquivo indisponível");
      return fetchFile(url);
    };
    const initial = await new DownloadJob(first).start(options(destinationPath));
    assert.equal(initial.fileFailures, 1);
    assert.equal(initial.downloaded, 1);

    const retry = createDependencies();
    const result = await new DownloadJob(retry).start(options(destinationPath));
    assert.deepEqual(retry.calls.scanned, []);
    assert.deepEqual(retry.calls.downloaded, [pdfUrl("CONCURSO_1")]);
    assert.equal(result.skipped, 1);
    assert.equal(result.downloaded, 1);
  });
});

test("keeps a checkpoint usable when a PDF has an invalid filename", async () => {
  await withDestination(async (destinationPath) => {
    const dependencies = createDependencies();
    const scan = dependencies.scrapeContestPdfs;
    dependencies.scrapeContestPdfs = async (page, contest) => {
      if (contest.identifier === "CONCURSO_1") {
        return ["https://cdn.cebraspe.org.br/arquivos/CON.pdf"];
      }
      return scan(page, contest);
    };
    const initial = await new DownloadJob(dependencies).start(options(destinationPath));
    assert.equal(initial.fileFailures, 1);
    assert.equal(initial.downloaded, 1);

    const retry = createDependencies();
    const result = await new DownloadJob(retry).start(options(destinationPath));
    assert.deepEqual(retry.calls.scanned, []);
    assert.equal(result.fileFailures, 1);
    assert.equal(result.skipped, 1);
  });
});

test("reports a damaged checkpoint rather than silently discarding it", async () => {
  await withDestination(async (destinationPath) => {
    await fs.writeFile(path.join(destinationPath, CHECKPOINT_FILE), "{invalid");
    const dependencies = createDependencies();
    await assert.rejects(
      new DownloadJob(dependencies).start(options(destinationPath)),
      /arquivo de progresso.*inválido/i,
    );
    assert.equal(dependencies.calls.discovery, 0);

    const result = await new DownloadJob(dependencies).start(options(destinationPath, true));
    assert.equal(result.downloaded, 2);
  });
});
