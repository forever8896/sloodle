import { useEffect, useRef } from "react";
import { watchGaze } from "./gaze";
import type { SlooReaction, SlooState } from "./manifest";

const SPECKLES: [number, number][] = [
  [60, 84],
  [51, 87.5],
  [69.5, 87],
  [45, 94],
  [56, 94.5],
  [65.5, 93.5],
  [75.5, 94.5],
  [49.5, 101.5],
  [60.5, 101],
  [71, 101.5],
  [55, 108],
  [66.5, 108.5],
];

const EYES: [number, number][] = [
  [46.8, 59.4],
  [73.2, 59.4],
];

interface Props {
  mood: SlooState;
  reaction?: SlooReaction;
  /** Stops blinking and looking around (window hidden, off screen, or reduced motion). */
  still: boolean;
}

/** The drawn Sloo: a plush owl in a leaf-green beret, used until (or instead of) the generated clips. */
function SlooFigure({ mood, reaction, still }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const listening = useRef(false);
  listening.current = mood === "listening";

  useEffect(() => {
    const element = svg.current;
    if (!element || still) return;
    let timer: ReturnType<typeof setTimeout>;
    const blink = (twice: boolean) => {
      element.setAttribute("data-blink", "");
      timer = setTimeout(() => {
        element.removeAttribute("data-blink");
        timer = twice ? setTimeout(() => blink(false), 180) : setTimeout(() => blink(Math.random() < 0.2), 2200 + Math.random() * 4200);
      }, 130);
    };
    timer = setTimeout(() => blink(false), 800 + Math.random() * 3000);
    const stopGaze = watchGaze(element, () => listening.current, (x, y) => {
      element.style.setProperty("--sloo-look-x", String(x));
      element.style.setProperty("--sloo-look-y", String(y));
    });
    return () => {
      clearTimeout(timer);
      element.removeAttribute("data-blink");
      stopGaze();
    };
  }, [still]);

  const happyEyes = mood === "happy" || reaction === "correct";

  return (
    <svg ref={svg} className="sloo-figure" viewBox="0 0 120 132" aria-hidden="true">
      <ellipse className="sloo-shadow" cx="60" cy="126.6" rx="30" ry="3.6" />
      <g className="sloo-pose">
        <g className="sloo-feet">
          {[46.5, 73.5].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="121.6" rx="8.6" ry="4.6" fill="var(--owl-cream)" />
              <path d={`M${x - 2.6} 120.4 v3.6 M${x + 2.6} 120.4 v3.6`} stroke="var(--owl-cream-shade)" strokeWidth="0.9" strokeLinecap="round" />
            </g>
          ))}
        </g>

        <path className="sloo-torso" d="M60 34.2 C80.5 34.2 95.6 58 95.6 84.5 C95.6 106.5 80 120.4 60 120.4 C40 120.4 24.4 106.5 24.4 84.5 C24.4 58 39.5 34.2 60 34.2Z" />
        <path d="M60 35 V46.5 M60 71.5 V78" fill="none" stroke="var(--owl-seam)" strokeWidth="0.7" strokeDasharray="1.4 1.2" />
        <ellipse cx="60.4" cy="96.6" rx="22.8" ry="17.8" fill="var(--owl-cream)" />
        <g fill="var(--owl-speckle)">
          {SPECKLES.map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r="1.15" />
          ))}
        </g>

        <path
          d="M60 47.2 C53.5 42.6 39.4 42.2 34.3 49.4 C30.2 55.6 32.6 66.6 40.5 71 C47.4 74.6 54.8 72.4 60 68.2 C65.2 72.4 72.6 74.6 79.5 71 C87.4 66.6 89.8 55.6 85.7 49.4 C80.6 42.2 66.5 42.6 60 47.2Z"
          fill="var(--owl-mask)"
        />

        {happyEyes ? (
          <g fill="none" stroke="var(--owl-ink)" strokeWidth="2.6" strokeLinecap="round">
            <path d="M41 61.4 Q46.8 54.6 52.6 61.4" />
            <path d="M67.4 61.4 Q73.2 54.6 79 61.4" />
          </g>
        ) : (
          EYES.map(([x, y]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <g className="sloo-eye-size">
                <g className="sloo-eye">
                  <circle r="6.3" fill="var(--owl-ring)" />
                  <g className="sloo-pupil">
                    <circle r="4.7" fill="var(--owl-ink)" />
                    <circle cx="1.7" cy="-1.9" r="1.55" fill="white" />
                    <circle cx="-1.7" cy="1.8" r="0.65" fill="white" opacity="0.8" />
                  </g>
                </g>
              </g>
            </g>
          ))
        )}

        {/* Wings are sewn on in front of the body, as on the plush. The resting tilt sits on a parent group: with transform-box: fill-box a transform attribute's centre would shift. */}
        <g transform="rotate(9 22 72)">
          <ellipse className="sloo-wing sloo-wing-left" cx="21" cy="88.5" rx="6.8" ry="17.5" />
        </g>
        <g transform="rotate(-9 98 72)">
          <ellipse className="sloo-wing sloo-wing-right" cx="99" cy="88.5" rx="6.8" ry="17.5" />
        </g>
        <g className="sloo-beak">
          <ellipse className="sloo-beak-gap" cx="60" cy="68.6" rx="2.7" ry="2.3" fill="var(--owl-ink)" />
          <path className="sloo-beak-lower" d="M57 67.6 Q60 66.6 63 67.6 Q61.6 70.8 60 71.6 Q58.4 70.8 57 67.6Z" fill="var(--owl-cream-shade)" />
          <path d="M55.2 62.6 C55.2 58.8 64.8 58.8 64.8 62.6 C64.8 66 62 69.4 60 70.4 C58 69.4 55.2 66 55.2 62.6Z" fill="var(--owl-beak)" />
        </g>

        <g className="sloo-beret">
          <path d="M60 23.2 C59.2 19.4 60.4 16.4 63.2 15.6" fill="none" stroke="var(--owl-beret)" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M42.6 33.4 C41.4 25.8 50 22 60.6 22 C71.4 22 79.4 26.2 78 33.4 C72.2 36.8 48.6 36.8 42.6 33.4Z" fill="var(--owl-beret)" />
          <path d="M43.6 33.6 C49 35.6 71.4 35.6 77 33.6" fill="none" stroke="var(--owl-beret-shade)" strokeWidth="1.4" strokeLinecap="round" />
        </g>

        <g className="sloo-notepad">
          <g transform="rotate(-7 57 101)">
            <rect x="44" y="91.5" width="26" height="19" rx="2" fill="var(--owl-paper)" stroke="var(--owl-paper-edge)" strokeWidth="0.8" />
            <path className="sloo-scribble" d="M47.5 96.5 h13 M47.5 100.5 h18 M47.5 104.5 h9" fill="none" stroke="var(--owl-speckle)" strokeWidth="1" strokeLinecap="round" pathLength="1" />
          </g>
          <g className="sloo-pencil">
            <path d="M70.5 89 L80.5 79 L83 81.5 L73 91.5Z" fill="var(--owl-pencil)" />
            <path d="M70.5 89 L73 91.5 L69 93Z" fill="var(--owl-cream-shade)" />
            <path d="M80.5 79 L82 77.5 L84.5 80 L83 81.5Z" fill="var(--owl-cheek)" />
          </g>
        </g>
      </g>

      <g className="sloo-extra sloo-thought" fill="var(--owl-mask)">
        <circle cx="94" cy="32" r="1.8" />
        <circle cx="100.5" cy="24" r="2.6" />
        <circle cx="108.5" cy="14" r="3.6" />
      </g>
      <g className="sloo-extra sloo-ears" fill="none" stroke="var(--owl-beret)" strokeWidth="2" strokeLinecap="round">
        <path d="M101 47 Q104.5 53 101 59" />
        <path d="M106 43 Q112 53 106 63" />
      </g>
      <g className="sloo-extra sloo-sparkles" fill="var(--sun)" stroke="var(--owl-ink)" strokeWidth="0.8" strokeLinejoin="round">
        <path d="M12 34 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
        <path d="M107 26 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2z" />
        <path d="M103 58 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" />
      </g>
      <path className="sloo-extra sloo-heart" d="M98 40 C98 37 102.5 36.5 102.5 39.6 C102.5 36.5 107 37 107 40 C107 43.2 102.5 45.6 102.5 46.4 C102.5 45.6 98 43.2 98 40Z" fill="var(--petal)" />
    </svg>
  );
}

export { SlooFigure };
