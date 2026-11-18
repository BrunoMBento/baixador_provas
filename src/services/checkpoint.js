const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { getContestFromUrl, getPdfUrl } = require("./validation");

const CHECKPOINT_FILE = ".baixador-provas-progresso.json";

async function loadCheckpoint(destinationPath) {
  const filePath = path.join(destinationPath, CHECKPOINT_FILE);
  let contents;
  try {
    contents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Não foi possível ler o progresso salvo: ${error.message}`, { cause: error });
  }

  try {
    const checkpoint = JSON.parse(contents);
    if (
      !checkpoint ||
      checkpoint.version !== 1 ||
      !Array.isArray(checkpoint.contests) ||
      checkpoint.contests.length === 0
    ) {
      throw new Error("formato ou versão inválida");
    }

    const identifiers = new Set();
    for (const contest of checkpoint.contests) {
      if (
        !contest ||
        typeof contest.url !== "string" ||
        typeof contest.identifier !== "string" ||
        (contest.pdfs !== null && !Array.isArray(contest.pdfs)) ||
        (contest.readDurationMs !== undefined &&
          (!Number.isFinite(contest.readDurationMs) || contest.readDurationMs < 0))
      ) {
        throw new Error("dados de concurso inválidos");
      }
      const validated = getContestFromUrl(contest.url);
      if (validated.identifier !== contest.identifier || identifiers.has(contest.identifier)) {
        throw new Error("identificador de concurso inválido ou duplicado");
      }
      identifiers.add(contest.identifier);
      for (const url of contest.pdfs ?? []) {
        if (typeof url !== "string") {
          throw new Error("link de PDF inválido");
        }
        if (getPdfUrl(url, contest.url) !== url) {
          throw new Error("link de PDF não é uma URL absoluta válida");
        }
      }
    }
    return checkpoint;
  } catch (error) {
    throw new Error(
      `O arquivo de progresso "${CHECKPOINT_FILE}" está inválido: ${error.message}. ` +
      "Para iniciar uma nova leitura, marque Substituir arquivos existentes.",
      { cause: error },
    );
  }
}

async function saveCheckpoint(destinationPath, checkpoint) {
  const filePath = path.join(destinationPath, CHECKPOINT_FILE);
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(checkpoint), { flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    throw new Error(`Não foi possível salvar o progresso: ${error.message}`, { cause: error });
  } finally {
    try {
      await fs.unlink(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

module.exports = { CHECKPOINT_FILE, loadCheckpoint, saveCheckpoint };
