const test = require("node:test");
const assert = require("node:assert/strict");
const { scrapeContestPdfs } = require("../src/services/scraper");

test("does not treat an unfinished contest page as a successful empty scan", async () => {
  let headingsRead = false;
  const page = {
    goto: async () => {},
    locator: (selector) => {
      if (selector === "ul.page-concursos__list") {
        return {
          first: () => ({
            waitFor: async () => { throw new Error("página não carregou"); },
          }),
        };
      }
      return {
        evaluateAll: async () => {
          headingsRead = true;
          return [];
        },
      };
    },
  };

  await assert.rejects(
    scrapeContestPdfs(page, {
      identifier: "CONCURSO",
      url: "https://www.cebraspe.org.br/concursos/CONCURSO",
    }),
    /página não carregou/,
  );
  assert.equal(headingsRead, false);
});
