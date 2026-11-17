// Operates every live part of the page in a real browser and checks the result: the composer, the flashcard, the
// code sandbox, the ordering (by keyboard), the blanks, the dials, the proposal, the course export, the video, the
// theme. Fails on console errors or on any request that leaves the page's own origin.
// node scripts/verify.mjs [--url http://localhost:1441/] [--browser firefox] [--out dir]
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return pairs;
  }, []),
);
const url = args.url ?? "http://localhost:1441/";
const out = args.out ?? "verify-shots";
const firefox = args.browser === "firefox";
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch(
  firefox
    ? { browser: "firefox", executablePath: "/usr/bin/firefox", headless: true }
    : { executablePath: "/usr/bin/chromium", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
);
const page = await browser.newPage();
await page.setViewport({ width: Number(args.width ?? 1440), height: 900 });
const origin = new URL(url).origin;
const problems = [];
const external = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(e.message));
page.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith(origin) && !/^(data|blob|about):/.test(u)) external.push(u);
});
if (!firefox) {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: out }).catch(() => undefined);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const scrollTo = async (selector) => {
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center", behavior: "instant" }), selector);
  await wait(1200);
};
const clickText = async (scope, text) =>
  page.evaluate(
    (s, t) => {
      const button = [...document.querySelectorAll(`${s} button`)].find((b) => b.textContent?.trim() === t && !b.closest("[inert]"));
      button?.click();
      return !!button;
    },
    scope,
    text,
  );
const textOf = (selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", selector);

await page.goto(url, { waitUntil: "load" });
await page.waitForSelector(".compose", { timeout: 20000 });
await wait(2500);

// Sloo is playing a clip (or showing his still where video is not possible).
const sloo = await page.evaluate(() => {
  const el = document.querySelector(".owl .sloo");
  return { kind: el?.getAttribute("data-kind"), ready: el?.hasAttribute("data-ready"), canvas: !!el?.querySelector("canvas"), video: !!el?.querySelector("video") };
});
check("Sloo plays in the hero", sloo.kind === "video" || sloo.kind === "still", JSON.stringify(sloo));

// Composer
await scrollTo(".compose");
await wait(7500);
const scripted = await page.$eval(".site-composer textarea", (t) => t.value);
check("composer types the ad's subjects", scripted === "Reading sheet music", scripted);
await page.click(".site-composer textarea", { clickCount: 3 });
await page.keyboard.press("Backspace");
await page.type(".site-composer textarea", "Knife skills");
await page.click(".site-composer button[type=submit]");
await wait(400);
check("composer takes a goal", (await textOf(".compose-note")).includes("Knife skills"));

// Flashcard
await scrollTo(".c-flash");
await wait(2500);
check("flashcard flips", await clickText(".c-flash", "Answer in your head, then flip"));
await wait(1200);
const back = await page.evaluate(() => [...document.querySelectorAll(".c-flash .flip-face")].find((f) => !f.inert)?.textContent ?? "");
check("flashcard shows the back", back.includes("FACE"), back.slice(0, 60));
await clickText(".c-flash", "GoodRecalled it");
await page.evaluate(() => [...document.querySelectorAll(".c-flash .grade")].find((b) => b.textContent?.includes("Good") && !b.closest("[inert]"))?.click());
await wait(800);
check("flashcard takes a rating", (await textOf(".c-flash")).includes("You rated it: Good"));
await page.screenshot({ path: `${out}/flashcard.png` });

// Code
await scrollTo(".c-code");
await wait(2500);
const output = await textOf(".c-code .block-code-output");
check("code ran in the sandbox", output.includes("Line 5: F") && output.includes("Finished"), output.replace(/\s+/g, " ").slice(0, 80));
await clickText(".c-code", "Run again");
await wait(1500);
check("code runs again", (await textOf(".c-code .block-code-output")).includes("Line 1: E"));

// Ordering, by keyboard: pick up each item and move it to its place.
await scrollTo(".c-order");
const target = ["E, on the bottom line", "F, in the bottom space", "G, on the second line", "A, in the second space", "B, on the middle line"];
for (let slot = 0; slot < target.length; slot++) {
  const from = await page.evaluate((t) => [...document.querySelectorAll(".c-order .reserve-live .block-list > li")].findIndex((li) => li.textContent?.includes(t)), target[slot]);
  if (from === slot) continue;
  await page.evaluate((i) => {
    const li = document.querySelectorAll(".c-order .reserve-live .block-list > li")[i];
    (li.matches("[tabindex]") ? li : li.querySelector("[tabindex], button") ?? li).focus();
  }, from);
  await page.keyboard.press(" ");
  for (let k = 0; k < from - slot; k++) await page.keyboard.press("ArrowUp");
  await page.keyboard.press(" ");
  await wait(250);
}
const order = await page.evaluate(() => [...document.querySelectorAll(".c-order .reserve-live .block-list > li")].map((li) => li.textContent?.replace(/[^A-Za-z, ]/g, "").trim().slice(0, 1)));
check("ordering reorders by keyboard", order.join("") === "EFGAB", order.join(","));
await clickText(".c-order", "Check order");
await wait(900);
const verdict = await textOf(".c-order .reserve-live .verdict");
check("ordering is graded", /Correct|Partly|Not yet/.test(verdict), verdict);
await page.screenshot({ path: `${out}/ordering.png` });

// Blanks
await scrollTo(".lesson .float-card");
await wait(2500);
const fields = await page.$$(".lesson .reserve-live .block-blank input");
await fields[0]?.type("E");
await fields[1]?.type("D");
await clickText(".lesson .reserve-live", "Check");
await wait(2400);
check("blanks graded correct", (await textOf(".lesson .reserve-live .verdict")).includes("Correct"));
check("Sloo replies", (await textOf(".reply-slot")).includes("without the mnemonic"));
await page.screenshot({ path: `${out}/blanks.png` });

// Dials
await scrollTo(".dials");
await wait(1800);
await page.evaluate(() => [...document.querySelectorAll(".dials [data-slot='segmented-control-item']")].find((b) => b.textContent === "thorough")?.click());
await wait(400);
const dial = await page.evaluate(() => document.querySelector(".dials [data-slot='segmented-control-item'][data-checked], .dials [data-slot='segmented-control-item'][aria-checked='true'], .dials [data-slot='segmented-control-item'][data-selected]")?.textContent);
check("dial turns", dial === "thorough", String(dial));

// Proposal
await scrollTo(".talk-card");
await wait(1200);
await clickText(".talk-card", "Accept change");
await wait(1200);
check("proposal accepted", (await textOf(".talk-card")).includes("Accepted"));

// Export: the real course file
await scrollTo(".share-course");
await wait(3500);
await clickText(".share-course", "Share this course as a file");
await wait(1200);
check("course exports to one file", (await textOf(".share-course")).includes("read-treble-clef-and-play-along.sloodle.json"));
await page.screenshot({ path: `${out}/share.png` });

// Video
await scrollTo(".film-player");
await page.click(".film-player .play");
// Headless browsers have no audio output, which stalls a playing video's clock; muting lets it run here.
await page.$eval(".film-player video", (v) => (v.muted = true));
await wait(4000);
const state = await page.$eval(".film-player video", (v) => ({ time: v.currentTime, paused: v.paused, ready: v.readyState, error: v.error?.code }));
check("the ad plays", state.time > 0.5, JSON.stringify(state));
await page.$eval(".film-player video", (v) => v.pause());

// Theme
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.evaluate(() => [...document.querySelectorAll(".nav [data-slot='toggle']")].find((b) => b.textContent === "Dark")?.click());
await wait(400);
check("dark mode switch", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
await page.screenshot({ path: `${out}/dark-hero.png` });

check("no console errors", problems.length === 0, problems.slice(0, 3).join(" | "));
check("no request leaves the site", external.length === 0, external.slice(0, 3).join(" "));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
