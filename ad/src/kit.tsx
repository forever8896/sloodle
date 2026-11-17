// Small building blocks shared by the scenes: positioned layers, kinetic type, Sloo's cushion and sparkles.
import type { CSSProperties, ReactNode } from "react";
import { clamp, spring, squash, useT } from "./time";

interface LayerProps {
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  opacity?: number;
  blur?: number;
  /** Transform origin in px of the layer's own box. */
  ox?: number;
  oy?: number;
  width?: number;
  z?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Layer({ x = 0, y = 0, scale = 1, scaleX = 1, scaleY = 1, rotate = 0, opacity = 1, blur = 0, ox = 0, oy = 0, width, z, className, style, children }: LayerProps) {
  // A hidden layer stays mounted, so components that render asynchronously have finished before it is first seen.
  const hidden = opacity <= 0.001;
  return (
    <div
      className={`layer ${className ?? ""}`}
      style={{
        transform: `translate(${x - ox}px, ${y - oy}px) rotate(${rotate}deg) scale(${scale * scaleX}, ${scale * scaleY})`,
        transformOrigin: `${ox}px ${oy}px`,
        opacity: clamp(opacity),
        visibility: hidden ? "hidden" : undefined,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        width,
        zIndex: z,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A word that drops in and lands with a plush squash. `at` is when it lands. */
export function Word({ children, at, from = -90, out, className, style }: { children: ReactNode; at: number; from?: number; out?: number; className?: string; style?: CSSProperties }) {
  const t = useT();
  const s = spring(t, at - 0.12, { duration: 0.5, bounce: 0.42 });
  const sq = squash(t, at, 0.16, 0.5);
  let y = (1 - s) * from;
  let opacity = clamp((t - (at - 0.12)) / 0.08);
  let rot = 0;
  if (out !== undefined && t > out) {
    const k = clamp((t - out) / 0.28);
    y += k * k * 160;
    rot = k * 8;
    opacity *= 1 - k;
  }
  if (opacity <= 0) return <span className={`kin-word ${className ?? ""}`} style={{ opacity: 0, ...style }}>{children}</span>;
  return (
    <span
      className={`kin-word ${className ?? ""}`}
      style={{ transform: `translateY(${y}px) rotate(${rot}deg) scale(${1 + sq * 0.6}, ${1 - sq})`, opacity, ...style }}
    >
      {children}
    </span>
  );
}

/** The lavender cushion Sloo stands on in the app (.stage in base.css), at any size. */
export function Cushion({ size, style }: { size: number; style?: CSSProperties }) {
  return <div className="stage" style={{ width: size, height: size, display: "block", ...style }} />;
}

/** Sloo's sparkles from the drawn owl (sloo/SlooFigure.tsx), as single stars. */
export function Sparkle({ x, y, size, t0, life = 0.9, rotate = 0 }: { x: number; y: number; size: number; t0: number; life?: number; rotate?: number }) {
  const t = useT();
  const k = (t - t0) / life;
  if (k < 0 || k > 1) return null;
  const s = spring(t, t0, { duration: 0.35, bounce: 0.5 }) * (1 - Math.pow(k, 4));
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      style={{ position: "absolute", left: x - size / 2, top: y - size / 2, transform: `scale(${s}) rotate(${rotate + k * 40}deg)`, overflow: "visible" }}
    >
      <path d="M10 1 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="var(--sun)" stroke="#170c08" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

/** Springs a card in from an offset with scale and settles; optional exit. Returns transform values. */
export function enter(t: number, at: number, { dx = 0, dy = 60, s0 = 0.85, duration = 0.6, bounce = 0.3 } = {}) {
  const p = spring(t, at, { duration, bounce });
  return { x: (1 - p) * dx, y: (1 - p) * dy, scale: s0 + (1 - s0) * p, opacity: clamp((t - at) / 0.15) };
}
