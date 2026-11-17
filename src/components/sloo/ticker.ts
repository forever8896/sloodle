// Slow, continuous motion (breathing, swaying, a pencil moving) for every Sloo on screen, from one timer at 12 frames a
// second. In WebKitGTK any running CSS animation recomposites the page every frame: measured 17-45% of a core for one
// breathing Sloo, against 5% when the same motion is written to CSS variables at this rate.

const FRAME_MS = 1000 / 12;
const elements = new Set<HTMLElement>();
let timer: ReturnType<typeof setInterval> | undefined;
const start = performance.now();

const wave = (t: number, period: number) => Math.sin((t / period) * Math.PI * 2);

function tick(): void {
  if (document.hidden) return;
  const t = (performance.now() - start) / 1000;
  const values: [string, number][] = [
    ["--sloo-breath", 0.5 - 0.5 * Math.cos((t / 4.2) * Math.PI * 2)],
    ["--sloo-sway", wave(t, 3.2)],
    ["--sloo-sway2", wave(t + 0.8, 3.2)],
    ["--sloo-flick", wave(t, 0.9)],
    ["--sloo-flick2", wave(t + 0.225, 0.9)],
  ];
  for (const element of elements) for (const [name, value] of values) element.style.setProperty(name, value.toFixed(3));
}

/** Drives the motion variables on `element` until the returned function is called. */
function animate(element: HTMLElement): () => void {
  elements.add(element);
  timer ??= setInterval(tick, FRAME_MS);
  tick();
  return () => {
    elements.delete(element);
    if (elements.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export { animate };
