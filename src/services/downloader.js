const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const { performance } = require("node:perf_hooks");
const { launchBrowser } = require("./browser");
const { discoverContests, scrapeContestPdfs } = require("./scraper");
const { loadCheckpoint, saveCheckpoint } = require("./checkpoint");
const {
  getTargetFile,
  isExistingFile,
  writePdfResponse,
} = require("./organizer");
const {
  getContestDirectory,
  getPdfFileName,
  getPdfUrl,
} = require("./validation");

class DownloadJob extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    this.launchBrowser = dependencies.launchBrowser ?? launchBrowser;
    this.discoverContests = dependencies.discoverContests ?? discoverContests;
    this.scrapeContestPdfs = dependencies.scrapeContestPdfs ?? scrapeContestPdfs;
    this.fetchFile = dependencies.fetchFile ?? fetch;
    this.now = dependencies.now ?? (() => performance.now());
    this.running = false;
    this.cancelled = false;
    this.paused = false;
    this.browser = null;
    this.abortController = null;
    this.lastProgress = null;
    this.wakePause = null;
    this.wakeDelay = null;
    this.completion = Promise.resolve();
  }

  emitProgress(progress) {
    this.lastProgress = progress;
    this.emit("progress", this.paused && progress.phase !== "finished"
      ? { ...progress, phase: "pausing", message: "Pausando após concluir a operação em andamento..." }
      : progress);
  }

  pause() {
    if (!this.running || this.cancelled || this.paused) {
      throw new Error("Não há uma operação em andamento para pausar.");
    }
    this.paused = true;
    this.emit("progress", {
      ...this.lastProgress,
      phase: "pausing",
      message: "Pausando após concluir a operação em andamento...",
    });
    this.wakeDelay?.();
  }

  resume(delayMs = this.delayMs) {
    if (!this.running || this.cancelled || !this.paused) {
      throw new Error("Não há uma operação pausada para continuar.");
    }
    this.delayMs = delayMs;
    this.paused = false;
    this.wakePause?.();
    this.emit("progress", this.lastProgress);
  }

  async cancel() {
    if (!this.running) {
      return;
    }

    this.cancelled = true;
    this.abortController?.abort();
    this.wakePause?.();
    if (this.browser?.isConnected()) {
      await this.browser.close();
    }
  }

  throwIfCancelled() {
    if (this.cancelled) {
      const error = new Error("Download cancelado pelo usuário.");
      error.name = "AbortError";
      throw error;
    }
  }

  async waitIfPaused() {
    this.throwIfCancelled();
    while (this.paused) {
      const resumed = new Promise((resolve) => {
        this.wakePause = resolve;
      });
      this.emit("progress", {
        ...this.lastProgress,
        phase: "paused",
        message: "Operação pausada. Clique em Continuar para retomar.",
      });
      await resumed;
      this.wakePause = null;
      this.throwIfCancelled();
    }
  }

  async start(options) {
    if (this.running) {
      throw new Error("Já existe um download em andamento.");
    }

    this.running = true;
    this.cancelled = false;
    this.paused = false;
    this.delayMs = options.delayMs;
    this.abortController = new AbortController();
    let finish;
    this.completion = new Promise((resolve) => {
      finish = resolve;
    });
    let failed = false;
    const summary = {
      contestCount: 0,
      scannedCount: 0,
      scanProcessed: 0,
      fileCount: 0,
      downloaded: 0,
      skipped: 0,
      fileFailures: 0,
      downloadProcessed: 0,
      pendingFiles: 0,
      readDurationMs: 0,
      readSamples: 0,
      estimateReady: false,
      failed: [],
      cancelled: false,
      stage: "scanning",
    };

    const report = (phase, message) => {
      this.emitProgress({ ...summary, phase, message });
    };

    try {
      report("discovering", "Preparando a leitura dos concursos...");
      const destination = await fs.stat(options.destinationPath);
      if (!destination.isDirectory()) {
        throw new Error("A pasta de destino selecionada não é um diretório.");
      }

      await this.waitIfPaused();
      let checkpoint = options.replaceExisting
        ? null
        : await loadCheckpoint(options.destinationPath);
      this.throwIfCancelled();

      let page;
      const getPage = async () => {
        if (!page) {
          this.browser = await this.launchBrowser();
          this.throwIfCancelled();
          page = await this.browser.newPage();
        }
        return page;
      };

      if (!checkpoint) {
        report("discovering", "Localizando concursos encerrados...");
        let contests;
        try {
          contests = await this.discoverContests(await getPage());
        } catch (error) {
          this.throwIfCancelled();
          throw error;
        }
        this.throwIfCancelled();
        checkpoint = {
          version: 1,
          contests: contests.map((contest) => ({ ...contest, pdfs: null })),
        };
        await saveCheckpoint(options.destinationPath, checkpoint);
      }

      summary.contestCount = checkpoint.contests.length;
      summary.scannedCount = checkpoint.contests.filter((contest) => contest.pdfs !== null).length;
      summary.scanProcessed = summary.scannedCount;
      summary.fileCount = checkpoint.contests.reduce(
        (count, contest) => count + (contest.pdfs?.length ?? 0),
        0,
      );
      for (const contest of checkpoint.contests) {
        if (contest.pdfs !== null && contest.readDurationMs !== undefined) {
          summary.readDurationMs += contest.readDurationMs;
          summary.readSamples += 1;
        }
      }

      const files = [];
      const prepareFiles = async (contest) => {
        for (const url of contest.pdfs) {
          await this.waitIfPaused();
          const file = { contestId: contest.identifier, url, pending: false };
          try {
            file.fileName = getPdfFileName(url);
            file.target = await getTargetFile(options.destinationPath, contest.identifier, url);
            file.pending = options.replaceExisting || !(await isExistingFile(file.target));
            if (file.pending) {
              summary.pendingFiles += 1;
            }
          } catch (error) {
            this.throwIfCancelled();
            file.error = error;
          }
          files.push(file);
        }
      };

      report("scanning", "Verificando arquivos dos concursos já lidos...");
      for (const contest of checkpoint.contests) {
        if (contest.pdfs !== null) {
          await prepareFiles(contest);
        }
      }
      summary.estimateReady = true;
      report("scanning", `Retomando leitura: ${summary.scannedCount} de ${summary.contestCount} concursos já lidos.`);

      for (const [index, contest] of checkpoint.contests.entries()) {
        if (contest.pdfs !== null) {
          continue;
        }
        await this.waitIfPaused();
        report("scanning", `Lendo concurso ${index + 1} de ${summary.contestCount}: ${contest.identifier}`);

        let urls;
        let startedAt;
        try {
          const contestPage = await getPage();
          startedAt = this.now();
          urls = await this.scrapeContestPdfs(contestPage, contest);
          await fs.mkdir(
            getContestDirectory(options.destinationPath, contest.identifier),
            { recursive: true },
          );
        } catch (error) {
          this.throwIfCancelled();
          summary.failed.push({ name: contest.identifier, message: error.message });
          summary.scanProcessed += 1;
          continue;
        }

        contest.pdfs = urls;
        contest.readDurationMs = Math.max(0, this.now() - startedAt);
        await saveCheckpoint(options.destinationPath, checkpoint);
        summary.scannedCount += 1;
        summary.scanProcessed += 1;
        summary.fileCount += urls.length;
        summary.readDurationMs += contest.readDurationMs;
        summary.readSamples += 1;
        await prepareFiles(contest);
        report("scanning", `Concursos lidos: ${summary.scannedCount} de ${summary.contestCount}.`);
      }

      await this.waitIfPaused();
      summary.stage = "downloading";
      report("downloading", files.length
        ? `${files.length} arquivos encontrados. Iniciando downloads...`
        : "Nenhum PDF encontrado na seção Provas e gabaritos.");

      let lastDownloadStartedAt = null;
      for (const file of files) {
        await this.waitIfPaused();
        const fileName = file.fileName ?? file.url;

        try {
          if (file.error) {
            throw file.error;
          }
          const exists = !options.replaceExisting && await isExistingFile(file.target);
          if (file.pending !== !exists) {
            file.pending = !exists;
            summary.pendingFiles += file.pending ? 1 : -1;
          }
          if (exists) {
            summary.skipped += 1;
            summary.downloadProcessed += 1;
            report("downloading", `Arquivo já existe; ignorado: ${fileName}`);
            continue;
          }

          while (lastDownloadStartedAt !== null) {
            await this.waitIfPaused();
            const waitMs = this.delayMs - (this.now() - lastDownloadStartedAt);
            if (waitMs <= 0) {
              break;
            }
            await this.wait(waitMs);
          }
          await this.waitIfPaused();
          lastDownloadStartedAt = this.now();

          const response = await this.fetchFile(file.url, {
            signal: this.abortController.signal,
            headers: { "User-Agent": "BaixadorDeProvas/1.0" },
          });
          getPdfUrl(response.url, file.url);
          await writePdfResponse(response, file.target, options.replaceExisting);
          summary.downloaded += 1;
        } catch (error) {
          this.throwIfCancelled();
          summary.fileFailures += 1;
          summary.failed.push({ name: `${file.contestId}/${fileName}`, message: error.message });
        }

        if (file.pending) {
          summary.pendingFiles -= 1;
          file.pending = false;
        }
        summary.downloadProcessed += 1;
        report("downloading", `Processados ${summary.downloadProcessed} de ${files.length} arquivos.`);
      }
    } catch (error) {
      if (!this.cancelled || error.name !== "AbortError") {
        failed = true;
        throw error;
      }
    } finally {
      try {
        if (this.browser?.isConnected()) {
          await this.browser.close();
        }
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        this.browser = null;
        summary.cancelled = this.cancelled;
        this.running = false;
        this.paused = false;
        this.abortController = null;
        this.emitProgress({
          ...summary,
          phase: "finished",
          fatalError: failed,
          message: failed
            ? "Operação interrompida por um erro."
            : summary.cancelled
              ? "Operação cancelada. Os concursos já lidos foram salvos."
              : "Processamento concluído.",
        });
        finish();
      }
    }

    return summary;
  }

  wait(milliseconds) {
    return new Promise((resolve, reject) => {
      const signal = this.abortController.signal;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        this.wakeDelay = null;
      };
      const onAbort = () => {
        cleanup();
        reject(Object.assign(new Error("Operação cancelada."), { name: "AbortError" }));
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, milliseconds);
      this.wakeDelay = () => {
        cleanup();
        resolve();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

module.exports = { DownloadJob };
