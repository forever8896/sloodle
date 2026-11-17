// Runs in the page before the app's own scripts (see `initScripts` in e2e.config.ts).
// The lesson components shuffle their items with Math.random. A fixed seed gives every
// run the same order, so a recorded agent step replays exactly instead of handing off.
(() => {
  let seed = 0x5100d1e;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
