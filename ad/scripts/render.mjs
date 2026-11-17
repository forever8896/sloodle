// Renders the ad: N headless Chromium workers each seek and screenshot a contiguous run of frames into an H.264
// segment; the segments are joined and muxed with the soundtrack.
//   node scripts/render.mjs [--out file.mp4] [--workers 4] [--step 1] [--from s] [--to s] [--audio master-voice|master-music|none]
// The audio files are made by scripts/audio.mjs and scripts/master.mjs (already at -16 LUFS, so they are only encoded here).
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openAd } from "./browser.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const out = args.out ?? new URL("../../media/ad/sloodle-ad.mp4", import.meta.url).pathname;
const workers = Number(args.workers ?? 4);
const step = Number(args.step ?? 1);
const audio = args.audio ?? "master-voice";
const tmp = new URL("../.render/", import.meta.url).pathname;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const probe = await openAd();
const { fps, frames: total } = probe.info;
await probe.browser.close();
const first = Math.round(Number(args.from ?? 0) * fps);
const last = Math.min(total, Math.round(Number(args.to ?? total / fps) * fps));
const frames = [];
for (let f = first; f < last; f += step) frames.push(f);
const outFps = fps / step;
const chunk = Math.ceil(frames.length / workers);
const started = Date.now();
let done = 0;

function encoder(file) {
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(outFps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-vf", "scale=out_color_matrix=bt709:out_range=tv", file], { stdio: ["pipe", "inherit", "inherit"] });
  const finished = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))));
  return { ff, finished };
}

async function work(index) {
  const mine = frames.slice(index * chunk, (index + 1) * chunk);
  if (mine.length === 0) return undefined;
  const file = join(tmp, `seg${String(index).padStart(2, "0")}.mp4`);
  const { browser, page } = await openAd();
  const cdp = await page.createCDPSession();
  const { ff, finished } = encoder(file);
  for (const frame of mine) {
    await page.evaluate((f) => window.__seek(f), frame);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false });
    if (!ff.stdin.write(Buffer.from(data, "base64"))) await new Promise((resolve) => ff.stdin.once("drain", resolve));
    done++;
    if (done % 60 === 0) {
      const rate = done / ((Date.now() - started) / 1000);
      process.stdout.write(`\r${done}/${frames.length} frames, ${rate.toFixed(1)} fps, ${((frames.length - done) / rate).toFixed(0)} s left   `);
    }
  }
  ff.stdin.end();
  await finished;
  await browser.close();
  return file;
}

const segments = (await Promise.all([...Array(workers)].map((_, i) => work(i)))).filter(Boolean);
console.log(`\nrendered ${frames.length} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
const list = join(tmp, "list.txt");
writeFileSync(list, segments.map((s) => `file '${s}'`).join("\n"));
mkdirSync(join(out, ".."), { recursive: true });
const audioArgs =
  audio === "none"
    ? ["-an"]
    : ["-ss", String(first / fps), "-i", new URL(`../audio/${audio}.wav`, import.meta.url).pathname, "-map", "0:v", "-map", "1:a", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest"];
await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, ...audioArgs, "-c:v", "copy", "-movflags", "+faststart", out], { stdio: "inherit" });
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`mux ${code}`))));
});
rmSync(tmp, { recursive: true, force: true });
console.log("wrote", out);
