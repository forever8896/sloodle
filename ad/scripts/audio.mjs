// Renders the soundtrack offline in headless Chromium (src/audio.ts) and writes ad/audio/mix-voice.wav and mix-music.wav.
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { URL_BASE } from "./browser.mjs";

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => m.type() === "error" && console.error(m.text()));
await page.goto(new URL("audio.html", URL_BASE).href, { waitUntil: "networkidle0" });
await page.waitForFunction(() => typeof window.__mix === "function", { timeout: 60000 });
// Both mixes share the voice mix's gain, so the music sits at the same level with or without the voice.
let shared;
for (const [name, voice] of [["mix-voice", true], ["mix-music", false]]) {
  const { wav, peak, gain } = await page.evaluate((v, g) => window.__mix(v, g), voice, shared);
  shared ??= gain;
  writeFileSync(new URL(`../audio/${name}.wav`, import.meta.url), Buffer.from(wav, "base64"));
  console.log(name, "raw peak", peak.toFixed(3), "gain", gain.toFixed(3));
}
await browser.close();
