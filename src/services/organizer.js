const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const {
  getContestDirectory,
  getPdfFileName,
} = require("./validation");

async function getTargetFile(destinationPath, contestId, pdfUrl) {
  const directory = getContestDirectory(destinationPath, contestId);
  return path.join(directory, getPdfFileName(pdfUrl));
}

async function isExistingFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writePdfResponse(response, destinationPath, replaceExisting) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`O servidor respondeu com HTTP ${response.status}.`);
  }

  const temporaryPath = `${destinationPath}.${randomUUID()}.part`;

  try {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    const output = await fs.open(temporaryPath, "wx");
    try {
      await pipeline(Readable.fromWeb(response.body), output.createWriteStream());
    } finally {
      await output.close();
    }

    const handle = await fs.open(temporaryPath, "r");
    try {
      const signature = Buffer.alloc(5);
      const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
      if (bytesRead !== 5 || signature.toString("ascii") !== "%PDF-") {
        throw new Error("O arquivo recebido não é um PDF válido.");
      }
    } finally {
      await handle.close();
    }

    if (replaceExisting && (await isExistingFile(destinationPath))) {
      const backupPath = `${destinationPath}.${randomUUID()}.bak`;
      await fs.rename(destinationPath, backupPath);
      try {
        await fs.rename(temporaryPath, destinationPath);
        await fs.unlink(backupPath);
      } catch (error) {
        await fs.rename(backupPath, destinationPath);
        throw error;
      }
    } else if (replaceExisting) {
      await fs.rename(temporaryPath, destinationPath);
    } else {
      await fs.link(temporaryPath, destinationPath);
      await fs.unlink(temporaryPath);
    }
  } finally {
    await fs.unlink(temporaryPath).catch((error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

module.exports = { getTargetFile, isExistingFile, writePdfResponse };
