// The ad's motion language on a scrolling page. The curves are the ad's own (ad/src/time.ts); what changes is the
// clock: each beat starts its clock when it scrolls into view, instead of at a frame of a 47-second film.
import { useEffect, useRef, useState, type RefObject } from "react";
import { clamp, spring } from "../../ad/src/time";

export { clamp, easeIn, easeInOut, easeOut, keys, lerp, spring, squash } from "../../ad/src/time";

const query = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;

export function prefersReducedMotion(): boolean {
  return !!query?.matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** The finished state of every scripted beat: what reduced motion shows straight away. */
export const SETTLED = 1e6;

/**
 * Seconds since `ref` came into view (0 before), running for `duration` seconds and then resting at SETTLED. One
 * requestAnimationFrame loop per beat, only while it plays; with reduced motion it is SETTLED from the start.
 */
export function useBeatClock(ref: RefObject<Element | null>, duration: number, { amount = 0.3, delay = 0 } = {}): number {
  const reduced = useReducedMotion();
  const [t, setT] = useState(() => (prefersReducedMotion() ? SETTLED : 0));
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setT(SETTLED);
      return;
    }
    const element = ref.current;
    if (!element || started.current) return;
    let frame = 0;
    let begin = 0;
    const tick = (now: number) => {
      const seconds = (now - begin) / 1000 - delay;
      if (seconds >= duration) {
        frame = 0;
        setT(SETTLED);
        return;
      }
      setT(Math.max(0, seconds));
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();
        begin = performance.now();
        frame = requestAnimationFrame(tick);
      },
      // Starts when the element's top has come `amount` of the way up the viewport, however tall the element is.
      { rootMargin: `0px 0px -${Math.round(amount * 100)}% 0px`, threshold: 0 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame) {
        cancelAnimationFrame(frame);
        started.current = false;
      }
    };
  }, [ref, reduced, duration, amount, delay]);

  return t;
}

/** True once the element has come within `margin` of the viewport; for mounting heavy parts just before they are seen. */
export function useNear(ref: RefObject<Element | null>, margin = "120% 0px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: margin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** The ad's spring as a CSS linear() easing, so plain CSS transitions overshoot and settle the same way. */
export function springEasing({ duration = 0.6, bounce = 0.35, samples = 48 } = {}): string {
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : spring((i / samples) * duration * 1.6, 0, { duration, bounce });
    points.push(v.toFixed(4));
  }
  return `linear(${points.join(", ")})`;
}

export function installSpringEasing(): void {
  const easing = springEasing();
  const root = document.documentElement.style;
  if (typeof CSS !== "undefined" && CSS.supports("transition-timing-function", easing)) {
    root.setProperty("--ease-spring", easing);
    root.setProperty("--ease-spring-soft", springEasing({ bounce: 0.18 }));
  }
}

/** The ad's card entrance (kit.tsx enter()) as inline style: springs in from an offset with scale and settles. */
export function enterStyle(t: number, at: number, { dx = 0, dy = 60, s0 = 0.85, duration = 0.6, bounce = 0.3, rotate = 0 } = {}) {
  if (t >= SETTLED) return rotate ? { transform: `rotate(${rotate}deg)` } : undefined;
  const p = spring(t, at, { duration, bounce });
  const opacity = clamp((t - at) / 0.15);
  return {
    transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px) scale(${s0 + (1 - s0) * p}) rotate(${rotate}deg)`,
    opacity,
    visibility: opacity <= 0 ? ("hidden" as const) : undefined,
  };
}
