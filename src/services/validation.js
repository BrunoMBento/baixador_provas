const path = require("node:path");

const LISTING_URL = "https://www.cebraspe.org.br/concursos/encerrado";
const SITE_HOSTS = new Set([
  "www.cebraspe.org.br",
  "cdn.cebraspe.org.br",
  "www.cespe.unb.br",
]);

function isValidDelay(delayMs) {
  return Number.isInteger(delayMs) &&
    delayMs >= 500 && delayMs <= 3500 && delayMs % 500 === 0;
}

function getContestFromUrl(rawUrl) {
  const url = new URL(rawUrl, LISTING_URL);
  const match = url.pathname.match(/^\/concursos\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/);

  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.cebraspe.org.br" ||
    !match
  ) {
    throw new Error("O link do concurso não pertence ao site do Cebraspe.");
  }

  const identifier = match[1];
  if (identifier === "encerrado") {
    throw new Error("O identificador do concurso no link é inválido.");
  }

  return {
    url: url.href,
    identifier,
  };
}

function getPdfUrl(rawUrl, baseUrl) {
  const url = new URL(rawUrl, baseUrl);

  if (
    !["https:", "http:"].includes(url.protocol) ||
    !SITE_HOSTS.has(url.hostname.toLowerCase()) ||
    (url.protocol === "http:" && url.hostname.toLowerCase() !== "www.cespe.unb.br") ||
    !url.pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("O link do arquivo não é um PDF de um domínio autorizado.");
  }

  return url.href;
}

function getPdfFileName(rawUrl) {
  const url = new URL(rawUrl);
  let fileName;
  try {
    fileName = decodeURIComponent(url.pathname.split("/").at(-1) || "");
  } catch {
    throw new Error("O nome do arquivo PDF tem uma codificação inválida.");
  }

  fileName = fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "");

  if (
    !fileName ||
    !/\.pdf$/i.test(fileName) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)
  ) {
    throw new Error("O nome do arquivo PDF é inválido.");
  }

  return fileName;
}

function getContestDirectory(destinationPath, identifier) {
  const root = path.resolve(destinationPath);
  const directory = path.resolve(root, identifier);
  const relative = path.relative(root, directory);

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("O caminho do concurso está fora da pasta de destino.");
  }

  return directory;
}

module.exports = {
  LISTING_URL,
  isValidDelay,
  getContestDirectory,
  getContestFromUrl,
  getPdfFileName,
  getPdfUrl,
};
