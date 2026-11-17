// Checks voice lines are intelligible by transcribing them with the app's local Whisper model.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const sidecar = join(import.meta.dir, "..", "..", "sidecar", "src");
const transformers = await import(Bun.resolveSync("@huggingface/transformers", sidecar));
transformers.env.cacheDir = join(homedir(), ".local", "share", "sloodle", "models");
const asr = await transformers.pipeline("automatic-speech-recognition", "onnx-community/whisper-base", { dtype: "q8" });
for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const rate = buf.readUInt32LE(24);
  const n = (buf.length - 44) / 2;
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(44 + i * 2) / 32768;
  // Whisper wants 16 kHz: simple linear resample.
  const out = new Float32Array(Math.floor((n * 16000) / rate));
  for (let i = 0; i < out.length; i++) {
    const x = (i * rate) / 16000;
    const j = Math.floor(x);
    out[i] = (pcm[j] ?? 0) * (1 - (x - j)) + (pcm[j + 1] ?? 0) * (x - j);
  }
  const result = await asr(out);
  console.log(file.split("/").pop(), "->", JSON.stringify(result.text));
}
