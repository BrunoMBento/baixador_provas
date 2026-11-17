const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { writePdfResponse } = require("../src/services/organizer");

test("writes a valid PDF and replaces it only when requested", async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "baixador-provas-"));
  const target = path.join(temporaryDirectory, "prova.pdf");

  try {
    await fs.writeFile(target, "versão anterior");
    const pdf = new Response(Buffer.from("%PDF-1.7\nconteúdo"));

    await assert.rejects(writePdfResponse(pdf.clone(), target, false), /EEXIST/);
    assert.equal(await fs.readFile(target, "utf8"), "versão anterior");

    await writePdfResponse(pdf, target, true);
    assert.equal((await fs.readFile(target)).toString("ascii", 0, 5), "%PDF-");
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("rejects non-PDF content and removes the partial file", async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "baixador-provas-"));
  const target = path.join(temporaryDirectory, "arquivo.pdf");

  try {
    await assert.rejects(
      writePdfResponse(new Response("conteúdo inválido"), target, false),
      /não é um PDF válido/,
    );
    assert.deepEqual(await fs.readdir(temporaryDirectory), []);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
