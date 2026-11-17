import { chunkSpeech } from "../sidecar/src/speech-text";
import { demo, engineUrl, rpc } from "./api";

const RATE = 16000;

interface Recording {
  /** Stops the microphone and returns what was said, or "" if nothing was heard. */
  stop: () => Promise<string>;
  cancel: () => void;
}

async function startRecording(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This window cannot use the microphone.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.start();

  const release = () => stream.getTracks().forEach((track) => track.stop());

  return {
    cancel: () => {
      recorder.stop();
      release();
    },
    stop: async () => {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      release();

      const encoded = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(encoded);
      void context.close();

      // Whisper wants 16 kHz mono.
      const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const samples = (await offline.startRendering()).getChannelData(0);

      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i]!)) * 32767;
      return rpc<string>("voice.transcribe", { pcm: toBase64(new Uint8Array(pcm.buffer)) });
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---------------------------------------------------------------------------------------------------------------
// Speech output.
//
// Text is cut into chunks (sentences; the first few of an utterance are cut at clauses so speech starts sooner) by
// the same code the engine uses (sidecar/src/speech-text.ts). Each chunk is synthesized by the engine over HTTP as
// raw samples, a couple of chunks ahead of playback, and scheduled back to back on one AudioContext so there are no
// gaps. Utterances can grow while a reply streams in. stop() cancels everything at once, including requests the
// engine has not started, and nothing from before a stop() can play after it.
//
// API for the rest of the interface (all subscribe functions return an unsubscribe function):
//   speaker.stream({ key })        start an utterance that grows: handle.update(fullText), handle.finish(fullText?)
//   speaker.say(text, { key })     speak a finished text (queued after whatever is already being said)
//   speaker.stop()                 silence now and drop everything queued
//   speaker.pause() / resume()     hold and continue (the voice keeps preparing what comes next)
//   speaker.setSpeed(n)            0.5 to 2; applies from the next chunk, prepared chunks are redone
//   speaker.warm()                 ask the engine to load the voice model now
//   speaker.onState(cb)            "idle" | "preparing" | "speaking" | "paused"
//   speaker.onSpeaking(cb)         true while audio is playing (or paused mid-utterance)
//   speaker.onProgress(cb)         the chunk being heard: { key, index, start, end, text }, or undefined
//   speaker.onLevel(cb)            output loudness 0..1, about 60 times a second while speaking, then 0 once
//   highlightSpoken(el, text, restart) mark `text` inside `element` with the ::highlight(sloo-speaking) style
// ---------------------------------------------------------------------------------------------------------------

type SpeechState = "idle" | "preparing" | "speaking" | "paused";

/** What is being heard right now. `start`/`end` index the text given to say()/update() for that utterance. */
interface SpeechProgress {
  key?: string;
  /** Position of this chunk in its utterance, from 0. */
  index: number;
  start: number;
  end: number;
  /** The words being spoken (markdown removed). */
  text: string;
}

interface Utterance {
  /** Give the whole text so far; complete sentences after what was already taken are queued. */
  update(text: string): void;
  /** No more text is coming. With `text`, it is the final version (anything not yet spoken is queued). */
  finish(text?: string): void;
  /** Change the key reported in progress events (for example once a streaming reply becomes a transcript item). */
  setKey(key: string): void;
  readonly key?: string;
}

interface Chunk {
  utterance: UtteranceImpl;
  index: number;
  start: number;
  end: number;
  speech: string;
  /** A sentence end (longer pause after it) rather than a clause cut. */
  sentence: boolean;
  status: "new" | "loading" | "ready" | "scheduled" | "done";
  samples?: Float32Array;
  abort?: AbortController;
  source?: AudioBufferSourceNode;
  at?: number;
  until?: number;
}

const LOOKAHEAD_SECONDS = 6;
/** The first chunks of an utterance are cut at clauses so playback starts early and never runs dry. */
const OPENING_CLAUSES = 3;
const MAX_IN_FLIGHT = 2;
const PAUSE_AFTER_SENTENCE = 0.14;
const PAUSE_AFTER_CLAUSE = 0.04;

class UtteranceImpl implements Utterance {
  text = "";
  consumed = 0;
  finished = false;
  chunks: Chunk[] = [];
  constructor(
    private owner: Speaker,
    readonly generation: number,
    public key?: string,
  ) {}

  update(text: string): void {
    if (this.finished || this.generation !== this.owner.generation) return;
    this.text = text;
    this.take(false);
  }

  finish(text?: string): void {
    if (this.finished || this.generation !== this.owner.generation) return;
    if (text !== undefined) {
      // The final text normally extends what streamed in. If it differs, carry on from the same place.
      this.text = text;
      this.consumed = Math.min(this.consumed, text.length);
    }
    this.take(true);
    this.finished = true;
    this.owner.pump();
  }

  setKey(key: string): void {
    this.key = key;
    this.owner.reannounce(this);
  }

  private take(final: boolean): void {
    const { chunks, consumed } = chunkSpeech(this.text, this.consumed, { final, clauses: OPENING_CLAUSES - this.chunks.length });
    this.consumed = consumed;
    for (const chunk of chunks) {
      const sentence = !/[,—–]$/.test(chunk.speech);
      this.chunks.push({ ...chunk, utterance: this, index: this.chunks.length, sentence, status: "new" });
    }
    if (chunks.length) this.owner.pump();
  }
}

class Speaker {
  generation = 0;
  private queue: UtteranceImpl[] = [];
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private nextAt = 0;
  private speed = 1;
  private state: SpeechState = "idle";
  private progress?: SpeechProgress;
  private level = 0;
  private frame?: number;
  private stateListeners = new Set<(state: SpeechState) => void>();
  private speakingListeners = new Set<(speaking: boolean) => void>();
  private progressListeners = new Set<(progress: SpeechProgress | undefined) => void>();
  private levelListeners = new Set<(level: number) => void>();

  /** Starts an utterance whose text arrives over time (a streaming reply). */
  stream(options: { key?: string } = {}): Utterance {
    const utterance = new UtteranceImpl(this, this.generation, options.key);
    this.queue.push(utterance);
    return utterance;
  }

  /** Speaks a finished text after anything already queued. */
  say(text: string, options: { key?: string } = {}): Utterance {
    const utterance = this.stream(options);
    utterance.finish(text);
    return utterance;
  }

  stop(): void {
    this.generation += 1;
    for (const utterance of this.queue) {
      for (const chunk of utterance.chunks) {
        chunk.abort?.abort();
        try {
          chunk.source?.stop();
        } catch {
          // Never started.
        }
        chunk.source?.disconnect();
      }
    }
    this.queue = [];
    this.nextAt = 0;
    if (this.context?.state === "suspended") void this.context.resume();
    this.update();
  }

  pause(): void {
    if (this.state !== "speaking" && this.state !== "preparing") return;
    void this.context?.suspend();
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    void this.context?.resume();
    this.state = "speaking";
    this.update();
  }

  getState(): SpeechState {
    return this.state;
  }

  getSpeed(): number {
    return this.speed;
  }

  /** Changes the speaking rate (0.5 to 2). Audio not yet heard is prepared again at the new rate. */
  setSpeed(speed: number): void {
    const next = Math.min(2, Math.max(0.5, speed));
    if (next === this.speed) return;
    this.speed = next;
    const now = this.context?.currentTime ?? 0;
    let resumeAt: number | undefined;
    for (const utterance of this.queue) {
      for (const chunk of utterance.chunks) {
        const future = chunk.status === "loading" || chunk.status === "ready" || (chunk.status === "scheduled" && (chunk.at ?? 0) > now);
        if (!future) continue;
        if (chunk.status === "scheduled") {
          resumeAt ??= chunk.at;
          chunk.source!.onended = null;
          chunk.source!.stop();
          chunk.source!.disconnect();
        }
        chunk.abort?.abort();
        Object.assign(chunk, { status: "new", samples: undefined, abort: undefined, source: undefined, at: undefined, until: undefined });
      }
    }
    if (resumeAt !== undefined) this.nextAt = resumeAt;
    this.pump();
  }

  /** Loads the voice model in the engine ahead of time. */
  warm(): Promise<void> {
    return rpc<void>("voice.warm");
  }

  onState(listener: (state: SpeechState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onSpeaking(listener: (speaking: boolean) => void): () => void {
    this.speakingListeners.add(listener);
    return () => this.speakingListeners.delete(listener);
  }

  onProgress(listener: (progress: SpeechProgress | undefined) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onLevel(listener: (level: number) => void): () => void {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  /** Requests and schedules whatever can go next. Called whenever anything changes. */
  pump(): void {
    const context = this.audio();
    const now = context.currentTime;
    let inFlight = 0;
    let buffered = Math.max(0, this.nextAt - now);
    let blocked = false; // An earlier chunk is not ready yet, so later ones cannot be scheduled.

    walk: for (const utterance of this.queue) {
      for (const chunk of utterance.chunks) {
        if (chunk.status === "loading") {
          inFlight += 1;
          blocked = true;
        } else if (chunk.status === "new") {
          if (inFlight >= MAX_IN_FLIGHT || buffered > LOOKAHEAD_SECONDS) break walk;
          this.request(chunk);
          inFlight += 1;
          blocked = true;
        } else if (chunk.status === "ready" && !blocked) {
          this.schedule(chunk);
          buffered = Math.max(0, this.nextAt - now);
        }
      }
      // A reply still streaming in: what comes after it has to wait for its end.
      if (!utterance.finished) break;
    }
    this.update();
  }

  /** The progress event for this utterance's current chunk is sent again with its new key. */
  reannounce(utterance: UtteranceImpl): void {
    if (this.progress && this.current()?.utterance === utterance) {
      this.progress = undefined;
      this.update();
    }
  }

  private audio(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.context.destination);
    }
    if (this.context.state === "suspended" && this.state !== "paused") void this.context.resume();
    return this.context;
  }

  private request(chunk: Chunk): void {
    const generation = this.generation;
    const abort = new AbortController();
    chunk.abort = abort;
    chunk.status = "loading";
    void fetchSpeech(chunk.speech, this.speed, abort.signal).then(
      (samples) => {
        if (generation !== this.generation || chunk.abort !== abort) return;
        chunk.samples = samples;
        chunk.status = "ready";
        this.pump();
      },
      () => {
        if (generation !== this.generation || chunk.abort !== abort) return;
        chunk.status = "done"; // Skip what could not be spoken rather than stall.
        this.pump();
      },
    );
  }

  private schedule(chunk: Chunk): void {
    const context = this.context!;
    const samples = chunk.samples!;
    chunk.samples = undefined;
    if (samples.length === 0) {
      chunk.status = "done";
      return;
    }
    const buffer = context.createBuffer(1, samples.length, SPEECH_RATE);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser!);
    const at = Math.max(context.currentTime + 0.03, this.nextAt);
    source.start(at);
    chunk.source = source;
    chunk.at = at;
    chunk.until = at + buffer.duration;
    chunk.status = "scheduled";
    this.nextAt = chunk.until + (chunk.sentence ? PAUSE_AFTER_SENTENCE : PAUSE_AFTER_CLAUSE);
    source.onended = () => {
      chunk.status = "done";
      source.disconnect();
      chunk.source = undefined;
      this.prune();
      this.pump();
    };
  }

  private prune(): void {
    while (this.queue[0]?.finished && this.queue[0].chunks.every((c) => c.status === "done")) this.queue.shift();
  }

  private current(): Chunk | undefined {
    const now = this.context?.currentTime ?? 0;
    for (const utterance of this.queue) for (const chunk of utterance.chunks) if (chunk.status === "scheduled" && chunk.at! <= now && now < chunk.until!) return chunk;
    return undefined;
  }

  /** Recomputes state and progress, and runs the frame loop while there is audio. */
  private update(): void {
    this.prune();
    const pending = this.queue.some((u) => !u.finished || u.chunks.some((c) => c.status !== "done"));
    const playing = this.queue.some((u) => u.chunks.some((c) => c.status === "scheduled"));
    if (this.state !== "paused" || !pending) this.setState(playing ? "speaking" : pending && this.queue.some((u) => u.chunks.length) ? "preparing" : "idle");

    const chunk = this.current();
    // Between two chunks keep showing the last one, so highlighting does not flicker in the pauses.
    if (chunk) this.setProgress({ key: chunk.utterance.key, index: chunk.index, start: chunk.start, end: chunk.end, text: chunk.speech });
    else if (!playing) this.setProgress(undefined);

    if (this.state !== "idle" && this.frame === undefined) this.frame = requestAnimationFrame(this.tick);
    if (this.state === "idle") this.setLevel(0);
  }

  private tick = (): void => {
    this.frame = undefined;
    if (this.state === "idle") {
      this.setLevel(0);
      return;
    }
    const analyser = this.analyser!;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    const rms = Math.sqrt(sum / data.length);
    // Speech sits around 0.02 to 0.2 RMS. Rise fast, fall a little slower, so a mouth does not jitter.
    const target = this.state === "speaking" ? Math.min(1, rms * 6) : 0;
    this.setLevel(target > this.level ? target : this.level * 0.8 + target * 0.2);
    this.update();
  };

  private setLevel(level: number): void {
    const rounded = level < 0.01 ? 0 : level;
    if (rounded === 0 && this.level === 0) return;
    this.level = rounded;
    for (const listener of this.levelListeners) listener(rounded);
  }

  private setState(state: SpeechState): void {
    if (state === this.state) return;
    const wasSpeaking = this.state === "speaking" || this.state === "paused";
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
    const speaking = state === "speaking" || state === "paused";
    if (speaking !== wasSpeaking) for (const listener of this.speakingListeners) listener(speaking);
  }

  private setProgress(progress: SpeechProgress | undefined): void {
    const same =
      progress === this.progress ||
      (progress && this.progress && progress.key === this.progress.key && progress.index === this.progress.index && progress.start === this.progress.start);
    if (same) return;
    this.progress = progress;
    for (const listener of this.progressListeners) listener(progress);
  }
}

const SPEECH_RATE = 24000;

async function fetchSpeech(text: string, speed: number, signal: AbortSignal): Promise<Float32Array> {
  if (demo) throw new Error("No engine in the demo.");
  // text/plain keeps this a simple request, so the browser sends no CORS preflight.
  const response = await fetch(await engineUrl("/speech"), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ text, speed }),
    signal,
  });
  if (!response.ok) throw new Error(await response.text());
  return new Float32Array(await response.arrayBuffer());
}

const HIGHLIGHT = "sloo-speaking";

/**
 * Highlights the words being spoken inside `element` using the CSS Custom Highlight API (style it with
 * `::highlight(sloo-speaking)`). The text is matched ignoring whitespace, searching forward from where the previous
 * match in the same element started (or from the top with `restart`), so it survives the element re-rendering.
 * Call with no text to clear. Does nothing where the API is missing.
 */
function highlightSpoken(element: Element | null | undefined, text?: string, restart = false): void {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> })?.highlights;
  const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !Highlight) return;
  registry.delete(HIGHLIGHT);
  if (!element || !text) return;

  // Build the element's visible text without whitespace, remembering where each character came from.
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let flat = "";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data;
    for (let i = 0; i < value.length; i++) {
      if (/\s/.test(value[i]!)) continue;
      flat += value[i];
      nodes.push(node);
      offsets.push(i);
    }
  }
  const needle = text.replace(/\s+/g, "");
  if (!needle) return;
  const previous = restart ? 0 : (lastMatch.get(element) ?? 0);
  let at = flat.indexOf(needle, previous);
  if (at < 0) at = flat.indexOf(needle);
  if (at < 0) return;
  lastMatch.set(element, at);
  const range = document.createRange();
  range.setStart(nodes[at]!, offsets[at]!);
  const last = at + needle.length - 1;
  range.setEnd(nodes[last]!, offsets[last]! + 1);
  registry.set(HIGHLIGHT, new Highlight(range));
}

const lastMatch = new WeakMap<Element, number>();

const speaker = new Speaker();

export { highlightSpoken, speaker, startRecording };
export type { Recording, SpeechProgress, SpeechState, Utterance };
