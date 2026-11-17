// The ad's clock. Everything on screen is a pure function of the frame number, so a frame renders the same way
// whether it is the first one a worker draws or the thousandth.
import { createContext, useContext, useSyncExternalStore } from "react";

export const FPS = 60;
export const W = 1920;
export const H = 1080;

let current = 0;
// Bumped on every set, even to the same frame, so a repeat pass re-renders and the frame drivers run again.
let version = 0;
const listeners = new Set<() => void>();

export function setFrame(frame: number): void {
  current = frame;
  version++;
  for (const listener of listeners) listener();
}

export function useGlobalFrame(): number {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return current;
}

/** Seconds since the start of the enclosing scene. */
export const SceneTime = createContext(0);
export const useT = () => useContext(SceneTime);

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Maps t through [from, to] onto [a, b], clamped, with an optional easing. */
export function lerp(t: number, from: number, to: number, a = 0, b = 1, ease: (x: number) => number = (x) => x): number {
  const x = clamp((t - from) / (to - from));
  return a + (b - a) * ease(x);
}

/** Piecewise interpolation over keyframes [[t, value], ...], eased per segment. */
export function keys(t: number, frames: [number, number][], ease: (x: number) => number = easeInOut): number {
  if (t <= frames[0]![0]) return frames[0]![1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]!;
    const [t0, v0] = frames[i - 1]!;
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return frames[frames.length - 1]![1];
}

export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutQuint = (x: number) => 1 - Math.pow(1 - x, 5);
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

/**
 * A damped spring from 0 to 1, started at `start` seconds. `bounce` 0 is critically damped; 0.3 to 0.5 overshoots like
 * the app's --ease-squish. `duration` is roughly the settling time.
 */
export function spring(t: number, start = 0, { duration = 0.6, bounce = 0.35 } = {}): number {
  const x = t - start;
  if (x <= 0) return 0;
  const zeta = 1 - clamp(bounce, 0, 0.95);
  const omega = 4 / (zeta * duration);
  if (zeta >= 1) return 1 - (1 + omega * x) * Math.exp(-omega * x);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * x) * (Math.cos(wd * x) + ((zeta * omega) / wd) * Math.sin(wd * x));
}

/** A spring-driven squash for landings: 0 at rest, positive while squashed. Decays to rest. */
export function squash(t: number, start: number, amount = 0.12, duration = 0.45): number {
  const x = t - start;
  if (x <= 0) return 0;
  return amount * Math.exp(-x * 7 / duration) * Math.cos(x * (2 * Math.PI) / (duration * 0.9));
}

/** A deterministic pseudo-random number for index i. */
export function rand(i: number, seed = 1): number {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Where Sloo is this frame (feet centre and frame size), for things that move with him, like his cushion. */
export const SlooPose = createContext({ x: 960, y: 1000, size: 800 });
export const useSlooPose = () => useContext(SlooPose);
