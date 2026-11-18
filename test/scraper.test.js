const test = require("node:test");
const assert = require("node:assert/strict");
const { scrapeContestPdfs } = require("../src/services/scraper");

test("does not treat an unfinished contest page as a successful empty scan", async () => {
  let headingsRead = false;
  const page = {
    goto: async () => {},
    on: () => {},
    off: () => {},
    isClosed: () => false,
    close: async () => {},
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

test("reports a contest API error instead of waiting for content that will not load", async () => {
  const listeners = new Map();
  let closed = false;
  const page = {
    on: (event, callback) => listeners.set(event, callback),
    off: (event) => listeners.delete(event),
    isClosed: () => closed,
    close: async () => { closed = true; },
    goto: async () => {
      listeners.get("response")({
        url: () => "https://apis.cebraspe.org.br/cebraspe/eventos/ANATEL_14?_=123",
        status: () => 500,
      });
    },
    locator: () => ({ first: () => ({ waitFor: () => new Promise(() => {}) }) }),
  };

  await assert.rejects(
    scrapeContestPdfs(page, {
      identifier: "ANATEL_14",
      url: "https://www.cebraspe.org.br/concursos/ANATEL_14",
    }),
    /servidor do Cebraspe retornou HTTP 500/,
  );
  assert.equal(closed, true);
  assert.equal(listeners.size, 0);
});

test("reports failed contest API connections", async () => {
  const listeners = new Map();
  const page = {
    on: (event, callback) => listeners.set(event, callback),
    off: (event) => listeners.delete(event),
    isClosed: () => false,
    close: async () => {},
    goto: async () => {
      listeners.get("requestfailed")({
        url: () => "https://apis.cebraspe.org.br/cebraspe/eventos/ANATEL_14",
        failure: () => ({ errorText: "net::ERR_CONNECTION_RESET" }),
      });
    },
    locator: () => ({ first: () => ({ waitFor: () => new Promise(() => {}) }) }),
  };
  await assert.rejects(
    scrapeContestPdfs(page, {
      identifier: "ANATEL_14",
      url: "https://www.cebraspe.org.br/concursos/ANATEL_14",
    }),
    /net::ERR_CONNECTION_RESET/,
  );
  assert.equal(listeners.size, 0);
});

test("limits the whole contest read to three seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let finishNavigation;
  let waitingForList = false;
  let closed = false;
  const page = {
    on: () => {},
    off: () => {},
    isClosed: () => closed,
    close: async () => { closed = true; },
    goto: () => new Promise((resolve) => { finishNavigation = resolve; }),
    locator: () => ({
      first: () => ({
        waitFor: () => {
          waitingForList = true;
          return new Promise(() => {});
        },
      }),
    }),
  };
  const reading = scrapeContestPdfs(page, {
    identifier: "CONCURSO",
    url: "https://www.cebraspe.org.br/concursos/CONCURSO",
  });
  t.mock.timers.tick(2_000);
  finishNavigation();
  await Promise.resolve();
  assert.equal(waitingForList, true);
  t.mock.timers.tick(999);
  assert.equal(closed, false);
  t.mock.timers.tick(1);
  await assert.rejects(reading, /limite de 3 segundos/);
  assert.equal(closed, true);
});

test("applies the same deadline while extracting links", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let extracting = false;
  let closed = false;
  const page = {
    on: () => {},
    off: () => {},
    isClosed: () => closed,
    close: async () => { closed = true; },
    goto: async () => {},
    locator: (selector) => selector === "h2"
      ? { evaluateAll: () => { extracting = true; return new Promise(() => {}); } }
      : { first: () => ({ waitFor: async () => {} }) },
  };
  const reading = scrapeContestPdfs(page, {
    identifier: "CONCURSO",
    url: "https://www.cebraspe.org.br/concursos/CONCURSO",
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(extracting, true);
  t.mock.timers.tick(3_000);
  await assert.rejects(reading, /limite de 3 segundos/);
  assert.equal(closed, true);
});
