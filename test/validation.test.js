const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  getContestDirectory,
  getContestFromUrl,
  getPdfFileName,
  getPdfUrl,
  isValidDelay,
} = require("../src/services/validation");

test("accepts only slider intervals from 0.5 to 3.5 seconds", () => {
  for (const delay of [500, 1000, 1500, 2000, 2500, 3000, 3500]) {
    assert.equal(isValidDelay(delay), true);
  }
  for (const delay of [0, 499, 750, 3501, 4000, "2000", NaN]) {
    assert.equal(isValidDelay(delay), false);
  }
});

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
  const destination = path.resolve("downloads");

  assert.equal(
    getPdfFileName("https://cdn.cebraspe.org.br/arquivos/prova%20objetiva.PDF"),
    "prova objetiva.PDF",
  );
  assert.throws(() => getPdfFileName("https://cdn.cebraspe.org.br/arquivos/CON.pdf"));
  assert.equal(
    getContestDirectory(destination, "AGU_22_PROCURADOR_FAZENDA"),
    path.join(destination, "AGU_22_PROCURADOR_FAZENDA"),
  );
  assert.equal(
    getContestDirectory(path.parse(process.cwd()).root, "AGU"),
    path.join(path.parse(process.cwd()).root, "AGU"),
  );
  assert.throws(() => getContestDirectory(destination, "../outside"));
});
