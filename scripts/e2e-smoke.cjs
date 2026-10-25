/**
 * Browser smoke test against a running server (default http://localhost:3100).
 *   npm run build && npx next start -p 3100 &   then   node scripts/e2e-smoke.cjs
 * Uses Playwright's Chromium. Checks the real flows on desktop and phone viewports.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.env.SHOTS || "/tmp";
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "questions.json"), "utf8"));
const byText = new Map(data.questions.map((q) => [q.text.replace(/\s+/g, " ").trim(), q]));

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
}

async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 1, `${label}: no horizontal scroll (overflow ${over}px)`);
}

async function runSession(page, { weeksToPick, count, answerRight }) {
  await page.goto(BASE + "/practice");
  await page.getByRole("button", { name: "Clear selection" }).click();
  for (const w of weeksToPick) await page.getByLabel(new RegExp(`^Week ${w},`)).check({ force: true });
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await page.getByRole("button", { name: /Start practice/ }).click();
  await page.waitForURL("**/practice/session");

  const seenWeeks = new Set();
  const order = [];
  let expectedCorrect = 0;
  for (let i = 0; i < count; i++) {
    const heading = (await page.locator("h2").first().innerText()).replace(/\s+/g, " ").trim();
    const q = byText.get(heading);
    if (!q) throw new Error("Question not found in dataset: " + heading);
    order.push(q.id);
    seenWeeks.add(q.week);
    // Never reveals the answer before submitting.
    check(!(await page.getByText("Correct answer:").count()), `q${i + 1}: answer hidden before submit`);
    const correctTexts = q.options.filter((o) => q.correctOptionIds.includes(o.id)).map((o) => o.text);
    const wrongOpt = q.options.find((o) => !q.correctOptionIds.includes(o.id));
    const pickText = answerRight(i) || !wrongOpt ? correctTexts[0] : wrongOpt.text;
    await page.locator("label", { hasText: pickText }).filter({ has: page.locator("input") }).first().click();
    await page.getByRole("button", { name: "Submit answer" }).click();
    const shown = await page.locator("p", { hasText: /^Correct answer:/ }).first().innerText();
    check(correctTexts.every((t) => shown.includes(t)), `q${i + 1} (${q.id}): shown correct answer matches PDF-derived key`);
    check(await page.getByText(`Source: ${q.source.file} · PDF page ${q.source.page}`).count() > 0, `q${i + 1}: source reference shown`);
    const isRight = correctTexts.includes(pickText);
    if (isRight) expectedCorrect++;
    check((await page.getByText(isRight ? /^Correct$/ : /^Not quite$/).count()) === 1, `q${i + 1}: ${isRight ? "correct" : "incorrect"} feedback`);
    if (i === 1) {
      await page.reload();
      await page.waitForSelector("h2");
      const again = (await page.locator("h2").first().innerText()).replace(/\s+/g, " ").trim();
      check(again === heading, "progress survives page refresh (same question, answer kept)");
    }
    if (i < count - 1) await page.getByRole("button", { name: /Next question/ }).click();
    else await page.getByRole("button", { name: /See my results/ }).click();
  }
  await page.waitForURL("**/practice/results**");
  return { seenWeeks, order, expectedCorrect };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- desktop ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(BASE + "/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  check(/good (morning|afternoon|evening)|night owl|hey/i.test(await page.getByRole("heading", { level: 1 }).innerText()), "home greets the student");
  check((await page.getByText("120", { exact: true }).count()) > 0, "home shows 120 verified questions");
  check((await page.getByText("answer a question to see this").count()) === 1, "new user starts with zero progress (no fake accuracy)");
  check(await page.getByRole("link", { name: /Start Practicing/ }).isVisible(), "Start Practicing button visible");
  await page.screenshot({ path: `${SHOTS}/desktop-home.png`, fullPage: true });

  await page.goto(BASE + "/weeks");
  check((await page.locator("h2", { hasText: /^Week \d+$/ }).count()) === 12, "weeks page shows all 12 weeks");
  await page.screenshot({ path: `${SHOTS}/desktop-weeks.png`, fullPage: true });

  await page.goto(BASE + "/practice");
  await page.getByRole("button", { name: "Select all weeks" }).click();
  check((await page.getByText("120", { exact: true }).count()) + (await page.getByText(/120 verified questions/).count()) > 0, "select all → 120 eligible questions");
  await page.getByLabel("Custom number of questions").fill("500");
  check((await page.getByText(/only 120 verified questions are available/).count()) === 1, "oversized count explains the limit");
  await page.getByLabel("Custom number of questions").fill("");
  await page.getByRole("button", { name: "Clear selection" }).click();
  check(await page.getByRole("button", { name: /Start practice/ }).isDisabled(), "empty selection disables start (calm empty state)");
  await page.screenshot({ path: `${SHOTS}/desktop-practice.png`, fullPage: true });

  const s1 = await runSession(page, { weeksToPick: [1, 2, 3, 6], count: 10, answerRight: (i) => i % 3 !== 0 });
  check(s1.seenWeeks.size >= 3, `session mixes weeks (saw ${[...s1.seenWeeks].sort().join(",")})`);
  check(new Set(s1.order).size === s1.order.length, "no repeated question in a session");
  check(s1.order.every((id) => [1, 2, 3, 6].includes(Number(id.match(/^w(\d+)-/)[1]))), "only selected weeks appear");
  const scoreText = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ");
  check(scoreText.startsWith(`${s1.expectedCorrect} /`), `results score matches expected (${s1.expectedCorrect}) → "${scoreText}"`);
  check((await page.getByText("Questions to look at again").count()) === 1, "results list incorrect questions");
  await page.screenshot({ path: `${SHOTS}/desktop-results.png`, fullPage: true });

  const s2 = await runSession(page, { weeksToPick: [1, 2, 3, 6], count: 10, answerRight: () => true });
  check(s2.order.join() !== s1.order.join(), "second session has a different order");
  check((await page.locator("h1").first().innerText()).replace(/\s+/g, "").startsWith("10/10"), "all-correct session scores 10/10");

  await page.goto(BASE + "/progress");
  check((await page.getByText(/Accuracy/).count()) > 0 && (await page.getByText("Session history").count()) === 1, "progress page reflects real sessions");
  await page.screenshot({ path: `${SHOTS}/desktop-progress.png`, fullPage: true });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bloom:progress:v1")).attempts.length);
  check(stored === 20, `localStorage holds the 20 real attempts (${stored})`);

  // Study mode
  await page.goto(BASE + "/study?week=4");
  check((await page.getByText(/Question 1 of 10/).count()) === 1, "study mode week 4 has 10 questions");
  check((await page.getByText("Correct answer:").count()) === 0, "study hides the answer until asked");
  await page.getByRole("button", { name: /Show me the answer/ }).click();
  check((await page.getByText("No explanation provided in the source PDF.").count()) === 1, "no invented explanation");
  await page.getByRole("button", { name: /Save/ }).click();
  await page.screenshot({ path: `${SHOTS}/desktop-study.png`, fullPage: true });
  await page.goto(BASE + "/review");
  check((await page.getByText(/Bookmarked/).count()) > 0 && (await page.locator("li", { hasText: "Week 4" }).count()) > 0, "bookmark shows in review");

  // Admin
  await page.goto(BASE + "/admin");
  await page.getByText("Extraction status").waitFor();
  check((await page.getByText(/120 questions · 120 verified/).count()) === 1, "admin dashboard shows 120/120 verified");
  await page.screenshot({ path: `${SHOTS}/desktop-admin.png`, fullPage: true });

  // ---------- phone ----------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await phone.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  for (const [name, url] of [["home", "/"], ["weeks", "/weeks"], ["practice", "/practice"], ["study", "/study?week=2"], ["review", "/review"], ["progress", "/progress"], ["admin", "/admin"]]) {
    await mp.goto(BASE + url);
    await mp.waitForTimeout(400);
    await noHorizontalScroll(mp, `phone ${name}`);
    await mp.screenshot({ path: `${SHOTS}/phone-${name}.png`, fullPage: name !== "admin" });
  }
  check(await mp.getByRole("navigation", { name: "Main" }).last().isVisible(), "phone shows bottom navigation");
  await mp.goto(BASE + "/practice?weeks=5");
  await mp.getByRole("button", { name: /Start practice/ }).click();
  await mp.waitForURL("**/practice/session");
  await mp.waitForTimeout(300);
  await noHorizontalScroll(mp, "phone quiz");
  await mp.screenshot({ path: `${SHOTS}/phone-quiz.png` });
  await mp.locator("label").first().click();
  await mp.getByRole("button", { name: "Submit answer" }).click();
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${SHOTS}/phone-quiz-answered.png`, fullPage: true });

  check(errors.length === 0, `no console/page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll browser checks passed.");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
