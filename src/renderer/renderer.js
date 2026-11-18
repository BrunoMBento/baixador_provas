const form = document.querySelector("#download-form");
const destinationInput = document.querySelector("#destination");
const delayInput = document.querySelector("#delay");
const delayValue = document.querySelector("#delay-value");
const replaceCheckbox = document.querySelector("#replace-existing");
const chooseFolderButton = document.querySelector("#choose-folder");
const startButton = document.querySelector("#start");
const pauseButton = document.querySelector("#pause");
const cancelButton = document.querySelector("#cancel");
const progressBar = document.querySelector("#progress");
const percentage = document.querySelector("#percentage");
const status = document.querySelector("#status");
const timeEstimate = document.querySelector("#time-estimate");
const summary = document.querySelector("#summary");

let running = false;
let paused = false;
let latestProgress = null;

delayInput.addEventListener("input", updateDelayDisplay);

chooseFolderButton.addEventListener("click", async () => {
  try {
    const directory = await window.downloader.selectDirectory();
    if (directory) {
      destinationInput.value = directory;
    }
  } catch (error) {
    status.textContent = `Não foi possível escolher a pasta: ${error.message}`;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const delayMs = Number(delayInput.value) * 1000;
  if (!destinationInput.value || !delayInput.checkValidity()) {
    status.textContent = "Escolha uma pasta e um intervalo válido.";
    return;
  }

  setRunning(true);
  summary.hidden = true;
  status.textContent = "Iniciando...";

  try {
    const result = await window.downloader.start({
      destinationPath: destinationInput.value,
      replaceExisting: replaceCheckbox.checked,
      delayMs,
    });
    showSummary(result);
  } catch (error) {
    status.textContent = `Não foi possível iniciar o download: ${error.message}`;
  } finally {
    setRunning(false);
  }
});

cancelButton.addEventListener("click", async () => {
  cancelButton.disabled = true;
  pauseButton.disabled = true;
  try {
    await window.downloader.cancel();
  } catch (error) {
    status.textContent = `Não foi possível cancelar: ${error.message}`;
    cancelButton.disabled = false;
    pauseButton.disabled = false;
  }
});

pauseButton.addEventListener("click", async () => {
  pauseButton.disabled = true;
  try {
    if (paused) {
      delayInput.disabled = true;
      await window.downloader.resume(Number(delayInput.value) * 1000);
    } else {
      await window.downloader.pause();
    }
  } catch (error) {
    status.textContent = `Não foi possível alterar a pausa: ${error.message}`;
  } finally {
    pauseButton.disabled = !running || cancelButton.disabled;
    delayInput.disabled = running && (cancelButton.disabled || latestProgress?.phase !== "paused");
  }
});

window.downloader.onProgress((progress) => {
  if (!progress) {
    return;
  }
  latestProgress = progress;
  status.textContent = progress.message;
  document.querySelector("#contest-count").textContent = progress.contestCount ?? 0;
  document.querySelector("#scanned-count").textContent = progress.scannedCount ?? 0;
  document.querySelector("#file-count").textContent = progress.fileCount ?? 0;
  document.querySelector("#downloaded-count").textContent = progress.downloaded ?? 0;
  document.querySelector("#skipped-count").textContent = progress.skipped ?? 0;
  document.querySelector("#failed-count").textContent = progress.failed?.length ?? 0;

  const isScanning = progress.stage !== "downloading";
  const completed = isScanning ? progress.scanProcessed : progress.downloadProcessed;
  const total = isScanning ? progress.contestCount : progress.fileCount;
  const value = total ? Math.floor(((completed ?? 0) / total) * 100) : 0;
  progressBar.value = value;
  percentage.textContent = `${isScanning ? "Leitura" : "Downloads"}: ${value}%`;

  if (progress.phase !== "finished") {
    paused = progress.phase === "pausing" || progress.phase === "paused";
    pauseButton.textContent = paused ? "Continuar" : "Pausar";
    delayInput.disabled = running && (cancelButton.disabled || progress.phase !== "paused");
  }
  updateTimeEstimate();

  if (progress.phase === "finished") {
    showSummary(progress);
  }
});

function updateDelayDisplay() {
  const seconds = Number(delayInput.value);
  delayValue.textContent = `${seconds.toLocaleString("pt-BR")} s`;
  updateTimeEstimate();
}

function updateTimeEstimate() {
  const milliseconds = estimateRemainingMs(latestProgress, Number(delayInput.value) * 1000);
  if (milliseconds === null) {
    timeEstimate.textContent = "Tempo estimado: indisponível";
    return;
  }

  let seconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  const parts = [];
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (seconds || !parts.length) parts.push(`${seconds} s`);
  timeEstimate.textContent = `Tempo estimado: ${parts.join(" ")}`;
}

function showSummary(result) {
  if (!result) {
    return;
  }

  if (result.failed?.length) {
    summary.replaceChildren(
      ...result.failed.map((failure) => {
        const item = document.createElement("p");
        item.textContent = `${failure.name}: ${failure.message}`;
        return item;
      }),
    );
    summary.hidden = false;
  }
}

function setRunning(value) {
  running = value;
  if (!running) {
    paused = false;
    pauseButton.textContent = "Pausar";
  }
  startButton.disabled = running;
  chooseFolderButton.disabled = running;
  delayInput.disabled = running;
  replaceCheckbox.disabled = running;
  cancelButton.disabled = !running;
  pauseButton.disabled = !running;
}
