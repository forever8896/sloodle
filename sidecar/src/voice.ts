import { join } from "node:path";
import { speakable, speechChunks } from "./speech-text";
import { dataDir } from "./store";

// Both models run on this computer. They download once into the data folder on first use.
const WHISPER_MODEL = process.env.SLOODLE_WHISPER_MODEL ?? "onnx-community/whisper-base";
const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type Transcriber = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
interface Speaker {
  generate(text: string, options: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

type Dtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
/**
 * Measured on a Ryzen 5 7535U (6 cores), seconds of compute per second of speech: q8 0.85, fp32 0.42, fp16 0.34.
 * q8 is barely faster than real time, so replies stuttered; fp16 is both faster and a smaller download.
 */
const TTS_DTYPE = (process.env.SLOODLE_TTS_DTYPE as Dtype | undefined) ?? "fp16";

let transcriber: Promise<Transcriber> | undefined;
let speaker: Promise<Speaker> | undefined;

async function configureCache(): Promise<typeof import("@huggingface/transformers")> {
  const transformers = await import("@huggingface/transformers");
  transformers.env.cacheDir = join(dataDir, "models");
  return transformers;
}

function loadTranscriber(): Promise<Transcriber> {
  transcriber ??= configureCache().then(
    ({ pipeline }) => pipeline("automatic-speech-recognition", WHISPER_MODEL, { dtype: "q8" }) as unknown as Promise<Transcriber>,
  );
  transcriber.catch(() => (transcriber = undefined));
  return transcriber;
}

function loadSpeaker(): Promise<Speaker> {
  speaker ??= configureCache().then(async () => {
    const { KokoroTTS } = await import("kokoro-js");
    return (await KokoroTTS.from_pretrained(TTS_MODEL, { dtype: TTS_DTYPE, device: "cpu" })) as unknown as Speaker;
  });
  speaker.catch(() => (speaker = undefined));
  return speaker;
}

/** `pcm` is 16 kHz mono, 16-bit little-endian, base64. */
export async function transcribe(pcm: string): Promise<string> {
  const bytes = Buffer.from(pcm, "base64");
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const audio = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) audio[i] = samples[i]! / 32768;
  if (audio.length < 16000 * 0.3) return "";

  const run = await loadTranscriber();
  const result = await run(audio, { chunk_length_s: 30, stride_length_s: 5 });
  const text = (Array.isArray(result) ? result.map((r) => r.text).join(" ") : result.text).trim();
  // Whisper invents these on silence.
  return /^\[?(blank_audio|silence|music)\]?$/i.test(text.replace(/[\s.]/g, "")) ? "" : text;
}

export { speakable };

/** Kokoro speaks at 24 kHz mono. */
export const SAMPLE_RATE = 24000;

export interface SpeechOptions {
  voice: string;
  speed: number;
  /** Aborting drops the request if it has not started; a run in progress finishes and is thrown away. */
  signal?: AbortSignal;
  /** Bulk work (audio lessons) waits behind anything the learner is listening to now. */
  background?: boolean;
}

interface Job extends SpeechOptions {
  text: string;
  resolve: (pcm: Float32Array) => void;
  reject: (error: Error) => void;
}

// One model run at a time: ONNX already spreads a run over every core, so parallel runs only slow each other down
// and delay the sentence that is needed next. Requests are served in order, live ones before background ones, and
// cancelled ones are skipped.
const jobs: Job[] = [];
let running = false;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      if (job.signal?.aborted) {
        job.reject(new DOMException("Speech was cancelled.", "AbortError"));
        continue;
      }
      try {
        const tts = await loadSpeaker();
        const audio = await tts.generate(job.text, { voice: job.voice, speed: job.speed });
        job.resolve(audio.audio);
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  } finally {
    running = false;
  }
}

/** Speaks `text` (markdown is cleaned first) and returns 24 kHz mono samples. Requests run one at a time, in order. */
export function synthesizePcm(text: string, options: SpeechOptions): Promise<Float32Array> {
  const clean = speakable(text);
  if (!/[\p{L}\p{N}]/u.test(clean)) return Promise.resolve(new Float32Array(0));
  return new Promise((resolve, reject) => {
    const job: Job = { ...options, text: clean, resolve, reject };
    const firstBackground = job.background ? -1 : jobs.findIndex((other) => other.background);
    if (firstBackground < 0) jobs.push(job);
    else jobs.splice(firstBackground, 0, job);
    options.signal?.addEventListener(
      "abort",
      () => {
        const index = jobs.indexOf(job);
        if (index >= 0) {
          jobs.splice(index, 1);
          reject(new DOMException("Speech was cancelled.", "AbortError"));
        }
      },
      { once: true },
    );
    void drain();
  });
}

let warming: Promise<void> | undefined;

/**
 * Loads the voice model and runs it once, so the first real sentence does not pay for loading or the first-run
 * setup. Safe to call often; failures are forgotten so a later call retries.
 */
export function warmSpeaker(voice = "af_heart"): Promise<void> {
  warming ??= synthesizePcm("Hi.", { voice, speed: 1 }).then(() => undefined);
  warming.catch(() => (warming = undefined));
  return warming;
}

/** A 32-bit float mono WAV around the samples. */
export function wav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), 44);
  return out;
}

export async function synthesize(text: string, voice: string, speed: number): Promise<Uint8Array> {
  return wav(await synthesizePcm(text, { voice, speed }));
}

/** Long passages are spoken piece by piece (sentences, long ones split at clauses) and joined into one WAV. */
export async function synthesizeLong(text: string, voice: string, speed: number): Promise<Uint8Array> {
  const chunks = speechChunks(text);
  if (chunks.length === 0) throw new Error("There was nothing to read aloud.");
  // Queue every piece at once so the model never waits between them.
  const parts = await Promise.all(chunks.map((chunk) => synthesizePcm(chunk.speech, { voice, speed, background: true })));
  const joined = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return wav(joined);
}

export const voices = [
  { id: "af_heart", label: "Heart (American, warm)" },
  { id: "af_bella", label: "Bella (American, bright)" },
  { id: "am_michael", label: "Michael (American)" },
  { id: "am_fenrir", label: "Fenrir (American, deep)" },
  { id: "bf_emma", label: "Emma (British)" },
  { id: "bm_george", label: "George (British)" },
];
