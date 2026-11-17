// The ad's soundtrack, rendered offline with the app's own instrument (src/sound.ts): its FM tines, mallets, pads and
// room, a small bed in D major pentatonic, the app's sounds on the cuts and type hits, and the Kokoro voice lines.

// The instrument varies each note a little with Math.random; seeding it makes every render identical.
let seed = 20261117;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const sound = await import("../../src/sound");
const { tine, mallet, pad, breath, pop, click, sparkle, semi, buildChain, voiceFor, __sounds } = sound as unknown as Record<string, any>;
const { OPEN, SUBJECTS, composerHits } = await import("./scenes/Open");
const { BUILD } = await import("./scenes/Build");
const { TEACH } = await import("./scenes/Teach");
const { SHARE } = await import("./scenes/Share");
const { YOURS, END } = await import("./scenes/Yours");
const { DURATION } = await import("./Ad");

const RATE = 48000;

export const VOICE: { file: string; at: number }[] = [
  { file: "hey-heart", at: OPEN.hey - 0.34 },
  { file: "time-heart", at: OPEN.time - 0.33 },
  { file: "teach-1", at: TEACH.start + TEACH.voice1 },
  { file: "teach-2", at: TEACH.start + TEACH.voice2 },
];

type Chord = { bass: number; arp: number[]; pad: number[] };
const D: Chord = { bass: -12, arp: [0, 4, 7, 9, 12, 14], pad: [-12, -5, 4, 9] };
const Bm: Chord = { bass: -15, arp: [-3, 2, 4, 7, 9, 14], pad: [-15, -8, 2, 6] };
const G: Chord = { bass: -19, arp: [2, 5, 7, 9, 12, 14], pad: [-19, -12, -3, 4] };
const A: Chord = { bass: -17, arp: [-5, 0, 2, 7, 12, 14], pad: [-17, -10, -5, 2] };
const PROGRESSION = [D, Bm, G, A];
const BEAT = 0.625;
const BAR = BEAT * 4;
const PATTERN = [0, 2, 1, 3, 2, 4, 3, 5];

async function render(withVoice: boolean): Promise<AudioBuffer> {
  seed = 20261117;
  const length = Math.ceil((DURATION + 0.5) * RATE);
  const ctx = new OfflineAudioContext(2, length, RATE);
  const chain = buildChain(ctx, true);
  chain.master.gain.value = 0.9;
  const bedChain = buildChain(ctx, true);
  const bed = bedChain.master;
  bed.gain.value = 0;

  const v = () => voiceFor(ctx, chain, false);
  const bv = () => voiceFor(ctx, bedChain, false);
  const play = (name: string, at: number, options: Record<string, unknown> = {}) => __sounds[name].play(v(), at, options);

  // The bed: in at the promise, through the build and the share, quieter under speech, out with the end card.
  const level = (at: number, value: number, ramp = 0.4) => bed.gain.setTargetAtTime(value, at, ramp / 3);
  level(OPEN.promise - 0.45, 1, 0.3);
  level(TEACH.start + 0.2, 0.7, 0.8);
  level(SHARE.start, 1, 0.5);
  level(YOURS.start, 0.8, 0.4);
  level(END.start + 0.2, 0.45, 0.8);
  level(DURATION - 1.2, 0, 1.0);

  const bedStart = OPEN.promise - 0.45;
  const bedEnd = END.start + 0.4;
  for (let bar = 0; bedStart + bar * BAR < bedEnd; bar++) {
    const at = bedStart + bar * BAR;
    const chord = PROGRESSION[Math.floor(bar / 1) % PROGRESSION.length]!;
    pad(bv(), at, chord.pad.map(semi), BAR + 0.4, 0.09, 0.5);
    for (let beat = 0; beat < 4; beat++) {
      const bt = at + beat * BEAT;
      if (bt >= bedEnd) break;
      if (beat === 0 || beat === 2) mallet(bv(), bt, semi(chord.bass), beat === 0 ? 0.12 : 0.08, { decay: 0.7, wet: 0.2 });
      for (let half = 0; half < 2; half++) {
        const step = beat * 2 + half;
        const note = chord.arp[PATTERN[step]!]!;
        tine(bv(), bt + half * (BEAT / 2), semi(note), half ? 0.032 : 0.042, { decay: 0.55, bright: 0.6, wet: 0.45 });
      }
    }
  }

  // Cold open: the app's "open" chord, a plush pop for Sloo, a thump per word.
  play("open", 0.05);
  pop(v(), 0.18, 180, 520, 0.12);
  mallet(v(), OPEN.hey, semi(-12), 0.2, { decay: 0.5 });
  mallet(v(), OPEN.stupid, semi(-5), 0.2, { decay: 0.5 });
  pop(v(), OPEN.stupid + 0.04, 300, 900, 0.07);
  sparkle(v(), OPEN.closeup + 0.1, 5, 0.05, 0.6, 18);
  breath(v(), OPEN.closeup - 0.08, 0.16, 800, 3000, 0.05, 0.2);
  breath(v(), OPEN.wide - 0.08, 0.16, 3000, 800, 0.05, 0.2);
  mallet(v(), OPEN.time, semi(-12), 0.2, { decay: 0.5 });
  play("learning", OPEN.learn);

  // The promise.
  breath(v(), OPEN.promise - 0.1, 0.5, 500, 2400, 0.05, 0.5);
  tine(v(), OPEN.wordmark, semi(12), 0.12, { decay: 0.8 });
  mallet(v(), OPEN.harness, semi(0), 0.12, { decay: 0.5 });
  tine(v(), OPEN.anything + 0.12, semi(16), 0.12, { decay: 0.9 });
  play("dialogOpen", OPEN.composer);
  SUBJECTS.forEach(([at], i) => play("select", at, { index: i % 6 }));
  for (const [at, kind] of composerHits()) if (kind === "key") click(v(), at, 0.035, 2600);
  play("send", OPEN.press);
  play("courseCreated", OPEN.press + 0.15);

  // The build.
  const B = (x: number) => BUILD.start + x;
  play("thinking", B(0.1));
  BUILD.activities.forEach((at) => play("activity", B(at)));
  play("reply", B(BUILD.outline));
  BUILD.objectives.forEach((at, i) => pop(v(), B(at), 260 + i * 60, 700 + i * 120, 0.05));
  breath(v(), B(BUILD.fold), 0.45, 3000, 500, 0.05, 0.4);
  play("question", B(BUILD.diagram));
  for (let i = 0; i < 6; i++) pop(v(), B(BUILD.diagram + 0.4 + i * 0.22), 300 + i * 40, 800 + i * 80, 0.03);
  play("dialogOpen", B(BUILD.flash));
  play("flip", B(BUILD.flip));
  breath(v(), B(BUILD.swap), 0.4, 600, 2600, 0.05, 0.4);
  play("send", B(BUILD.run));
  for (let i = 0; i < 5; i++) play("activity", B(BUILD.run + 0.15 + i * 0.12));
  for (let i = 0; i < 5; i++) click(v(), B(BUILD.snap + i * 0.12 + 0.1), 0.05, 1800 + i * 200);
  play("correct", B(BUILD.correct), { streak: 1 });

  // Teaching.
  const T = (x: number) => TEACH.start + x;
  play("micOn", T(TEACH.readAloud + 0.2));
  play("question", T(TEACH.blanks));
  click(v(), T(TEACH.typeE), 0.05);
  click(v(), T(TEACH.typeD), 0.05);
  play("send", T(TEACH.check));
  play("correct", T(TEACH.graded), { streak: 3 });
  play("dialogOpen", T(TEACH.memory + 0.25));
  play("practiced", T(TEACH.dial));

  // Sharing.
  const S = (x: number) => SHARE.start + x;
  play("export", S(SHARE.press));
  breath(v(), S(SHARE.fly), SHARE.land - SHARE.fly, 500, 3500, 0.06, 0.5);
  play("import", S(SHARE.land - 0.1));
  play("learning", S(SHARE.land + 0.15));

  // Yours: one bloom per promise.
  YOURS.beats.forEach((at, i) => {
    mallet(v(), YOURS.start + at, semi([-12, -15, -19][i]!), 0.2, { decay: 1.0 });
    play(i === 2 ? "practiced" : "learning", YOURS.start + at + 0.05);
  });

  // The end card.
  play("courseComplete", END.start + 0.15);
  tine(v(), END.start + END.wordmark, semi(12), 0.1, { decay: 1.4 });
  sparkle(v(), END.start + END.tagline + 0.1, 6, 0.04, 0.7, 19);

  if (withVoice) {
    for (const line of VOICE) {
      const bytes = await (await fetch(`/audio/${line.file}.wav`)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 1.15;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(line.at);
      // Duck the music under the voice.
      for (const target of [chain.duck, bedChain.duck]) {
        target.gain.setTargetAtTime(0.55, line.at + 0.2, 0.05);
        target.gain.setTargetAtTime(1, line.at + buffer.duration - 0.3, 0.2);
      }
    }
  }
  return ctx.startRendering();
}

function toWav(buffer: AudioBuffer, gain: number): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + frames * channels * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, channels, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * channels * 2, true);
  out.setUint16(32, channels * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, frames * channels * 2, true);
  const data = [...Array(channels)].map((_, c) => buffer.getChannelData(c));
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) out.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, data[c]![i]! * gain)) * 32767), true);
  return new Uint8Array(out.buffer);
}

/** Renders a mix, scales it so its peak sits at -1.5 dBFS, and returns it as a base64 WAV. */
async function mix(withVoice: boolean, fixedGain?: number): Promise<{ wav: string; peak: number; gain: number }> {
  const buffer = await render(withVoice);
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) for (const x of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(x));
  const gain = fixedGain ?? Math.pow(10, -1.5 / 20) / peak;
  const bytes = toWav(buffer, gain);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { wav: btoa(binary), peak, gain };
}

(window as unknown as { __mix: typeof mix }).__mix = mix;
