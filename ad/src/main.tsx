// The same fonts and stylesheets as the app (src/main.tsx), in the same order, then the ad's own layer.
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "@fontsource-variable/nunito/wght-italic.css";
import "@ui-sdk/core/web.css";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/styles.css";
import "../../src/styles/app.css";
import "../../src/styles/onboarding.css";
import "../../src/styles/chat.css";
import "./ad.css";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";
import { Ad, DURATION } from "./Ad";
import { FPS, setFrame } from "./time";

const root = ReactDOM.createRoot(document.getElementById("root")!);
flushSync(() => root.render(<Ad />));

// Anything still loading or drawing asynchronously inside the real components.
const BUSY = [".block-diagram-canvas[aria-busy='true']", ".block-image-frame[aria-busy='true']", ".block-code pre > code:not(.hljs)", ".block-code-output:not([hidden]):not(:has(.block-code-status))"];

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settle(): Promise<void> {
  await document.fonts.ready;
  for (let tries = 0; tries < 200; tries++) {
    const busy = BUSY.some((selector) => document.querySelector(selector));
    const images = [...document.images].filter((img) => !img.complete);
    if (!busy && images.length === 0) break;
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  await raf();
  await raf();
}

declare global {
  interface Window {
    __seek: (frame: number) => Promise<void>;
    __info: { fps: number; frames: number };
  }
}

window.__info = { fps: FPS, frames: Math.round(DURATION * FPS) };
window.__seek = async (frame: number) => {
  flushSync(() => setFrame(frame));
  await raf();
  // A second pass lets the frame drivers' synthetic input events re-render the components they type into.
  flushSync(() => setFrame(frame));
  await settle();
  // And once more after anything asynchronous (code output, diagrams) has landed, so the drivers style it too.
  flushSync(() => setFrame(frame));
  await raf();
};

// For looking at it in a normal browser: ?f=<frame> or ?t=<seconds>; ?play runs it in real time (not frame-exact).
const params = new URLSearchParams(location.search);
if (params.has("play")) {
  const begin = performance.now() - Number(params.get("t") ?? 0) * 1000;
  const tick = () => {
    setFrame(Math.floor(((performance.now() - begin) / 1000) * FPS) % window.__info.frames);
    requestAnimationFrame(tick);
  };
  tick();
} else if (params.has("f") || params.has("t")) {
  void window.__seek(params.has("f") ? Number(params.get("f")) : Math.round(Number(params.get("t")) * FPS));
}
