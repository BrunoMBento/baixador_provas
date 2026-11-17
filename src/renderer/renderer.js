const form = document.querySelector("#download-form");
const destinationInput = document.querySelector("#destination");
const delayInput = document.querySelector("#delay");
const replaceCheckbox = document.querySelector("#replace-existing");
const chooseFolderButton = document.querySelector("#choose-folder");
const startButton = document.querySelector("#start");
const cancelButton = document.querySelector("#cancel");
const progressBar = document.querySelector("#progress");
const percentage = document.querySelector("#percentage");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");

let running = false;

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
  const delayMs = Number(delayInput.value);
  if (!destinationInput.value || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 600_000) {
    status.textContent = "Escolha uma pasta e informe um intervalo entre 0 e 600000 ms.";
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
  try {
    await window.downloader.cancel();
  } catch (error) {
    status.textContent = `Não foi possível cancelar: ${error.message}`;
  }
});

window.downloader.onProgress((progress) => {
  status.textContent = progress.message;
  document.querySelector("#contest-count").textContent = progress.contestCount ?? 0;
  document.querySelector("#file-count").textContent = progress.fileCount ?? 0;
  document.querySelector("#downloaded-count").textContent = progress.downloaded ?? 0;
  document.querySelector("#skipped-count").textContent = progress.skipped ?? 0;
  document.querySelector("#failed-count").textContent = progress.failed?.length ?? 0;

  const completed =
    (progress.downloaded ?? 0) +
    (progress.skipped ?? 0) +
    (progress.fileFailures ?? 0);
  const value =
    progress.phase === "finished"
      ? 100
      : progress.fileCount
        ? Math.floor((completed / progress.fileCount) * 100)
        : 0;
  progressBar.value = value;
  percentage.textContent = `${value}%`;

  if (progress.phase === "finished") {
    showSummary(progress);
    setRunning(false);
  }
});

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
  startButton.disabled = running;
  chooseFolderButton.disabled = running;
  delayInput.disabled = running;
  replaceCheckbox.disabled = running;
  cancelButton.disabled = !running;
}
