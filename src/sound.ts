// Sloodle's sound layer: one small synthesized instrument, played through Web Audio.
//
// Every sound is built from the same few voices (a soft FM "tine", a darker "mallet", a breath of filtered noise and a
// warm pad), tuned to D major pentatonic, and sent through one shared room. That keeps the app sounding like a single
// instrument. Nothing is loaded from disk or the network.

import { useEffect, useRef } from "react";
import type { MasteryStatus, ReviewGrade } from "./api";
import { speaker } from "./voice";

/* ------------------------------------------------------------------------------------------------------------------ */
/* The palette                                                                                                        */

type SoundName =
  | "open"
  | "navigate"
  | "press"
  | "hover"
  | "dialogOpen"
  | "dialogClose"
  | "send"
  | "thinking"
  | "reply"
  | "activity"
  | "question"
  | "select"
  | "hint"
  | "correct"
  | "partial"
  | "incorrect"
  | "confidence"
  | "learning"
  | "practiced"
  | "mastered"
  | "flip"
  | "gradeAgain"
  | "gradeHard"
  | "gradeGood"
  | "gradeEasy"
  | "reviewDone"
  | "complete"
  | "courseCreated"
  | "courseReady"
  | "courseComplete"
  | "import"
  | "export"
  | "micOn"
  | "micOff"
  | "error";

interface PlayOptions {
  /** Which option was picked (select) or how sure the learner is, 1 to 3 (confidence). */
  index?: number;
  /** Consecutive correct answers; correct climbs the scale with it. Tracked automatically when left out. */
  streak?: number;
  /** Seconds to wait before playing. */
  delay?: number;
  /** Forces the reduced-motion version on or off (the audition page); otherwise it follows the system setting. */
  gentle?: boolean;
}

type Tier = "tick" | "small" | "medium" | "large" | "flourish";

interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  send: AudioNode;
  /** Reduced motion: flourishes keep their shape but lose their cascades. */
  gentle: boolean;
  rand: () => number;
  /** Shared detune for the whole sound, so intervals stay pure while repeats differ. */
  cents: number;
}

interface SoundSpec {
  label: string;
  tier: Tier;
  /** Minimum seconds between two plays of this sound. */
  gap?: number;
  play: (v: Voice, t: number, options: PlayOptions) => number;
}

const D4 = 293.66;
const PENTATONIC = [0, 2, 4, 7, 9];

/** Note n of D major pentatonic: 0 is D4, 5 is D5, -1 is B3. */
function pent(n: number): number {
  const octave = Math.floor(n / 5);
  const step = PENTATONIC[((n % 5) + 5) % 5]!;
  return D4 * 2 ** (octave + step / 12);
}

/** Semitones from D4, for the few notes outside the pentatonic (the G of a IV chord). */
function semi(n: number): number {
  return D4 * 2 ** (n / 12);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Voices                                                                                                             */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Pans a note a little by pitch (higher notes drift right) and a little at random. */
function place(v: Voice, freq: number, node: AudioNode, wet: number): void {
  const pan = v.ctx.createStereoPanner();
  pan.pan.value = Math.max(-0.6, Math.min(0.6, Math.log2(freq / 600) * 0.22 + (v.rand() - 0.5) * 0.2));
  node.connect(pan);
  pan.connect(v.out);
  if (wet > 0) {
    const send = v.ctx.createGain();
    send.gain.value = wet;
    pan.connect(send);
    send.connect(v.send);
  }
}

interface ToneOptions {
  decay?: number;
  /** FM depth at the strike; more is brighter. */
  bright?: number;
  /** Lowpass the note for a felt, woody sound. */
  dark?: boolean;
  /** Start this ratio away from the pitch and slide onto it. */
  glide?: number;
  wet?: number;
}

/** A soft FM bell with a short inharmonic glint: the kalimba-like voice most notes use. */
function tine(v: Voice, at: number, freq: number, gain: number, o: ToneOptions = {}): number {
  const { ctx } = v;
  const decay = o.decay ?? 0.9;
  const index = o.bright ?? 1.1;
  const detune = v.cents + (v.rand() - 0.5) * 6;
  const end = at + decay;

  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  carrier.detune.value = detune;
  modulator.detune.value = detune;
  if (o.glide) {
    carrier.frequency.setValueAtTime(freq * o.glide, at);
    carrier.frequency.exponentialRampToValueAtTime(freq, at + 0.06);
    modulator.frequency.setValueAtTime(freq * o.glide, at);
    modulator.frequency.exponentialRampToValueAtTime(freq, at + 0.06);
  } else {
    carrier.frequency.value = freq;
    modulator.frequency.value = freq;
  }
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(freq * index, at);
  depth.gain.exponentialRampToValueAtTime(freq * index * 0.04 + 0.01, at + Math.min(0.5, decay * 0.45));
  modulator.connect(depth);
  depth.connect(carrier.frequency);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.004);
  amp.gain.exponentialRampToValueAtTime(gain * 0.0005, end);
  amp.gain.linearRampToValueAtTime(0, end + 0.02);
  carrier.connect(amp);

  const glint = ctx.createOscillator();
  glint.frequency.value = freq * (o.dark ? 3.93 : 5.4);
  glint.detune.value = detune;
  const glintAmp = ctx.createGain();
  glintAmp.gain.setValueAtTime(0, at);
  glintAmp.gain.linearRampToValueAtTime(gain * (o.dark ? 0.12 : 0.16), at + 0.002);
  glintAmp.gain.exponentialRampToValueAtTime(gain * 0.0005, at + 0.09);
  glintAmp.gain.linearRampToValueAtTime(0, at + 0.1);
  glint.connect(glintAmp);
  glintAmp.connect(amp);

  let tail: AudioNode = amp;
  if (o.dark) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = Math.min(4000, freq * 2.6);
    lowpass.Q.value = 0.5;
    amp.connect(lowpass);
    tail = lowpass;
  }
  place(v, freq, tail, o.wet ?? 0.35);

  for (const osc of [carrier, modulator, glint]) {
    osc.start(at);
    osc.stop(end + 0.05);
  }
  return end;
}

/** The same tine, felted: rounder and shorter, for low or quiet moments. */
function mallet(v: Voice, at: number, freq: number, gain: number, o: ToneOptions = {}): number {
  return tine(v, at, freq, gain, { decay: 0.5, bright: 0.55, dark: true, ...o });
}

/** A breath of band-passed noise sweeping from one frequency to another. */
function breath(v: Voice, at: number, dur: number, from: number, to: number, gain: number, wet = 0.3, q = 0.9): number {
  const { ctx } = v;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;
  source.playbackRate.value = 0.9 + v.rand() * 0.2;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = q;
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + dur * 0.35);
  amp.gain.linearRampToValueAtTime(0, at + dur);
  source.connect(band);
  band.connect(amp);
  place(v, (from + to) / 2, amp, wet);
  source.start(at, v.rand() * 0.5);
  source.stop(at + dur + 0.02);
  return at + dur;
}

/** A tiny noise click, the "contact" in a press. */
function click(v: Voice, at: number, gain: number, freq = 2400): number {
  const { ctx } = v;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq * (0.9 + v.rand() * 0.2);
  band.Q.value = 1.4;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(gain * 0.001, at + 0.018);
  amp.gain.linearRampToValueAtTime(0, at + 0.022);
  source.connect(band);
  band.connect(amp);
  place(v, freq / 3, amp, 0.05);
  source.start(at, v.rand() * 0.5);
  source.stop(at + 0.03);
  return at + 0.03;
}

/** A warm, slowly opening chord under the bigger moments. */
function pad(v: Voice, at: number, freqs: number[], dur: number, gain: number, attack = 0.35): number {
  const { ctx } = v;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.3;
  lowpass.frequency.setValueAtTime(500, at);
  lowpass.frequency.exponentialRampToValueAtTime(1800, at + attack + 0.2);
  lowpass.frequency.exponentialRampToValueAtTime(700, at + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain / freqs.length, at + attack);
  amp.gain.setTargetAtTime(0, at + attack, (dur - attack) / 4);
  amp.gain.linearRampToValueAtTime(0, at + dur);
  lowpass.connect(amp);
  for (const freq of freqs) {
    for (const spread of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = v.cents + spread + (v.rand() - 0.5) * 4;
      osc.connect(lowpass);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
  }
  place(v, 400, amp, 0.5);
  return at + dur;
}

/** A soft "bloop" that rises, like a bubble or a sprout breaking the soil. */
function pop(v: Voice, at: number, from: number, to: number, gain: number): number {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.09);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(gain * 0.001, at + 0.16);
  amp.gain.linearRampToValueAtTime(0, at + 0.17);
  osc.connect(amp);
  place(v, to, amp, 0.25);
  osc.start(at);
  osc.stop(at + 0.2);
  return at + 0.17;
}

/** Notes played one after another, each a little later than the last, with human timing. */
function run(v: Voice, at: number, notes: number[], spacing: number, gain: number, o: ToneOptions = {}, swell = 0): number {
  let end = at;
  notes.forEach((n, i) => {
    const time = at + i * spacing + (i > 0 ? (v.rand() - 0.5) * spacing * 0.15 : 0);
    const level = gain * (1 + (swell * i) / Math.max(1, notes.length - 1)) * (0.9 + v.rand() * 0.2);
    end = Math.max(end, tine(v, time, pent(n), level, o));
  });
  return end;
}

/** High, quiet tines falling at random: the sparkle on top of good news. */
function sparkle(v: Voice, at: number, count: number, gain: number, span = 0.6, top = 17): number {
  let end = at;
  for (let i = 0; i < count; i++) {
    const n = top - i - Math.floor(v.rand() * 2);
    const time = at + (i / count) * span + v.rand() * 0.04;
    end = Math.max(end, tine(v, time, pent(n), gain * (1 - (i / count) * 0.5), { decay: 0.6, bright: 0.7, wet: 0.7 }));
  }
  return end;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The sounds                                                                                                         */

let streak = 0;

const sounds: Record<SoundName, SoundSpec> = {
  hover: {
    label: "Hover on a primary action",
    tier: "tick",
    gap: 0.08,
    play: (v, t) => tine(v, t, pent(17), 0.022, { decay: 0.12, bright: 0.3, wet: 0.15 }),
  },
  press: {
    label: "Button press",
    tier: "tick",
    gap: 0.04,
    play: (v, t) => {
      click(v, t, 0.056);
      return mallet(v, t, pent(10 + Math.floor(v.rand() * 2)), 0.042, { decay: 0.08, wet: 0.05 });
    },
  },
  activity: {
    label: "Sloo is researching (activity line)",
    tier: "tick",
    gap: 0.3,
    play: (v, t) => tine(v, t, pent(11 + Math.floor(v.rand() * 4)), 0.032, { decay: 0.35, bright: 0.5, wet: 0.5 }),
  },
  select: {
    label: "Pick an answer option",
    tier: "small",
    gap: 0.03,
    play: (v, t, o) => {
      click(v, t, 0.04, 3000);
      return tine(v, t, pent(7 + Math.min(5, o.index ?? 0)), 0.13, { decay: 0.35, bright: 0.8, wet: 0.2 });
    },
  },
  confidence: {
    label: "Choose how sure you are (1 to 3)",
    tier: "small",
    gap: 0.03,
    play: (v, t, o) => {
      const level = Math.max(1, Math.min(3, o.index ?? 2));
      const end = mallet(v, t, pent(4 + level * 2), 0.14, { decay: 0.4 });
      return level === 3 ? Math.max(end, tine(v, t + 0.06, pent(11), 0.06, { decay: 0.4 })) : end;
    },
  },
  navigate: {
    label: "Move between screens",
    tier: "small",
    gap: 0.15,
    play: (v, t) => {
      breath(v, t, 0.28, 500, 1800, 0.05, 0.4);
      mallet(v, t + 0.03, pent(0), 0.13, { decay: 0.45 });
      return mallet(v, t + 0.11, pent(3), 0.1, { decay: 0.5 });
    },
  },
  dialogOpen: {
    label: "A dialog opens",
    tier: "small",
    gap: 0.15,
    play: (v, t) => {
      breath(v, t, 0.22, 700, 2600, 0.04, 0.4);
      tine(v, t + 0.02, pent(8), 0.09, { decay: 0.5, bright: 0.8 });
      return tine(v, t + 0.1, pent(10), 0.08, { decay: 0.6, bright: 0.8 });
    },
  },
  dialogClose: {
    label: "A dialog closes",
    tier: "small",
    gap: 0.15,
    play: (v, t) => {
      breath(v, t, 0.2, 2200, 600, 0.03, 0.3);
      tine(v, t + 0.01, pent(10), 0.07, { decay: 0.4, bright: 0.7 });
      return tine(v, t + 0.08, pent(8), 0.065, { decay: 0.45, bright: 0.7 });
    },
  },
  micOn: {
    label: "Microphone starts listening",
    tier: "small",
    play: (v, t) => {
      tine(v, t, pent(8), 0.11, { decay: 0.25, wet: 0.05 });
      return tine(v, t + 0.07, pent(10), 0.11, { decay: 0.3, wet: 0.05 });
    },
  },
  micOff: {
    label: "Microphone stops",
    tier: "small",
    play: (v, t) => {
      tine(v, t, pent(10), 0.1, { decay: 0.25, wet: 0.05 });
      return tine(v, t + 0.07, pent(8), 0.1, { decay: 0.3, wet: 0.05 });
    },
  },
  flip: {
    label: "Review card turns over",
    tier: "small",
    gap: 0.1,
    play: (v, t) => {
      breath(v, t, 0.17, 900, 3200, 0.1, 0.25, 0.7);
      return tine(v, t + 0.12, pent(9), 0.08, { decay: 0.45, bright: 0.6 });
    },
  },
  thinking: {
    label: "Sloo starts thinking",
    tier: "small",
    gap: 1,
    play: (v, t) => {
      mallet(v, t, pent(4), 0.08, { decay: 0.6, wet: 0.5 });
      return mallet(v, t + 0.2, pent(5), 0.065, { decay: 0.7, wet: 0.5 });
    },
  },
  gradeAgain: {
    label: "Review graded: forgot",
    tier: "small",
    play: (v, t) => mallet(v, t, pent(3), 0.15, { decay: 0.55 }),
  },
  gradeHard: {
    label: "Review graded: hard",
    tier: "small",
    play: (v, t) => mallet(v, t, pent(5), 0.15, { decay: 0.55 }),
  },
  gradeGood: {
    label: "Review graded: good",
    tier: "small",
    play: (v, t) => {
      tine(v, t, pent(5), 0.12, { decay: 0.6 });
      return tine(v, t + 0.08, pent(7), 0.12, { decay: 0.7 });
    },
  },
  gradeEasy: {
    label: "Review graded: easy",
    tier: "small",
    play: (v, t) => run(v, t, [5, 7, 8], 0.07, 0.11, { decay: 0.8 }),
  },
  send: {
    label: "Message sent",
    tier: "medium",
    gap: 0.1,
    play: (v, t) => {
      breath(v, t, 0.16, 1200, 4200, 0.035, 0.2);
      tine(v, t, pent(7), 0.2, { decay: 0.55, glide: 0.89, bright: 1.2 });
      return tine(v, t + 0.07, pent(8), 0.12, { decay: 0.65 });
    },
  },
  reply: {
    label: "Sloo's reply arrives",
    tier: "medium",
    gap: 0.5,
    play: (v, t) => {
      tine(v, t, pent(3), 0.16, { decay: 0.8, bright: 0.8 });
      return tine(v, t + 0.11, pent(5), 0.14, { decay: 0.9, bright: 0.8 });
    },
  },
  question: {
    label: "A question card appears",
    tier: "medium",
    gap: 0.3,
    play: (v, t) => {
      tine(v, t, pent(6), 0.14, { decay: 0.7 });
      const end = tine(v, t + 0.13, pent(8), 0.14, { decay: 1.1, bright: 1.3 });
      return v.gentle ? end : Math.max(end, tine(v, t + 0.3, pent(13), 0.035, { decay: 0.7, wet: 0.8 }));
    },
  },
  hint: {
    label: "A hint is revealed",
    tier: "medium",
    gap: 0.3,
    play: (v, t) => {
      const end = run(v, t, [14, 13, 12, 10], 0.055, 0.06, { decay: 0.6, bright: 0.6, wet: 0.7 });
      return Math.max(end, mallet(v, t + 0.2, pent(5), 0.11, { decay: 0.8 }));
    },
  },
  correct: {
    label: "Answer correct (climbs with a streak)",
    tier: "large",
    play: (v, t, o) => {
      const step = Math.min(4, Math.max(0, (o.streak ?? 1) - 1));
      const root = 5 + step;
      // Higher notes sound louder, so each step up the streak plays a little softer.
      const end = run(v, t, [root, root + 2, root + 3], 0.075, 0.17 * (1 - step * 0.04), { decay: 1.1, bright: 1.2 }, 0.15);
      const top = tine(v, t + 0.24, pent(root + 5), 0.08, { decay: 1.2, wet: 0.6 });
      return v.gentle ? Math.max(end, top) : Math.max(end, top, sparkle(v, t + 0.3, 3, 0.04, 0.3, root + 12));
    },
  },
  partial: {
    label: "Answer partly right",
    tier: "medium",
    play: (v, t) => {
      pad(v, t, [pent(0), pent(3)], 1.0, 0.07, 0.15);
      tine(v, t, pent(5), 0.16, { decay: 0.7 });
      return tine(v, t + 0.12, pent(6), 0.15, { decay: 1.0 });
    },
  },
  incorrect: {
    label: "Answer not yet right (gentle)",
    tier: "medium",
    play: (v, t) => {
      pad(v, t, [pent(-5), pent(-2)], 0.9, 0.07, 0.12);
      mallet(v, t, pent(3), 0.13, { decay: 0.7 });
      return mallet(v, t + 0.16, pent(2), 0.12, { decay: 0.9 });
    },
  },
  error: {
    label: "Something went wrong",
    tier: "medium",
    gap: 1.5,
    play: (v, t) => {
      click(v, t, 0.05, 900);
      mallet(v, t, pent(-2), 0.16, { decay: 0.3, wet: 0.15 });
      click(v, t + 0.14, 0.04, 900);
      return mallet(v, t + 0.14, pent(-2), 0.14, { decay: 0.45, wet: 0.2 });
    },
  },
  courseCreated: {
    label: "Start a new course (seed planted)",
    tier: "medium",
    play: (v, t) => {
      mallet(v, t, pent(-5), 0.22, { decay: 0.5 });
      pop(v, t + 0.12, 260, 700, 0.07);
      tine(v, t + 0.22, pent(3), 0.13, { decay: 0.8 });
      return tine(v, t + 0.32, pent(5), 0.13, { decay: 1.0 });
    },
  },
  import: {
    label: "Course imported",
    tier: "medium",
    play: (v, t) => {
      breath(v, t, 0.3, 3000, 600, 0.05, 0.4);
      tine(v, t + 0.12, pent(8), 0.1, { decay: 0.6 });
      tine(v, t + 0.2, pent(5), 0.1, { decay: 0.7 });
      return mallet(v, t + 0.28, pent(0), 0.13, { decay: 0.8 });
    },
  },
  export: {
    label: "Course exported",
    tier: "medium",
    play: (v, t) => {
      mallet(v, t, pent(0), 0.14, { decay: 0.6 });
      breath(v, t + 0.05, 0.32, 600, 3600, 0.05, 0.4);
      tine(v, t + 0.1, pent(5), 0.12, { decay: 0.6 });
      return tine(v, t + 0.19, pent(8), 0.12, { decay: 0.9 });
    },
  },
  learning: {
    label: "A skill sprouts (seed to learning)",
    tier: "large",
    play: (v, t) => {
      pop(v, t, 240, 760, 0.14);
      tine(v, t + 0.1, pent(5), 0.19, { decay: 0.8 });
      return tine(v, t + 0.19, pent(8), 0.18, { decay: 1.1, bright: 1.3 });
    },
  },
  practiced: {
    label: "A skill buds (learning to practiced)",
    tier: "large",
    play: (v, t) => {
      pop(v, t, 240, 760, 0.1);
      pad(v, t + 0.05, [pent(0), pent(3), pent(7)], 1.4, 0.1, 0.25);
      const end = run(v, t + 0.08, [5, 6, 7, 8], 0.08, 0.13, { decay: 1.1 }, 0.25);
      return v.gentle ? end : Math.max(end, sparkle(v, t + 0.45, 4, 0.035, 0.4, 16));
    },
  },
  mastered: {
    label: "A skill blooms (mastered)",
    tier: "flourish",
    play: (v, t) => {
      mallet(v, t, pent(-5), 0.22, { decay: 1.2 });
      pad(v, t, [pent(-5), pent(-2), pent(1), pent(2)], 2.8, 0.14, 0.5);
      const climb = v.gentle ? [5, 7, 8, 10] : [5, 6, 7, 8, 9, 10, 11, 12, 13];
      const end = run(v, t + 0.05, climb, 0.065, 0.09, { decay: 1.2 }, 0.6);
      const bloom = t + 0.1 + climb.length * 0.065;
      tine(v, bloom, pent(10), 0.11, { decay: 2.2, bright: 1.3 });
      const last = tine(v, bloom + 0.02, pent(13), 0.07, { decay: 2.2, wet: 0.7 });
      return v.gentle ? Math.max(end, last) : Math.max(end, last, sparkle(v, bloom + 0.15, 8, 0.04, 1.0, 19));
    },
  },
  reviewDone: {
    label: "Review finished",
    tier: "large",
    play: (v, t) => {
      pad(v, t, [pent(0), pent(3), pent(7)], 1.5, 0.1, 0.3);
      const end = run(v, t, [3, 5, 7, 10], 0.1, 0.12, { decay: 1.2 }, 0.2);
      return v.gentle ? end : Math.max(end, sparkle(v, t + 0.45, 4, 0.035, 0.45, 17));
    },
  },
  complete: {
    label: "Session complete",
    tier: "flourish",
    play: (v, t) => {
      // A IV to I cadence: G major settling onto D major, with the melody stepping down home.
      pad(v, t, [semi(-7), semi(-3), semi(0)], 1.0, 0.1, 0.2);
      tine(v, t, pent(6), 0.12, { decay: 0.9 });
      tine(v, t + 0.22, semi(17), 0.11, { decay: 0.9 });
      pad(v, t + 0.6, [pent(-5), pent(-2), pent(2)], 2.2, 0.12, 0.4);
      mallet(v, t + 0.6, pent(-5), 0.15, { decay: 1.2 });
      const home = run(v, t + 0.6, [8, 10], 0.12, 0.13, { decay: 1.8 });
      return v.gentle ? home : Math.max(home, sparkle(v, t + 0.95, 6, 0.035, 0.8, 18));
    },
  },
  courseReady: {
    label: "Course is built and ready",
    tier: "flourish",
    play: (v, t) => {
      breath(v, t, 0.5, 400, 3000, 0.05, 0.6);
      pad(v, t + 0.1, [pent(-5), pent(-2), pent(2)], 2.2, 0.12, 0.45);
      const end = run(v, t + 0.15, [5, 7, 8, 10], 0.11, 0.12, { decay: 1.4 }, 0.3);
      const last = tine(v, t + 0.62, pent(13), 0.06, { decay: 1.8, wet: 0.7 });
      return v.gentle ? Math.max(end, last) : Math.max(end, last, sparkle(v, t + 0.7, 6, 0.035, 0.8, 18));
    },
  },
  courseComplete: {
    label: "Every skill in bloom (course finished)",
    tier: "flourish",
    play: (v, t) => {
      mallet(v, t, pent(-10), 0.2, { decay: 1.6 });
      pad(v, t, [pent(-10), pent(-5), pent(-2), pent(1), pent(2)], 3.6, 0.16, 0.7);
      const climb = v.gentle ? [0, 3, 5, 8, 10] : [0, 2, 3, 5, 7, 8, 10, 12, 13, 15];
      const end = run(v, t + 0.1, climb, 0.07, 0.08, { decay: 1.3 }, 0.7);
      const bloom = t + 0.18 + climb.length * 0.07;
      tine(v, bloom, pent(10), 0.1, { decay: 2.6 });
      tine(v, bloom + 0.02, pent(12), 0.08, { decay: 2.6 });
      const last = tine(v, bloom + 0.04, pent(15), 0.06, { decay: 2.6, wet: 0.7 });
      return v.gentle ? Math.max(end, last) : Math.max(end, last, sparkle(v, bloom + 0.2, 12, 0.04, 1.6, 20));
    },
  },
  open: {
    label: "App opens",
    tier: "flourish",
    play: (v, t) => {
      pad(v, t, [pent(-5), pent(-2), pent(2)], 2.0, 0.11, 0.6);
      const end = run(v, t + 0.25, v.gentle ? [5, 8] : [5, 8, 10], 0.16, 0.1, { decay: 1.3, bright: 0.8 }, 0.1);
      return v.gentle ? end : Math.max(end, sparkle(v, t + 0.75, 3, 0.03, 0.4, 16));
    },
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* The room: a shared reverb and a soft echo                                                                          */

interface Chain {
  input: GainNode;
  send: GainNode;
  master: GainNode;
  duck: GainNode;
}

function impulse(ctx: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const time = i / ctx.sampleRate;
      // A one-pole lowpass that closes as the tail decays keeps the room warm rather than hissy.
      const close = 0.25 + 0.6 * Math.min(1, time / seconds);
      smooth += (1 - close) * (Math.random() * 2 - 1 - smooth);
      const fadeIn = Math.min(1, time / 0.012);
      data[i] = smooth * Math.exp(-time * 3.4) * fadeIn;
    }
  }
  return buffer;
}

let clipCurve: Float32Array<ArrayBuffer> | undefined;

function softClip(): Float32Array<ArrayBuffer> {
  if (!clipCurve) {
    clipCurve = new Float32Array(2049);
    for (let i = 0; i < clipCurve.length; i++) {
      const x = (i / (clipCurve.length - 1)) * 2 - 1;
      const over = Math.abs(x) - 0.5;
      clipCurve[i] = over <= 0 ? x : Math.sign(x) * (0.5 + 0.5 * Math.tanh(over / 0.5));
    }
  }
  return clipCurve;
}

function buildChain(ctx: BaseAudioContext, limit = true): Chain {
  const input = ctx.createGain();
  const send = ctx.createGain();
  const master = ctx.createGain();
  const duck = ctx.createGain();

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.55;
  send.connect(reverb);
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);

  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.27;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2400;
  const echoReturn = ctx.createGain();
  echoReturn.gain.value = 0.18;
  send.connect(echo);
  echo.connect(echoTone);
  echoTone.connect(feedback);
  feedback.connect(echo);
  echoTone.connect(echoReturn);
  echoReturn.connect(master);
  echoReturn.connect(reverb);

  input.connect(master);
  master.connect(duck);
  if (limit) {
    // A stateless soft clip rather than a compressor: transparent below -6 dBFS, so it never pumps or adds makeup gain.
    const clip = ctx.createWaveShaper();
    clip.curve = softClip();
    clip.oversample = "2x";
    duck.connect(clip);
    clip.connect(ctx.destination);
  } else {
    duck.connect(ctx.destination);
  }
  return { input, send, master, duck };
}

function voiceFor(ctx: BaseAudioContext, chain: Chain, gentle: boolean): Voice {
  const sound = ctx.createGain();
  // A touch of loudness variation, about plus or minus 1 dB.
  sound.gain.value = 0.89 + Math.random() * 0.22;
  sound.connect(chain.input);
  const send = ctx.createGain();
  send.connect(chain.send);
  return { ctx, out: sound, send, gentle, rand: Math.random, cents: (Math.random() - 0.5) * 12 };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The player                                                                                                         */

interface SoundSettings {
  volume: number;
  muted: boolean;
}

const STORAGE_KEY = "sloodle-sound";
const DUCKED = 0.35;

function loadSettings(): SoundSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SoundSettings>;
    return { volume: typeof saved.volume === "number" ? Math.max(0, Math.min(1, saved.volume)) : 0.7, muted: saved.muted === true };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

class SoundPlayer {
  private ctx?: AudioContext;
  private chain?: Chain;
  private settings = loadSettings();
  private last = new Map<SoundName, number>();
  private busyUntil: number[] = [];
  private listeners = new Set<(settings: SoundSettings) => void>();
  private speaking = false;

  constructor() {
    if (typeof window === "undefined") return;
    speaker.onSpeaking((speaking) => {
      this.speaking = speaking;
      this.applyDuck();
    });
  }

  get volume(): number {
    return this.settings.volume;
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  get names(): SoundName[] {
    return Object.keys(sounds) as SoundName[];
  }

  label(name: SoundName): string {
    return sounds[name].label;
  }

  tier(name: SoundName): Tier {
    return sounds[name].tier;
  }

  /** Creates the AudioContext if needed and resumes it. Call from a user gesture. */
  unlock(): AudioContext | undefined {
    if (typeof AudioContext === "undefined") return undefined;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.chain = buildChain(this.ctx);
      this.applyVolume(0);
      this.applyDuck();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    if (name === "correct") options = { streak: ++streak, ...options };
    else if (name === "partial" || name === "incorrect") streak = 0;
    if (this.settings.muted || this.settings.volume === 0) return;

    const ctx = this.unlock();
    if (!ctx || !this.chain || ctx.state !== "running") return;
    const spec = sounds[name];
    const now = ctx.currentTime;
    const at = now + 0.005 + (options.delay ?? 0);

    const previous = this.last.get(name);
    if (previous !== undefined && at - previous < (spec.gap ?? 0.05)) return;
    this.busyUntil = this.busyUntil.filter((end) => end > now);
    if (spec.tier === "tick" && this.busyUntil.length > 6) return;
    if (this.busyUntil.length > 14) return;
    this.last.set(name, at);

    try {
      const end = spec.play(voiceFor(ctx, this.chain, options.gentle ?? reducedMotion()), at, options);
      this.busyUntil.push(end);
    } catch {
      // A sound that fails to build must never break the interaction that triggered it.
    }
  }

  resetStreak(): void {
    streak = 0;
  }

  setVolume(volume: number): void {
    this.update({ volume: Math.max(0, Math.min(1, volume)) });
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  subscribe(listener: (settings: SoundSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Renders one sound offline, for the audition page and for measuring loudness. */
  async render(name: SoundName, options: PlayOptions = {}, { gentle = false, limit = true, sampleRate = 48000 } = {}): Promise<AudioBuffer> {
    const tail = 2.6;
    const probe = new OfflineAudioContext(2, sampleRate, sampleRate);
    const length = sounds[name].play(voiceFor(probe, buildChain(probe, limit), gentle), 0.01, options) + tail;
    const ctx = new OfflineAudioContext(2, Math.ceil(length * sampleRate), sampleRate);
    const chain = buildChain(ctx, limit);
    sounds[name].play(voiceFor(ctx, chain, gentle), 0.01, options);
    return ctx.startRendering();
  }

  private update(change: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...change };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // The choice still applies for this run.
    }
    this.applyVolume(0.05);
    for (const listener of this.listeners) listener(this.settings);
  }

  private applyVolume(ramp: number): void {
    if (!this.ctx || !this.chain) return;
    const { volume, muted } = this.settings;
    // Squared, so the slider feels even to the ear.
    this.chain.master.gain.setTargetAtTime(muted ? 0 : volume * volume, this.ctx.currentTime, ramp);
  }

  private applyDuck(): void {
    if (!this.ctx || !this.chain) return;
    this.chain.duck.gain.setTargetAtTime(this.speaking ? DUCKED : 1, this.ctx.currentTime, this.speaking ? 0.08 : 0.4);
  }
}

const sfx = new SoundPlayer();

/* ------------------------------------------------------------------------------------------------------------------ */
/* Wiring                                                                                                             */

const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], summary';
const PRIMARY = 'button[data-variant="solid"], [role="button"][data-variant="solid"]';
// Options and confidence choices play their own pitched note instead of the press tick.
const OWN_SOUND = '[role="radio"], [data-slot="radio"], [data-slot="segmented-control-item"], [role="checkbox"]';
const DIALOG = '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]';

function isDisabled(element: Element): boolean {
  return element.matches(":disabled, [aria-disabled='true'], [data-disabled]");
}

let installed = false;

/**
 * Wires the generic sounds once for the whole window: press and hover ticks, dialogs, alerts, the opening chime, and
 * the first-gesture unlock. Elements can opt out with data-sound="off" or name their own sound with data-sound="send".
 */
function installSounds(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const loadedAt = performance.now();
  let opened = false;

  const greet = () => {
    if (opened || performance.now() - loadedAt > 20000) return;
    if (!sfx.running) return;
    opened = true;
    sfx.play("open");
  };

  const unlock = () => {
    const ctx = sfx.unlock();
    if (ctx && ctx.state !== "running") void ctx.resume().then(greet, () => undefined);
    else greet();
  };
  // A desktop webview may allow audio straight away; a browser waits for the first gesture.
  sfx.unlock()?.resume().then(greet, () => undefined);
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, unlock, { capture: true, passive: true });

  const pressFor = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest(PRESSABLE) : null;
    if (!element || isDisabled(element) || element.matches(OWN_SOUND)) return;
    const named = element.closest("[data-sound]")?.getAttribute("data-sound");
    if (named === "off") return;
    sfx.play(named && named in sounds ? (named as SoundName) : "press");
  };

  document.addEventListener("pointerdown", (event) => event.button === 0 && pressFor(event.target), { passive: true });
  document.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.repeat) pressFor(event.target);
  });

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
    const element = event.target.closest(PRIMARY);
    if (!element || isDisabled(element)) return;
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    sfx.play("hover");
  });

  const openDialogs = new Set<Element>();
  const syncDialogs = () => {
    const now = new Set([...document.querySelectorAll(DIALOG)].filter((el) => !el.hasAttribute("data-ending-style")));
    const opened = [...now].some((el) => !openDialogs.has(el));
    const closed = [...openDialogs].some((el) => !now.has(el));
    openDialogs.clear();
    for (const el of now) openDialogs.add(el);
    if (opened) sfx.play("dialogOpen");
    else if (closed) sfx.play("dialogClose");
  };

  const alerted = new WeakSet<Element>();
  const checkAlerts = (node: Node) => {
    if (!(node instanceof Element)) return;
    const alerts = node.matches('[role="alert"]') ? [node] : [...node.querySelectorAll('[role="alert"]')];
    const fresh = alerts.filter((el) => !alerted.has(el));
    for (const el of fresh) alerted.add(el);
    if (fresh.length > 0 && performance.now() - loadedAt > 2500) sfx.play("error");
  };

  new MutationObserver((records) => {
    let dialogs = false;
    for (const record of records) {
      if (record.type === "attributes") dialogs = true;
      for (const node of record.addedNodes) {
        checkAlerts(node);
        dialogs = true;
      }
      if (record.removedNodes.length > 0) dialogs = true;
    }
    if (dialogs) syncDialogs();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ending-style", "role"] });
}

/** Plays the navigation sound when `key` changes after the first render. */
function useNavigateSound(key: unknown): void {
  const previous = useRef(key);
  useEffect(() => {
    if (Object.is(previous.current, key)) return;
    previous.current = key;
    sfx.play("navigate");
  }, [key]);
}

interface SessionLike {
  sessionId?: string;
  items: ReadonlyArray<
    | { type: "tutor" | "user" | "content" | "activity" | "error" | "project" }
    | { type: "question"; question: { id: string }; hints: string[]; result?: { verdict: "correct" | "partial" | "incorrect" } }
  >;
  streaming: string;
  busy: boolean;
  ended: boolean;
}

/** Turns a tutoring session's events into sounds. History that was already there when it opened stays quiet. */
function useSessionSounds(session: SessionLike, kind: string): void {
  const seen = useRef<{ id?: string; count: number; questions: Map<string, { hints: number; graded: boolean }>; streamed: boolean }>({
    count: 0,
    questions: new Map(),
    streamed: false,
  });

  useEffect(() => {
    const state = seen.current;
    if (session.sessionId === undefined) return;
    const fresh = state.id !== session.sessionId;
    if (fresh) {
      state.id = session.sessionId;
      state.questions.clear();
      sfx.resetStreak();
    }
    const from = fresh ? session.items.length : state.count;
    state.count = session.items.length;

    if (!fresh && session.streaming && !state.streamed) {
      state.streamed = true;
      sfx.play("reply");
    }

    session.items.forEach((item, index) => {
      const isNew = !fresh && index >= from;
      if (item.type === "question") {
        const before = state.questions.get(item.question.id);
        const now = { hints: item.hints.length, graded: item.result !== undefined };
        state.questions.set(item.question.id, now);
        if (fresh) return;
        if (isNew) sfx.play("question", { delay: 0.18 });
        if (before && now.hints > before.hints) sfx.play("hint");
        if (item.result && !before?.graded) sfx.play(item.result.verdict);
        return;
      }
      if (!isNew) return;
      if (item.type === "user") sfx.play("send");
      else if (item.type === "activity") sfx.play("activity");
      else if (item.type === "tutor") {
        if (!state.streamed) sfx.play("reply");
        state.streamed = false;
      }
    });
    if (!session.busy) state.streamed = false;
  }, [session.items, session.sessionId, session.streaming, session.busy]);

  const thinking = session.sessionId !== undefined && session.busy && !session.streaming && !session.ended && kind !== "planning";
  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => sfx.play("thinking"), 650);
    return () => clearTimeout(timer);
  }, [thinking]);

  const ended = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (session.sessionId === undefined) return;
    const before = ended.current;
    ended.current = session.ended;
    if (before === false && session.ended && kind === "lesson") sfx.play("complete", { delay: 0.3 });
  }, [session.ended, session.sessionId, kind]);
}

const rank: Record<MasteryStatus, number> = { new: 0, learning: 1, practiced: 2, mastered: 3 };
const growthSound: Record<Exclude<MasteryStatus, "new">, SoundName> = { learning: "learning", practiced: "practiced", mastered: "mastered" };

const gradeSounds: Record<ReviewGrade, SoundName> = { again: "gradeAgain", hard: "gradeHard", good: "gradeGood", easy: "gradeEasy" };

/** Only the fields the sounds need, so this keeps working while the course formats change. */
interface CourseLike {
  course: { id: string; phase: string; objectiveStates: Record<string, { status: MasteryStatus } | undefined> };
  content?: { modules: { objectives: { id: string }[] }[] };
}

/** Plays the growth sounds when a skill advances, and the flourishes when a course is ready or fully in bloom. */
function useCourseSounds(detail: CourseLike | undefined): void {
  const previous = useRef<{ id: string; phase: string; statuses: Record<string, MasteryStatus>; done: boolean }>(undefined);

  useEffect(() => {
    if (!detail) return;
    const { course } = detail;
    const ids = detail.content?.modules.flatMap((m) => m.objectives.map((o) => o.id)) ?? Object.keys(course.objectiveStates);
    const statuses = Object.fromEntries(ids.map((id) => [id, course.objectiveStates[id]?.status ?? "new"])) as Record<string, MasteryStatus>;
    const done = ids.length > 0 && ids.every((id) => statuses[id] === "mastered");
    const before = previous.current;
    previous.current = { id: course.id, phase: course.phase, statuses, done };
    if (!before || before.id !== course.id) return;

    if (before.phase !== "ready" && course.phase === "ready") {
      sfx.play("courseReady", { delay: 0.2 });
      return;
    }
    if (done && !before.done) {
      sfx.play("courseComplete", { delay: 0.7 });
      return;
    }
    let best: MasteryStatus = "new";
    for (const [id, status] of Object.entries(statuses)) {
      if (rank[status] > rank[before.statuses[id] ?? "new"] && rank[status] > rank[best]) best = status;
    }
    // Waits for the answer's own sound to land first.
    if (best !== "new") sfx.play(growthSound[best], { delay: 0.7 });
  }, [detail]);
}

export { gradeSounds, installSounds, sfx, useCourseSounds, useNavigateSound, useSessionSounds };
export type { PlayOptions, SoundName, SoundSettings, Tier };
