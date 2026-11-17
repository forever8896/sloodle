// One Sloo for the whole page. Each beat marks a zone (the stretch of page it covers) and a stop (where Sloo stands in
// it, sized by CSS). Whichever zone crosses the middle of the viewport owns Sloo: he hops from the last stop to its
// stop with the ad's plush landing, and takes its mood. The app's own player (components/Sloo.tsx) plays the clips.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Sloo } from "../../src/components/Sloo";
import type { SlooReaction, SlooState } from "../../src/components/sloo/manifest";
import { prefersReducedMotion } from "./motion";

export type Mood = SlooState;

const BASE = 440;
const MANIFEST = "./sloo/manifest.json";

interface Zone {
  id: string;
  mood: Mood;
  zone?: Element;
  stop?: Element;
}

const zones = new Map<string, Zone>();
let active = "hero";
let reaction: { kind: SlooReaction; id: number } | undefined;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const owl = {
  /** Changes the mood Sloo has while he stands in a zone. */
  setMood(id: string, mood: Mood) {
    const zone = zones.get(id);
    if (!zone || zone.mood === mood) return;
    zone.mood = mood;
    emit();
  },
  /** A one-shot reaction over the mood (a cheer for a right answer). */
  react(kind: SlooReaction = "correct") {
    reaction = { kind, id: (reaction?.id ?? 0) + 1 };
    emit();
  },
  get active() {
    return active;
  },
};

export function useOwlHere(id: string): boolean {
  useSyncExternalStore(subscribe, () => version);
  return active === id;
}

/** Registers a zone; returns refs for the zone element and its stop. */
export function useOwlZone(id: string, mood: Mood): { zone: RefObject<HTMLElement | null>; stop: RefObject<HTMLDivElement | null> } {
  const zone = useRef<HTMLElement>(null);
  const stop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const entry: Zone = zones.get(id) ?? { id, mood };
    zones.set(id, entry);
    const changed = entry.zone !== (zone.current ?? undefined) || entry.stop !== (stop.current ?? undefined);
    entry.zone = zone.current ?? undefined;
    entry.stop = stop.current ?? undefined;
    if (changed) emit();
  });
  useLayoutEffect(
    () => () => {
      const entry = zones.get(id);
      if (entry) {
        entry.zone = undefined;
        entry.stop = undefined;
      }
    },
    [id],
  );
  return { zone, stop };
}

/** Where Sloo stands in a zone. Sized by its class; `cushion` puts the app's lavender cushion behind him. */
export function OwlStop({ id, stopRef, cushion, className, children, style }: { id: string; stopRef: RefObject<HTMLDivElement | null>; cushion?: boolean; className?: string; children?: ReactNode; style?: CSSProperties }) {
  const here = useOwlHere(id);
  return (
    <div ref={stopRef} className={`owl-stop ${className ?? ""}`} data-here={here || undefined} style={style}>
      {cushion && <div className="owl-cushion stage" aria-hidden="true" />}
      {children}
    </div>
  );
}

function place(stop: Element, page: Element) {
  const s = stop.getBoundingClientRect();
  const p = page.getBoundingClientRect();
  return { x: s.left - p.left, y: s.top - p.top, scale: s.width / BASE };
}

const transformOf = ({ x, y, scale }: { x: number; y: number; scale: number }, sx = 1, sy = 1) =>
  `translate(${x}px, ${y}px) scale(${scale * sx}, ${scale * sy})`;

/** The travelling owl. Mount once, inside the positioned page wrapper `page`. */
export function Owl({ page }: { page: RefObject<HTMLElement | null> }) {
  useSyncExternalStore(subscribe, () => version);
  const layer = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const shown = useRef<string>(undefined);
  const [visible, setVisible] = useState(false);

  // Which zone owns Sloo: the one crossing a thin band at the middle of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.owlZone;
          if (id && id !== active && zones.get(id)?.stop) {
            active = id;
            emit();
          }
        }
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    for (const zone of zones.values()) if (zone.zone) observer.observe(zone.zone);
    return () => observer.disconnect();
  }, [version]);

  // Moves to the active stop: a hop on a change of zone, a plain jump when the layout changes under him.
  useLayoutEffect(() => {
    const element = layer.current;
    const wrapper = page.current;
    const zone = zones.get(active);
    if (!element || !wrapper || !zone?.stop) return;

    const settle = () => {
      if (!zone.stop) return;
      const to = place(zone.stop, wrapper);
      element.style.transform = transformOf(to);
    };

    const from = shown.current;
    shown.current = active;
    if (!from || prefersReducedMotion()) {
      settle();
      setVisible(true);
    } else if (from !== active) {
      const now = getComputedStyle(element).transform;
      const to = place(zone.stop, wrapper);
      const end = transformOf(to);
      element.getAnimations().forEach((animation) => animation.cancel());
      element.style.transform = end;
      const lift = { ...to, y: to.y - Math.min(140, 40 + to.scale * 60) };
      element.animate(
        [
          { transform: now === "none" ? end : now, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
          { transform: transformOf(lift, 0.96, 1.05), offset: 0.62, easing: "cubic-bezier(0.55, 0, 0.9, 0.5)" },
          { transform: transformOf(to, 1.1, 0.88), offset: 0.8, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" },
          { transform: transformOf(to, 0.97, 1.03), offset: 0.9 },
          { transform: end },
        ],
        { duration: 820 },
      );
    }

    const resize = new ResizeObserver(() => {
      if (element.getAnimations().length === 0) settle();
    });
    resize.observe(wrapper);
    resize.observe(zone.stop);
    return () => resize.disconnect();
  });

  // In the hero, Sloo leans towards the pointer.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    let last: PointerEvent | undefined;
    const apply = () => {
      frame = 0;
      const element = tilt.current;
      if (!element || !last) return;
      if (active !== "hero") {
        element.style.removeProperty("--lean");
        element.style.removeProperty("--nudge");
        return;
      }
      const box = element.getBoundingClientRect();
      const dx = (last.clientX - (box.left + box.width / 2)) / Math.max(400, innerWidth / 2);
      const dy = (last.clientY - (box.top + box.height / 2)) / Math.max(400, innerHeight / 2);
      element.style.setProperty("--lean", `${Math.max(-1, Math.min(1, dx)) * 5}deg`);
      element.style.setProperty("--nudge", `${Math.max(-1, Math.min(1, dx)) * 10}px, ${Math.max(-1, Math.min(1, dy)) * 6}px`);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      last = event;
      frame ||= requestAnimationFrame(apply);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => {
      removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);

  // A new clip only starts while Sloo is on screen: a browser does not hand over a video's first frame while it is out
  // of sight, and the app's player would then give up on clips and keep to stills. Off screen, he keeps his mood.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const wanted = zones.get(active)?.mood ?? "idle";
  const kept = useRef<Mood>(wanted);
  if (onScreen) kept.current = wanted;
  const mood = kept.current;
  return (
    <div ref={layer} className="owl" data-visible={visible || undefined} aria-hidden="true">
      <div ref={tilt} className="owl-tilt">
        <Sloo mood={mood} size={BASE} media={MANIFEST} reaction={reaction} />
      </div>
    </div>
  );
}
