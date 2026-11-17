// Looks at the page in a real browser: scrolls through it like a visitor (so every beat plays), records console
// errors and any request that leaves localhost, and saves screenshots.
// node scripts/shoot.mjs --url http://localhost:1441/ --width 1440 --scheme light [--reduced] [--browser firefox] --out dir
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return pairs;
  }, []),
);
const url = args.url ?? "http://localhost:1441/";
const width = Number(args.width ?? 1440);
const height = Number(args.height ?? (width < 500 ? 780 : width < 1000 ? 1024 : 900));
const scheme = args.scheme ?? "light";
const out = args.out ?? "shots";
const browserName = args.browser ?? "chrome";
const tag = `${browserName}-${width}-${scheme}${args.reduced ? "-reduced" : ""}`;
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch(
  browserName === "firefox"
    ? { browser: "firefox", executablePath: "/usr/bin/firefox", headless: true }
    : { executablePath: "/usr/bin/chromium", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
);
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: Number(args.dpr ?? 1) });
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: scheme },
  { name: "prefers-reduced-motion", value: args.reduced ? "reduce" : "no-preference" },
]);

const problems = [];
const external = [];
const requests = [];
page.on("console", (message) => {
  if (["error", "warn", "warning"].includes(message.type())) problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("request", (request) => {
  const address = request.url();
  requests.push(address);
  if (!/^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/.test(address)) external.push(address);
});

await page.goto(url, { waitUntil: "load" });
await new Promise((resolve) => setTimeout(resolve, 2500));
await page.screenshot({ path: `${out}/${tag}-first.png` });

// Scroll down in steps like a reader, pausing so each beat's clock runs.
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const sections = [];
for (let y = 0; y < total + height; y += Math.round(height * 0.55)) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await new Promise((resolve) => setTimeout(resolve, Number(args.pause ?? 900)));
}
await new Promise((resolve) => setTimeout(resolve, 1500));

if (args.sections) {
  for (const id of ["top", "compose", "build", "blocks", "teach", "memory", "talk", "share", "format", "yours", "film", "get"]) {
    const found = await page.evaluate((name) => {
      const el = document.getElementById(name) ?? document.querySelector(`[data-owl-zone="${name}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: "start", behavior: "instant" });
      return true;
    }, id);
    if (!found) continue;
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await page.screenshot({ path: `${out}/${tag}-${id}.png` });
    sections.push(id);
  }
}

// The full page, as a visitor sees it: one viewport at a time, top to bottom, stitched (Sloo is wherever he is then).
if (!args["no-full"]) {
  const { execFileSync } = await import("node:child_process");
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const parts = [];
  for (let y = 0, i = 0; y < docHeight; y += height, i++) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await new Promise((resolve) => setTimeout(resolve, Number(args.settle ?? 1300)));
    const actual = await page.evaluate(() => window.scrollY);
    const file = `${out}/.part-${tag}-${String(i).padStart(2, "0")}.png`;
    await page.screenshot({ path: file });
    const keep = Math.min(height, docHeight - y);
    const offset = y - actual;
    execFileSync("magick", [file, "-crop", `${width}x${keep}+0+${offset}`, "+repage", file]);
    parts.push(file);
  }
  execFileSync("magick", [...parts, "-append", `${out}/${tag}-full.png`]);
  execFileSync("rm", parts);
}

const overflow = await page.evaluate(() => {
  const wide = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !el.closest(".owl, .block-code pre, .hop, .visually-hidden, [inert]")) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(r.right)}`);
  }
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth, wide: wide.slice(0, 12) };
});
const report = { tag, problems, external, overflow, requests: requests.length, sections };
writeFileSync(`${out}/${tag}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
