// 1. Cold open: "Hey Stupid, it's time to learn."  2. The promise: the harness for learning anything, typed into
// the real composer. Sloo is the actor in Ad.tsx; this scene places the type, the cushion and the composer around him.
import { Button } from "@ui-sdk/react/button";
import { Field } from "@ui-sdk/react/field";
import { Textarea } from "@ui-sdk/react/textarea";
import { useLayoutEffect, useRef } from "react";
import { Cushion, Layer, Sparkle, Word } from "../kit";
import { clamp, easeInOut, keys, lerp, spring, squash, useSlooPose, useT } from "../time";
import { useTyped } from "../drive";

export const OPEN = {
  hey: 0.74,
  stupid: 1.12,
  closeup: 1.78,
  wide: 2.78,
  time: 2.9,
  learn: 3.36,
  promise: 4.7,
  wordmark: 5.2,
  harness: 5.45,
  anything: 5.7,
  composer: 6.05,
  press: 9.55,
  out: 9.85,
};

/** What is typed into the composer, as [time, text]. Each subject swaps in on a beat. */
export const SUBJECTS: [number, string][] = [
  [7.0, "Sourdough"],
  [7.27, "Rust"],
  [7.52, "Music theory"],
  [7.77, "Sandbox architecture"],
  [8.02, "Chess openings"],
  [8.27, "Stand-up comedy"],
];
const FIRST = { at: 6.4, text: "Tarot", rate: 0.06 };
const FINAL = { at: 8.6, text: "Reading sheet music", rate: 0.034 };

function composerText(t: number): string {
  if (t < FIRST.at) return "";
  if (t < SUBJECTS[0]![0]) return FIRST.text.slice(0, Math.floor((t - FIRST.at) / FIRST.rate) + 1);
  if (t < FINAL.at) {
    let text = "";
    for (const [at, subject] of SUBJECTS) if (t >= at) text = subject;
    return text;
  }
  return FINAL.text.slice(0, Math.max(0, Math.floor((t - FINAL.at) / FINAL.rate) + 1));
}

/** Every moment the composer's text changes in a way worth a sound: [time, kind]. */
export function composerHits(): [number, "key" | "swap"][] {
  const hits: [number, "key" | "swap"][] = [];
  for (let i = 0; i < FIRST.text.length; i++) hits.push([FIRST.at + i * FIRST.rate, "key"]);
  for (const [at] of SUBJECTS) hits.push([at, "swap"]);
  for (let i = 0; i < FINAL.text.length; i++) hits.push([FINAL.at + i * FINAL.rate, "key"]);
  return hits;
}

function Composer() {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = composerText(t);
  useTyped(ref, text);
  useLayoutEffect(() => {
    if (t > OPEN.composer + 0.2) ref.current?.focus({ preventScroll: true });
  });
  const swap = SUBJECTS.reduce((last, [at]) => (t >= at ? at : last), -10);
  const bump = squash(t, swap, 0.03, 0.3);
  const press = squash(t, OPEN.press, 0.09, 0.35);
  return (
    <div className="home ad-composer" style={{ height: "auto", padding: 0, display: "block", overflow: "visible", width: 620 }}>
      <form onSubmit={(event) => event.preventDefault()} style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%", maxWidth: "none" }}>
        <Field name="topic" style={{ width: "100%", transform: `scale(${1 + bump * 0.5}, ${1 - bump * 0.3})` }}>
          <Textarea ref={ref} aria-label="What do you want to learn?" defaultValue="" placeholder="Anything. A language, calculus, how engines work, reading sheet music…" rows={3} style={{ width: "100%" }} />
        </Field>
        <div className="home-actions">
          <Button
            type="submit"
            data-variant="solid"
            className="big"
            disabled={!text.trim()}
            style={{ transform: `translateY(${t > OPEN.press && t < OPEN.press + 0.12 ? 4 : 0}px) scale(${1 + press}, ${1 - press})` }}
          >
            Let's begin
          </Button>
        </div>
      </form>
    </div>
  );
}

export function OpenScene() {
  const t = useT();
  const pose = useSlooPose();

  // Shot A and C type: two big lines on the left.
  const heyOut = OPEN.closeup;
  const showA = t < OPEN.closeup;
  const showC = t >= OPEN.wide && t < OPEN.promise + 0.6;

  // The promise side: wordmark, headline, composer.
  const outK = clamp((t - OPEN.out) / 0.55);
  const outE = easeInOut(outK);
  const harnessSwap = SUBJECTS.reduce((last, [at]) => (t >= at ? at : last), -10);
  const anyBump = squash(t, harnessSwap, 0.1, 0.32);
  const composerIn = spring(t, OPEN.composer, { duration: 0.65, bounce: 0.3 });

  // Sloo's cushion grows under him as he moves left.
  const cushion = spring(t, OPEN.promise + 0.15, { duration: 0.7, bounce: 0.35 });
  const cushionOut = clamp((t - OPEN.out) / 0.5);

  return (
    <>
      {cushion > 0 && cushionOut < 1 && (
        <Layer x={pose.x} y={pose.y - 345 * (pose.size / 760)} ox={400} oy={400} scale={cushion * (pose.size / 760) * (1 - easeInOut(cushionOut))} z={5}>
          <Cushion size={800} />
        </Layer>
      )}

      {showA && (
        <div className="kin" style={{ left: 150, top: 210, fontSize: 250, zIndex: 20 }}>
          <div>
            <Word at={OPEN.hey}>Hey</Word>
          </div>
          <div style={{ marginTop: 10 }}>
            <Word at={OPEN.stupid} className="accent" style={{ rotate: `${-4 * spring(t, OPEN.stupid, { duration: 0.6, bounce: 0.6 })}deg` }}>
              Stupid,
            </Word>
          </div>
        </div>
      )}
      {!showA && t < OPEN.wide && (
        <>
          <Sparkle x={560} y={260} size={110} t0={OPEN.closeup + 0.12} life={0.85} />
          <Sparkle x={1380} y={210} size={80} t0={OPEN.closeup + 0.26} life={0.75} rotate={20} />
          <Sparkle x={1440} y={420} size={60} t0={OPEN.closeup + 0.4} life={0.6} rotate={-15} />
          <Sparkle x={470} y={470} size={56} t0={OPEN.closeup + 0.5} life={0.5} />
        </>
      )}
      {showC && (
        <div className="kin" style={{ left: 150, top: 210, fontSize: 250, zIndex: 20 }}>
          <div>
            <Word at={OPEN.time} out={OPEN.promise - 0.2}>
              it's time
            </Word>
          </div>
          <div style={{ marginTop: 10 }}>
            <Word at={OPEN.learn} out={OPEN.promise - 0.12}>
              to <span className="accent">learn.</span>
            </Word>
          </div>
        </div>
      )}

      {t >= OPEN.wordmark - 0.2 && outK < 1 && (
        <Layer x={1000 + outE * 1100} y={0} z={20}>
          <div className="kin" style={{ left: 0, top: 150, fontSize: 64 }}>
            <Word at={OPEN.wordmark} from={-40}>
              sloodle
            </Word>
          </div>
          <div className="kin" style={{ left: 0, top: 250, fontSize: 104, lineHeight: 1.02 }}>
            <div>
              <Word at={OPEN.harness}>The harness for</Word>
            </div>
            <div>
              <Word at={OPEN.anything}>learning </Word>{" "}
              <Word at={OPEN.anything + 0.12} className="accent" style={{ scale: `${1 + anyBump * 0.5} ${1 - anyBump}` }}>
                anything.
              </Word>
            </div>
          </div>
          {composerIn > 0 && (
            <Layer x={0} y={545 + (1 - composerIn) * 140} scale={1.4 * (0.9 + 0.1 * composerIn)} opacity={clamp((t - OPEN.composer) / 0.15)}>
              <Composer />
            </Layer>
          )}
        </Layer>
      )}
    </>
  );
}

/** Sloo's place and clip choices during the open, in global seconds (this scene starts at 0). */
export function openPose(t: number) {
  if (t < OPEN.closeup) {
    const pop = spring(t, 0.1, { duration: 0.55, bounce: 0.45 });
    return { x: 1390, y: 1010 + (1 - pop) * 120, size: 900 * (0.55 + 0.45 * pop), opacity: clamp((t - 0.1) / 0.06), scaleY: 1 - squash(t, 0.32, 0.07, 0.4), scaleX: 1 + squash(t, 0.32, 0.05, 0.4) };
  }
  if (t < OPEN.wide) {
    // The close-up: a slow push on Sloo's grin.
    const push = lerp(t, OPEN.closeup, OPEN.wide, 0, 1);
    return { x: 960, y: 1330 + push * 20, size: 1430 + push * 60, opacity: 1 };
  }
  const move = spring(t, OPEN.promise, { duration: 0.85, bounce: 0.2 });
  const x = 1390 + (520 - 1390) * move;
  const y = keys(t, [[OPEN.promise, 1010], [OPEN.promise + 0.85, 905]], easeInOut);
  const size = 900 + (760 - 900) * move;
  return { x, y, size, opacity: 1 };
}
