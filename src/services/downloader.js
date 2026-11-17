const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const { launchBrowser } = require("./browser");
const { discoverContests, scrapeContestPdfs } = require("./scraper");
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
  constructor() {
    super();
    this.running = false;
    this.cancelled = false;
    this.browser = null;
    this.abortController = null;
  }

  emitProgress(progress) {
    this.emit("progress", progress);
  }

  async cancel() {
    if (!this.running) {
      return;
    }

    this.cancelled = true;
    this.abortController?.abort();
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

  async start(options) {
    if (this.running) {
      throw new Error("Já existe um download em andamento.");
    }

    this.running = true;
    this.cancelled = false;
    this.abortController = new AbortController();
    const summary = {
      contestCount: 0,
      fileCount: 0,
      downloaded: 0,
      skipped: 0,
      fileFailures: 0,
      failed: [],
      cancelled: false,
    };

    try {
      const destination = await fs.stat(options.destinationPath);
      if (!destination.isDirectory()) {
        throw new Error("A pasta de destino selecionada não é um diretório.");
      }

      this.emitProgress({
        phase: "discovering",
        message: "Localizando concursos encerrados...",
        ...summary,
      });

      this.browser = await launchBrowser();
      this.throwIfCancelled();
      const page = await this.browser.newPage();
      const contests = await discoverContests(page);
      this.throwIfCancelled();
      summary.contestCount = contests.length;
      const files = [];

      for (let index = 0; index < contests.length; index += 1) {
        this.throwIfCancelled();
        const contest = contests[index];
        this.emitProgress({
          phase: "scanning",
          message: `Lendo concurso ${index + 1} de ${contests.length}: ${contest.identifier}`,
          ...summary,
        });

        try {
          const urls = await scrapeContestPdfs(page, contest);
          await fs.mkdir(
            getContestDirectory(options.destinationPath, contest.identifier),
            { recursive: true },
          );
          for (const url of urls) {
            files.push({ contestId: contest.identifier, url });
          }
        } catch (error) {
          this.throwIfCancelled();
          summary.failed.push({
            name: contest.identifier,
            message: error.message,
          });
        }
      }

      summary.fileCount = files.length;
      this.emitProgress({
        phase: "downloading",
        message: files.length
          ? `${files.length} arquivos encontrados. Iniciando downloads...`
          : "Nenhum PDF encontrado na seção Provas e gabaritos.",
        ...summary,
      });

      let lastDownloadStartedAt = 0;
      for (const [index, file] of files.entries()) {
        this.throwIfCancelled();
        const fileName = getPdfFileName(file.url);
        const target = await getTargetFile(
          options.destinationPath,
          file.contestId,
          file.url,
        );

        await fs.mkdir(getContestDirectory(options.destinationPath, file.contestId), {
          recursive: true,
        });

        if (!options.replaceExisting && (await isExistingFile(target))) {
          summary.skipped += 1;
          this.emitProgress({
            phase: "downloading",
            message: `Arquivo já existe; ignorado: ${fileName}`,
            current: index + 1,
            ...summary,
          });
          continue;
        }

        const waitMs =
          options.delayMs - (Date.now() - lastDownloadStartedAt);
        if (lastDownloadStartedAt > 0 && waitMs > 0) {
          await this.wait(waitMs);
        }
        this.throwIfCancelled();
        lastDownloadStartedAt = Date.now();

        let fileFailed = false;
        try {
          const response = await fetch(file.url, {
            signal: this.abortController.signal,
            headers: { "User-Agent": "BaixadorDeProvas/1.0" },
          });
          getPdfUrl(response.url, file.url);
          await writePdfResponse(response, target, options.replaceExisting);
          summary.downloaded += 1;
        } catch (error) {
          this.throwIfCancelled();
          fileFailed = true;
          summary.fileFailures += 1;
          summary.failed.push({ name: fileName, message: error.message });
        }

        this.emitProgress({
          phase: "downloading",
          message: fileFailed
            ? `Falha ao baixar: ${fileName}`
            : `Processados ${index + 1} de ${files.length} arquivos`,
          current: index + 1,
          ...summary,
        });
      }
    } catch (error) {
      if (!this.cancelled) {
        throw error;
      }
    } finally {
      try {
        if (this.browser?.isConnected()) {
          await this.browser.close();
        }
      } finally {
        this.browser = null;
        summary.cancelled = this.cancelled;
        this.running = false;
        this.abortController = null;
        this.emitProgress({
          phase: "finished",
          message: summary.cancelled
            ? "Operação cancelada."
            : "Processamento concluído.",
          ...summary,
        });
      }
    }

    return summary;
  }

  wait(milliseconds) {
    return new Promise((resolve, reject) => {
      const signal = this.abortController.signal;
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, milliseconds);
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(Object.assign(new Error("Operação cancelada."), { name: "AbortError" }));
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

module.exports = { DownloadJob };
