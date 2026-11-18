const {
  LISTING_URL,
  getContestFromUrl,
  getPdfUrl,
} = require("./validation");

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
  await page.goto(contest.url, { waitUntil: "networkidle", timeout: 45_000 });
  await page.locator("ul.page-concursos__list").first().waitFor({
    state: "attached",
    timeout: 30_000,
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
}

module.exports = { discoverContests, scrapeContestPdfs };
