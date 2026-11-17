import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { MasteryStatus } from "../api";
import { loadManifest, MANIFEST_URL, posterFor, type Manifest, type SlooReaction, type SlooState } from "./sloo/manifest";
import { chooseVideoMode, SlooPlayer, type VideoMode } from "./sloo/player";
import { SlooFigure } from "./sloo/SlooFigure";
import { animate } from "./sloo/ticker";

type Mood = SlooState;

/** Subscribes to the loudness of Sloo's voice, 0 to 1, while it speaks; returns the unsubscribe function. */
type LevelSource = (listener: (level: number) => void) => () => void;

interface SlooProps {
  mood?: Mood;
  /** Width in CSS pixels; a stylesheet rule that sets the width wins. */
  size?: number;
  /** Loudness of the voice while talking: the beak (drawn) or a gentle bounce (clips) follows it. */
  level?: LevelSource;
  /** A one-shot reaction that plays over the mood and hands back to it. A new `id` plays it again. */
  reaction?: { kind: SlooReaction; id: number | string };
  /** Address of a media manifest, or false for the drawn Sloo. */
  media?: string | false;
  className?: string;
}

const REACTION_MS: Record<SlooReaction, number> = { correct: 1400, encourage: 1700 };
const SMALL_PX = 56;
const GESTURE_MS = 2100;
const resolved = new Map<string, Manifest | undefined>();

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * Sloo, the tutor. Plays the generated clips when the media manifest has them, shows the approved still when it has only
 * a poster, and otherwise draws Sloo. The call shape `<Sloo mood size />` works everywhere.
 */
function Sloo({ mood = "idle", size = 96, level, reaction, media = MANIFEST_URL, className }: SlooProps) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<SlooPlayer>(undefined);
  const moodNow = useRef(mood);
  moodNow.current = mood;

  const [manifest, setManifest] = useState<Manifest | undefined | null>(() => (media === false ? undefined : resolved.has(media) ? resolved.get(media) : null));
  const [mode, setMode] = useState<VideoMode | undefined | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [small, setSmall] = useState(size < SMALL_PX);
  const [hidden, setHidden] = useState(false);
  const [shownReaction, setShownReaction] = useState<SlooReaction>();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (media === false) {
      setManifest(undefined);
      return;
    }
    let live = true;
    void loadManifest(media).then((value) => {
      resolved.set(media, value);
      if (live) setManifest(value);
    });
    return () => {
      live = false;
    };
  }, [media]);

  const wantsVideo = !!manifest?.states.idle && !reduced && !small && !failed;
  useEffect(() => {
    if (!wantsVideo || !manifest) return;
    let live = true;
    void chooseVideoMode(manifest).then((value) => live && setMode(value));
    return () => {
      live = false;
    };
  }, [wantsVideo, manifest]);

  const kind = manifest === null ? "loading" : !manifest ? "drawn" : wantsVideo && mode !== undefined ? "video" : manifest.poster || manifest.states.idle ? "still" : "drawn";

  // Size and visibility: small placements show a still, and nothing animates while the window or Sloo is out of sight.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => entry && setSmall(entry.contentRect.width > 0 && entry.contentRect.width < SMALL_PX));
    resize.observe(element);
    let onScreen = true;
    const update = () => setHidden(document.hidden || !onScreen);
    const intersect = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      update();
    });
    intersect.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => {
      resize.disconnect();
      intersect.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (kind !== "video" || !mode || !manifest || !host.current) return;
    setReady(false);
    let instance: SlooPlayer;
    try {
      instance = new SlooPlayer(host.current, manifest, mode, {
        onReady: () => setReady(true),
        onUncovered: () => setReady(false),
        onFail: (error) => {
          console.warn(error.message);
          setFailed(true);
        },
      });
    } catch (error) {
      console.warn((error as Error).message);
      setFailed(true);
      return;
    }
    player.current = instance;
    instance.start(moodNow.current);
    return () => {
      instance.destroy();
      player.current = undefined;
    };
  }, [kind, mode, manifest]);

  useEffect(() => player.current?.setState(mood), [mood, mode]);
  useEffect(() => player.current?.setActive(!hidden), [hidden, mode]);

  useEffect(() => {
    if (!reaction) return;
    player.current?.react(reaction.kind);
    setShownReaction(reaction.kind);
    const timer = setTimeout(() => setShownReaction(undefined), REACTION_MS[reaction.kind]);
    return () => clearTimeout(timer);
  }, [reaction?.id]);

  // Breathing and other slow motion come from a shared low-rate ticker; see ticker.ts for why not CSS animations.
  const animated = (kind === "drawn" || kind === "still") && !hidden && !reduced;
  useEffect(() => {
    const element = root.current;
    if (!element || !animated) return;
    return animate(element);
  }, [animated]);

  // Moods that can stay on screen for a long time (waving on the home page) gesture now and then, not without pause.
  const gestures = animated && (mood === "wave" || mood === "happy" || mood === "cheer");
  useEffect(() => {
    const element = root.current;
    if (!element || !gestures) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      element.setAttribute("data-gesture", "");
      timer = setTimeout(() => {
        element.removeAttribute("data-gesture");
        timer = setTimeout(run, 4500 + Math.random() * 4000);
      }, GESTURE_MS);
    };
    run();
    return () => {
      clearTimeout(timer);
      element.removeAttribute("data-gesture");
    };
  }, [gestures, mood]);

  // The voice level drives a CSS variable directly, so following speech never re-renders React.
  const talking = mood === "talking";
  useEffect(() => {
    const element = root.current;
    if (!element || !level || !talking) return;
    let smooth = 0;
    let shown = -1;
    element.setAttribute("data-voiced", "");
    const off = level((value) => {
      const clamped = Math.max(0, Math.min(1, value));
      smooth += (clamped - smooth) * (clamped > smooth ? 0.6 : 0.25);
      if (Math.abs(smooth - shown) < 0.02) return;
      shown = smooth;
      element.style.setProperty("--sloo-level", smooth.toFixed(3));
    });
    return () => {
      off();
      element.removeAttribute("data-voiced");
      element.style.removeProperty("--sloo-level");
    };
  }, [level, talking]);

  const poster = manifest ? posterFor(manifest, kind === "still" ? mood : "idle") : undefined;
  const style = { "--sloo-size": `${size}px` } as CSSProperties;

  return (
    <div
      ref={root}
      className={className ? `sloo ${className}` : "sloo"}
      data-mood={mood}
      data-kind={kind}
      data-reaction={shownReaction}
      data-paused={hidden || undefined}
      data-ready={(kind === "video" && ready) || undefined}
      style={style}
      aria-hidden="true"
    >
      {kind === "drawn" && <SlooFigure mood={mood} reaction={shownReaction} still={hidden || reduced} />}
      {(kind === "still" || kind === "video") && (
        <>
          {manifest?.shadow && (
            <svg className="sloo-ground" viewBox="0 0 120 132">
              <ellipse className="sloo-shadow" cx="60" cy="126.6" rx="30" ry="3.6" />
            </svg>
          )}
          {poster && <img className="sloo-poster" src={poster} alt="" draggable={false} decoding="async" />}
          {kind === "video" && <div ref={host} className="sloo-clips" />}
        </>
      )}
    </div>
  );
}

const growthLabel: Record<MasteryStatus, string> = {
  new: "Seed: not started",
  learning: "Sprout: learning",
  practiced: "Bud: got it once",
  mastered: "Flower: mastered",
};

/** A skill grows from seed to flower as the learner masters it. */
function Growth({ status, size = 22 }: { status: MasteryStatus; size?: number }) {
  return (
    <svg className="growth" data-status={status} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={growthLabel[status]}>
      <path d="M4 21 H20" stroke="var(--soil)" strokeWidth="2" strokeLinecap="round" />
      {status === "new" && <ellipse cx="12" cy="17.5" rx="3" ry="2.2" fill="var(--soil)" />}
      {status !== "new" && <path d="M12 21 V11" stroke="var(--sloo-leaf)" strokeWidth="2" strokeLinecap="round" />}
      {status !== "new" && <path d="M12 15 C8 15 6 13 5.5 10 C9 10 11.5 11.5 12 15Z" fill="var(--sloo-leaf)" />}
      {(status === "practiced" || status === "mastered") && <path d="M12 13 C16 13 18 11 18.5 8 C15 8 12.5 9.5 12 13Z" fill="var(--sloo)" />}
      {status === "practiced" && <ellipse cx="12" cy="8.5" rx="2.6" ry="3.4" fill="var(--sloo)" />}
      {status === "mastered" && (
        <g>
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx="12" cy="3.6" rx="2.2" ry="3" fill="var(--petal)" transform={`rotate(${angle} 12 7.5)`} />
          ))}
          <circle cx="12" cy="7.5" r="2.3" fill="var(--sun)" />
        </g>
      )}
    </svg>
  );
}

export { Growth, Sloo, growthLabel };
export type { LevelSource, Mood, SlooProps, SlooReaction };
