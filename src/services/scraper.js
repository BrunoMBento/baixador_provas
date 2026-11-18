const {
  LISTING_URL,
  getContestFromUrl,
  getPdfUrl,
} = require("./validation");

const CONTEST_READ_TIMEOUT_MS = 3_000;

async function discoverContests(page) {
  await page.goto(LISTING_URL, { waitUntil: "networkidle", timeout: 45_000 });
  await page.locator("li.q_circle_outer").first().waitFor({
    state: "attached",
    timeout: 30_000,
  });

  const rawUrls = await page.locator("li.q_circle_outer").evaluateAll((items) =>
    items.flatMap((item) =>
      Array.from(item.querySelectorAll("a[href]"), (link) => link.href),
    ),
  );

  const contests = new Map(
    rawUrls.map((rawUrl) => {
      const contest = getContestFromUrl(rawUrl);
      return [contest.identifier, contest];
    }),
  );

  if (contests.size === 0) {
    throw new Error("Não foi possível encontrar concursos encerrados na página do Cebraspe.");
  }

  return [...contests.values()];
}

async function scrapeContestPdfs(page, contest) {
  let rejectApiError;
  const apiFailure = new Promise((_, reject) => { rejectApiError = reject; });
  const isContestApi = (rawUrl) => {
    const url = new URL(rawUrl);
    return url.origin === "https://apis.cebraspe.org.br" &&
      url.pathname === `/cebraspe/eventos/${contest.identifier}`;
  };
  const onResponse = (response) => {
    if (isContestApi(response.url()) && response.status() >= 400) {
      rejectApiError(new Error(`O servidor do Cebraspe retornou HTTP ${response.status()} ao consultar o concurso. Tente novamente mais tarde.`));
    }
  };
  const onRequestFailed = (request) => {
    if (isContestApi(request.url())) {
      rejectApiError(new Error(`Não foi possível consultar o concurso no servidor do Cebraspe: ${request.failure()?.errorText ?? "falha de conexão"}.`));
    }
  };
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  let timer;
  const timeoutError = new Error("A leitura do concurso excedeu o limite de 3 segundos. Tente novamente mais tarde.");
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError), CONTEST_READ_TIMEOUT_MS);
  });
  try {
    const read = async () => {
      await page.goto(contest.url, { waitUntil: "domcontentloaded", timeout: CONTEST_READ_TIMEOUT_MS });
      await page.locator("ul.page-concursos__list").first().waitFor({
        state: "attached",
        timeout: CONTEST_READ_TIMEOUT_MS,
      });
      const rawUrls = await page.locator("h2").evaluateAll((headings) => {
        const heading = headings.find(
          (item) => item.textContent?.trim().toLocaleLowerCase("pt-BR") === "provas e gabaritos",
        );

        const section = heading?.closest(".vc_column_container");
        if (!section) {
          return [];
        }

        return Array.from(
          section.querySelectorAll('li a[href$=".pdf" i]'),
          (link) => link.href,
        );
      });

      return [...new Set(rawUrls.map((rawUrl) => getPdfUrl(rawUrl, contest.url)))];
    };
    return await Promise.race([read(), apiFailure, timeout]);
  } catch (error) {
    if (!page.isClosed()) {
      await page.close();
    }
    if (error.name === "TimeoutError") {
      throw new Error(timeoutError.message, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
  }
}

module.exports = { discoverContests, scrapeContestPdfs };
