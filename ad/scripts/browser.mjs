// Shared: opens the ad page in headless Chromium at exactly 1920x1080.
import puppeteer from "puppeteer-core";

export const URL_BASE = process.env.AD_URL ?? "http://localhost:1431/";

export async function openAd() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
    headless: true,
    args: ["--window-size=1920,1080", "--hide-scrollbars", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warn") console.error(`console ${msg.type()}:`, msg.text());
  });
  await page.goto(URL_BASE, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof window.__seek === "function");
  const info = await page.evaluate(() => window.__info);
  return { browser, page, info };
}
