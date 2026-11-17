// Renders single frames to PNG: node scripts/still.mjs <out-dir> <seconds...>
import { mkdirSync } from "node:fs";
import { openAd } from "./browser.mjs";

const [out, ...times] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { browser, page, info } = await openAd();
for (const t of times) {
  const frame = Math.round(Number(t) * info.fps);
  await page.evaluate((f) => window.__seek(f), frame);
  await page.screenshot({ path: `${out}/t${Number(t).toFixed(2).padStart(6, "0")}.png` });
}
await browser.close();
