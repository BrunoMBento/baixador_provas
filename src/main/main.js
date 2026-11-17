const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { DownloadJob } = require("../services/downloader");

let mainWindow;
const downloadJob = new DownloadJob();

function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Solicitação IPC não autorizada.");
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 680,
    minWidth: 620,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendProgress(progress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("download:progress", progress);
  }
}

app.whenReady().then(() => {
  downloadJob.on("progress", sendProgress);

  ipcMain.handle("dialog:select-directory", async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Escolha a pasta raiz dos downloads",
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("download:start", (event, options) => {
    assertTrustedSender(event);

    if (
      !options ||
      typeof options.destinationPath !== "string" ||
      !path.isAbsolute(options.destinationPath) ||
      typeof options.replaceExisting !== "boolean" ||
      !Number.isInteger(options.delayMs) ||
      options.delayMs < 0 ||
      options.delayMs > 600_000
    ) {
      throw new Error("As configurações de download são inválidas.");
    }

    return downloadJob.start(options);
  });

  ipcMain.handle("download:cancel", (event) => {
    assertTrustedSender(event);
    return downloadJob.cancel();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  downloadJob.cancel().catch((error) => {
    console.error("Não foi possível encerrar o navegador do Playwright:", error);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
