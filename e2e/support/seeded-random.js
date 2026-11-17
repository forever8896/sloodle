// Runs in the page before the app's own scripts (see `initScripts` in e2e.config.ts).
//
// The lesson components shuffle their items with Math.random. A fixed seed gives every
// run the same order, so a recorded agent step (such as the keyboard moves that put the
// ordering exercise right) replays exactly instead of producing a different answer.
//
// A seed alone is not enough: at startup the sound engine (src/sound.ts) fills a reverb
// impulse with noise, one Math.random call per sample, and its length follows the
// AudioContext's sample rate, which comes from the machine's audio output (48 kHz on one
// machine, 44.1 kHz on a GitHub runner). A different rate leaves the seeded sequence at a
// different position when the components shuffle, so they show another order. Pinning the
// rate makes the number of calls before the shuffle the same on every machine.
(() => {
  const SAMPLE_RATE = 48000;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Native = window[name];
    if (typeof Native !== 'function') continue;
    window[name] = class extends Native {
      constructor(options) {
        super({ ...(options || {}), sampleRate: SAMPLE_RATE });
      }
    };
  }

  let seed = 0x5100d1e;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
