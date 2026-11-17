// Sloo, driven by the ad's clock. Each state is a 96-frame, 24 fps RGBA sequence cut from the 1440px masters and
// their mattes (scripts/extract-sloo.sh). Every clip starts and ends on the hero pose, so segments joined end to start
// cut without a jump; "hold" shows the hero still with the same slow breathing the app gives its poster.
import type { CSSProperties } from "react";
import { useT } from "./time";

export type Clip = "idle" | "listening" | "thinking" | "writing" | "talking" | "happy" | "cheer" | "wave" | "happy-hd";
export type Seg = { clip: Clip; from?: number; to?: number; speed?: number } | { hold: number; clip?: Clip; frame?: number };

const SRC_FPS = 24;
const LAST = 95;

function segLength(seg: Seg): number {
  if ("hold" in seg) return seg.hold;
  return ((seg.to ?? LAST) - (seg.from ?? 0) + 1) / SRC_FPS / (seg.speed ?? 1);
}

/** Total seconds a track plays. */
export function trackLength(track: Seg[]): number {
  return track.reduce((sum, seg) => sum + segLength(seg), 0);
}

/** Which picture a track shows at `t` seconds, and how much it breathes (holds only). */
export function trackFrame(track: Seg[], t: number): { clip: Clip; frame: number; breath: number } {
  let at = 0;
  for (let i = 0; i < track.length; i++) {
    const seg = track[i]!;
    const len = segLength(seg);
    const last = i === track.length - 1;
    if (t < at + len || last) {
      const local = Math.max(0, t - at);
      if ("hold" in seg) return { clip: seg.clip ?? "idle", frame: seg.frame ?? 0, breath: Math.sin(local * 2 * Math.PI * 0.28) };
      const from = seg.from ?? 0;
      const to = seg.to ?? LAST;
      const n = Math.floor(local * SRC_FPS * (seg.speed ?? 1));
      // Past the end of the last segment, the track keeps looping its clip.
      const span = to - from + 1;
      const frame = last ? from + (n % span) : Math.min(to, from + n);
      return { clip: seg.clip, frame, breath: 0 };
    }
    at += len;
  }
  return { clip: "idle", frame: 0, breath: 0 };
}

export const frameUrl = (clip: Clip, frame: number) => `/sloo-frames/${clip}/${String(frame).padStart(3, "0")}.png`;

/** Where Sloo's feet sit in the 1024px frame, as fractions of its size. */
export const FEET_Y = 0.968;

interface Props {
  track: Seg[];
  /** Scene seconds at which the track starts. */
  start?: number;
  /** Centre of the feet, in px of the parent. */
  x: number;
  y: number;
  /** Size of the square frame in px (Sloo's body is about 57% of it tall). */
  size: number;
  flip?: boolean;
  shadow?: boolean | number;
  /** Extra transform applied around the feet: squash, hop, tilt. */
  scaleX?: number;
  scaleY?: number;
  lift?: number;
  rotate?: number;
  opacity?: number;
  style?: CSSProperties;
  /** Overrides the clock (seconds) for this track. */
  at?: number;
}

export function SlooClip({ track, start = 0, at, ...rest }: Props) {
  const sceneT = useT();
  const t = at ?? sceneT;
  return <SlooFrame {...trackFrame(track, t - start)} {...rest} />;
}

export type FrameProps = Omit<Props, "track" | "start" | "at"> & { clip: Clip; frame: number; breath: number };

export function SlooFrame({ clip, frame, breath, x, y, size, flip, shadow = true, scaleX = 1, scaleY = 1, lift = 0, rotate = 0, opacity = 1, style }: FrameProps) {
  const bx = 1 + breath * 0.008;
  const by = 1 + breath * 0.014;
  const shadowStrength = typeof shadow === "number" ? shadow : shadow ? 1 : 0;
  const shadowScale = 1 / (1 + lift / (size * 0.35));
  return (
    <div
      className="sloo-clip-layer"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size * FEET_Y,
        width: size,
        height: size,
        opacity,
        pointerEvents: "none",
        ...style,
      }}
    >
      {shadowStrength > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: `${FEET_Y * 100}%`,
            width: size * 0.42,
            height: size * 0.05,
            transform: `translate(-50%, -55%) scale(${shadowScale})`,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgb(70 45 110 / 0.30), rgb(70 45 110 / 0.12) 60%, transparent)",
            opacity: shadowStrength * (0.6 + 0.4 * shadowScale),
          }}
        />
      )}
      <img
        src={frameUrl(clip, frame)}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transformOrigin: `50% ${FEET_Y * 100}%`,
          transform: `translateY(${-lift}px) rotate(${rotate}deg) scale(${(flip ? -1 : 1) * scaleX * bx}, ${scaleY * by})`,
        }}
      />
    </div>
  );
}

/** A segment placed at an absolute time. It plays from `from` at `speed` until the next one starts. */
export interface Cue {
  at: number;
  clip: Clip;
  from?: number;
  to?: number;
  speed?: number;
  /** Hold one frame (with breathing) instead of playing. */
  hold?: boolean;
  /** Keep looping past `to` instead of holding the last frame. */
  loop?: boolean;
}

/** Lays segments end to end from `start`; each runs from `from` to `to` (default the whole clip). */
export function seq(start: number, segs: Omit<Cue, "at">[]): Cue[] {
  let at = start;
  return segs.map((seg) => {
    const cue = { ...seg, at };
    at += ((seg.to ?? LAST) - (seg.from ?? 0) + 1) / SRC_FPS / (seg.speed ?? 1);
    return cue;
  });
}

/** The end time of a cue that plays to its last frame. */
export function cueEnd(cue: Cue): number {
  return cue.at + ((cue.to ?? LAST) - (cue.from ?? 0) + 1) / SRC_FPS / (cue.speed ?? 1);
}

export function cueFrame(cues: Cue[], t: number): { clip: Clip; frame: number; breath: number } {
  let i = cues.length - 1;
  while (i > 0 && cues[i]!.at > t) i--;
  const cue = cues[i]!;
  const local = Math.max(0, t - cue.at);
  const breath = Math.sin(local * 2 * Math.PI * 0.3);
  const from = cue.from ?? 0;
  if (cue.hold) return { clip: cue.clip, frame: from, breath };
  const to = cue.to ?? LAST;
  const n = Math.floor(local * SRC_FPS * (cue.speed ?? 1) + 1e-6);
  if (from + n <= to) return { clip: cue.clip, frame: from + n, breath: 0 };
  if (cue.loop) return { clip: cue.clip, frame: from + (n % (to - from + 1)), breath: 0 };
  // Past its end a clip rests on its last frame, which is the hero pose, and breathes like the app's still.
  return { clip: cue.clip, frame: to, breath: Math.sin((local - (to - from + 1) / SRC_FPS / (cue.speed ?? 1)) * 2 * Math.PI * 0.3) };
}
