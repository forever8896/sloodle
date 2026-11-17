// 4. It teaches you: Sloo asks out loud, you fill the blanks, the engine grades it, Sloo cheers, and it remembers how
// you learn (the "How Sloo teaches you" dials from the profile).
import { Button } from "@ui-sdk/react/button";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Toggle } from "@ui-sdk/react/toggle";
import { useLayoutEffect, useRef } from "react";
import { Markdown } from "../../../src/components/Markdown";
import { enter, Layer, Word } from "../kit";
import { after, Lesson, samples, show } from "../lesson";
import { typeInto } from "../drive";
import { clamp, easeIn, easeInOut, spring, squash, useT } from "../time";

export const TEACH = {
  start: 19.6,
  readAloud: 0.2,
  voice1: 0.35,
  tutor1: [0.65, 3.0],
  blanks: 1.6,
  typeE: 3.7,
  typeD: 4.0,
  check: 4.35,
  graded: 4.5,
  voice2: 5.1,
  tutor2: [5.43, 7.0],
  memory: 6.75,
  dial: 7.55,
  end: 8.9,
};

const TUTOR1 = "Quick one. The five line names, **bottom to top**?";
const TUTOR2 = "Yes! And without the mnemonic this time.";

const blanks = show(samples.blanks);
const blanksDone = after(blanks, [{ do: "fill", answers: ["E", "D"] }]);

/** Streams text in as the voice reads it, keeping Markdown emphasis intact by revealing whole words. */
function streamed(text: string, t: number, [from, to]: number[]): string {
  const words = text.split(" ");
  const n = Math.ceil(clamp((t - from!) / (to! - from!)) * words.length);
  const shown = words.slice(0, n).join(" ");
  return (shown.match(/\*\*/g)?.length ?? 0) % 2 ? `${shown}**` : shown;
}

function TutorTurn({ text, speaking }: { text: string; speaking: boolean }) {
  return (
    <div className="tutor-turn" data-speaking={speaking || undefined}>
      <Markdown text={text || " "} className="tutor" />
      <Button className="replay" data-variant="ghost" aria-label="Read this aloud">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      </Button>
    </div>
  );
}

function FillingBlanks({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const graded = t >= TEACH.graded;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!graded) {
      const fields = root.querySelectorAll<HTMLInputElement>(".block-blank input");
      if (fields[0]) typeInto(fields[0], t >= TEACH.typeE ? "E" : "");
      if (fields[1]) typeInto(fields[1], t >= TEACH.typeD ? "D" : "");
      const check = [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Check");
      if (check) {
        const p = squash(t, TEACH.check, 0.1, 0.3);
        check.style.transform = `scale(${1 + p}, ${1 - p})`;
      }
    } else {
      const verdict = root.querySelector<HTMLElement>(".verdict");
      if (verdict) {
        const s = spring(t, TEACH.graded, { duration: 0.45, bounce: 0.5 });
        verdict.style.transform = `scale(${0.4 + 0.6 * s})`;
        verdict.style.transformOrigin = "left center";
      }
      root.querySelectorAll<HTMLElement>(".block-blank").forEach((blank, i) => {
        const s = squash(t, TEACH.graded + i * 0.08, 0.12, 0.4);
        blank.style.display = "inline-block";
        blank.style.transform = `scale(${1 + s}, ${1 - s})`;
      });
    }
  });
  return (
    <div ref={ref} className="float-card">
      <Lesson component={blanks} progress={graded ? blanksDone : undefined} />
    </div>
  );
}

const DIALS = [
  { label: "Explanations", levels: ["brief", "standard", "thorough"], from: "standard", to: "brief", reason: "Succeeds without explanations first (80% over 5)." },
  { label: "Pace", levels: ["slower", "steady", "brisk"], from: "steady", to: "steady", reason: "" },
];

function Memory({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const switched = t >= TEACH.dial;
  // The indicator glides from the old level to the new one; the control itself only knows its value.
  useLayoutEffect(() => {
    const control = ref.current?.querySelector<HTMLElement>("[data-slot='segmented-control']");
    const indicator = control?.querySelector<HTMLElement>("[data-slot='segmented-control-indicator']");
    const items = [...(control?.querySelectorAll<HTMLElement>("[data-slot='segmented-control-item']") ?? [])];
    if (!control || !indicator || items.length < 2) return;
    const a = items[1]!;
    const b = items[0]!;
    const k = easeInOut(clamp((t - TEACH.dial + 0.3) / 0.3));
    const p = spring(t, TEACH.dial - 0.3, { duration: 0.45, bounce: 0.35 });
    void k;
    const left = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p;
    const width = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p;
    indicator.style.setProperty("translate", "none");
    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;
    indicator.style.transform = "none";
  });
  const reason = clamp((t - TEACH.dial - 0.1) / 0.2);
  return (
    <div ref={ref} className="card" style={{ width: 600, padding: "1.25rem" }}>
      <section className="profile-list" style={{ background: "var(--canvas)" }}>
        <h3>How Sloo teaches you</h3>
        <p className="muted">These adjust from your results. Pick one yourself to lock it.</p>
        {DIALS.map((dial) => (
          <Field key={dial.label}>
            <FieldLabel>{dial.label}</FieldLabel>
            <div className="profile-dial">
              <SegmentedControl value={switched ? dial.to : dial.from}>
                <SegmentedControlIndicator />
                {dial.levels.map((level) => (
                  <SegmentedControlItem key={level} value={level}>
                    {level}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <Toggle pressed={false}>Locked</Toggle>
            </div>
            {dial.reason && <FieldDescription style={{ opacity: reason }}>{dial.reason}</FieldDescription>}
          </Field>
        ))}
      </section>
    </div>
  );
}

export function TeachScene() {
  const t = useT();
  const chatIn = enter(t, 0.15, { dx: 160, dy: 0, s0: 0.92, duration: 0.6, bounce: 0.25 });
  const chatOut = easeIn(clamp((t - TEACH.memory + 0.1) / 0.45));
  const tutor1 = streamed(TUTOR1, t, TEACH.tutor1);
  const tutor2 = streamed(TUTOR2, t, TEACH.tutor2);
  const blanksIn = enter(t, TEACH.blanks, { dx: 0, dy: 80, s0: 0.85, duration: 0.6, bounce: 0.3 });
  const tutor2In = enter(t, TEACH.tutor2[0]! - 0.1, { dx: 0, dy: 30, s0: 0.95, duration: 0.4, bounce: 0.3 });
  const memoryIn = enter(t, TEACH.memory + 0.25, { dx: 0, dy: 120, s0: 0.85, duration: 0.65, bounce: 0.3 });
  const sceneOut = easeIn(clamp((t - TEACH.end + 0.4) / 0.4));

  return (
    <>
      {chatOut < 1 && (
        <Layer x={950 + chatIn.x} y={110 - chatOut * 700} scale={1.42 * chatIn.scale} opacity={chatIn.opacity * (1 - chatOut)} z={20} width={650}>
          <label data-slot="label" className="read-aloud" style={{ position: "static", display: "inline-flex", marginBottom: 18, opacity: clamp((t - TEACH.readAloud) / 0.15) }}>
            <Switch checked={t > TEACH.readAloud + 0.2}>
              <SwitchThumb />
            </Switch>
            Sloo reads aloud
          </label>
          <TutorTurn text={tutor1} speaking={t > TEACH.tutor1[0]! && t < TEACH.tutor1[1]! + 0.3} />
          <div style={{ marginTop: 22, transform: `translateY(${blanksIn.y}px) scale(${blanksIn.scale})`, opacity: blanksIn.opacity, transformOrigin: "50% 0" }}>
            {t >= TEACH.blanks && <FillingBlanks t={t} />}
          </div>
          <div style={{ marginTop: 26, transform: `translateY(${tutor2In.y}px)`, opacity: tutor2In.opacity }}>
            {t >= TEACH.tutor2[0]! - 0.1 && <TutorTurn text={tutor2} speaking={t < TEACH.tutor2[1]! + 0.3} />}
          </div>
        </Layer>
      )}

      {t >= TEACH.memory && (
        <>
          <div className="kin" style={{ left: 1000, top: 120, fontSize: 96, zIndex: 20, opacity: 1 - sceneOut }}>
            <div>
              <Word at={TEACH.memory + 0.05}>Remembers</Word> <Word at={TEACH.memory + 0.2}>how</Word>
            </div>
            <div>
              <Word at={TEACH.memory + 0.35}>you</Word> <Word at={TEACH.memory + 0.5} className="accent">
                learn.
              </Word>
            </div>
          </div>
          <Layer x={1000} y={370 + memoryIn.y + sceneOut * 600} scale={1.42 * memoryIn.scale} opacity={memoryIn.opacity} z={20}>
            <Memory t={t} />
          </Layer>
        </>
      )}
    </>
  );
}

/** Sloo big on the left while he teaches; scene seconds. `from` is where the build left him. */
export function teachPose(t: number, from: { x: number; y: number; size: number }) {
  const k = spring(t, 0, { duration: 0.75, bounce: 0.22 });
  return { x: from.x + (500 - from.x) * k, y: from.y + (1020 - from.y) * k, size: from.size + (860 - from.size) * k, opacity: 1 };
}
