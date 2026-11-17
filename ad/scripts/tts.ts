// Speaks the ad's voice lines with Kokoro, the same local model and voices the app uses (sidecar/src/voice.ts).
// Run with bun from the repo: bun ad/scripts/tts.ts. Writes 24 kHz mono WAVs to ad/audio/.
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Resolved from the sidecar, so this uses its single pinned copy of transformers (see AGENTS.md).
const sidecar = join(import.meta.dir, "..", "..", "sidecar", "src");
const transformers = await import(Bun.resolveSync("@huggingface/transformers", sidecar));
const { KokoroTTS } = await import(Bun.resolveSync("kokoro-js", sidecar));

transformers.env.cacheDir = join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "sloodle", "models");

const lines: { name: string; text: string; voice: string; speed: number }[] = JSON.parse(process.argv[2] ?? "[]");
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp16", device: "cpu" });

function wav(samples: Float32Array, rate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

for (const line of lines) {
  const audio = await tts.generate(line.text, { voice: line.voice as never, speed: line.speed });
  const out = join(import.meta.dir, "..", "audio", `${line.name}.wav`);
  writeFileSync(out, wav(audio.audio, audio.sampling_rate));
  console.log(line.name, (audio.audio.length / audio.sampling_rate).toFixed(2), "s", out);
}
