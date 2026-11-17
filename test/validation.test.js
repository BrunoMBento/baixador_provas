const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  getContestDirectory,
  getContestFromUrl,
  getPdfFileName,
  getPdfUrl,
} = require("../src/services/validation");

test("extracts a contest folder from its Cebraspe URL", () => {
  assert.deepEqual(
    getContestFromUrl("https://www.cebraspe.org.br/concursos/AGU_22_PROCURADOR_FAZENDA"),
    {
      url: "https://www.cebraspe.org.br/concursos/AGU_22_PROCURADOR_FAZENDA",
      identifier: "AGU_22_PROCURADOR_FAZENDA",
    },
  );
});

test("rejects foreign contest URLs and unsafe identifiers", () => {
  assert.throws(() => getContestFromUrl("https://example.com/concursos/AGU"));
  assert.throws(() => getContestFromUrl("https://www.cebraspe.org.br/concursos/../secret"));
  assert.throws(() => getContestFromUrl("https://www.cebraspe.org.br/concursos/outro/AGU"));
});

test("accepts PDFs from the site's file hosts and rejects other links", () => {
  assert.equal(
    getPdfUrl(
      "https://cdn.cebraspe.org.br/concursos/AGU/arquivos/prova.PDF",
      "https://www.cebraspe.org.br/concursos/AGU",
    ),
    "https://cdn.cebraspe.org.br/concursos/AGU/arquivos/prova.PDF",
  );
  assert.throws(() =>
    getPdfUrl("https://example.com/prova.pdf", "https://www.cebraspe.org.br/concursos/AGU"),
  );
  assert.throws(() =>
    getPdfUrl("https://cdn.cebraspe.org.br/prova.html", "https://www.cebraspe.org.br/concursos/AGU"),
  );
  assert.throws(() =>
    getPdfUrl("http://cdn.cebraspe.org.br/prova.pdf", "https://www.cebraspe.org.br/concursos/AGU"),
  );
});

test("sanitizes PDF names and keeps contest folders under the destination", () => {
  assert.equal(
    getPdfFileName("https://cdn.cebraspe.org.br/arquivos/prova%20objetiva.PDF"),
    "prova objetiva.PDF",
  );
  assert.throws(() => getPdfFileName("https://cdn.cebraspe.org.br/arquivos/CON.pdf"));
  assert.equal(
    getContestDirectory("/downloads", "AGU_22_PROCURADOR_FAZENDA"),
    path.join("/downloads", "AGU_22_PROCURADOR_FAZENDA"),
  );
  assert.equal(
    getContestDirectory(path.parse(process.cwd()).root, "AGU"),
    path.join(path.parse(process.cwd()).root, "AGU"),
  );
  assert.throws(() => getContestDirectory("/downloads", "../outside"));
});
