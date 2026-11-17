// 6. Yours: fully local, open source, runs on the subscription you already have. Three beats of big type, each with a
// small motif from the app's own pieces.  7. The end card.
import { Lesson, show } from "../lesson";
import { Cushion, enter, Layer, Sparkle, Word } from "../kit";
import { clamp, easeIn, easeInOut, spring, useSlooPose, useT } from "../time";

export const YOURS = {
  start: 34.1,
  beats: [0.1, 2.75, 5.4],
  end: 8.2,
};

export const END = {
  start: YOURS.start + YOURS.end,
  wordmark: 0.75,
  tagline: 1.15,
  line: 1.6,
  end: 4.4,
};

const sourceSnippet = show({
  id: "ad-source",
  intent: "example",
  type: "code",
  title: "src/sound.ts",
  language: "typescript",
  code: "// Every sound is one small instrument,\n// tuned to D major pentatonic.\nconst D4 = 293.66;\nconst PENTATONIC = [0, 2, 4, 7, 9];",
  runnable: false,
});

function FolderCard() {
  const rows: [string, string, number][] = [
    ["sloodle/", "", 0],
    ["courses/", "every course and its lesson plans", 1],
    ["learner.json", "what you told Sloo", 1],
    ["sloo.json", "how Sloo teaches you", 1],
    ["events.jsonl", "your progress", 1],
  ];
  return (
    <div className="card" style={{ width: 640, display: "grid", gap: "0.5rem" }}>
      <p className="eyebrow" style={{ fontSize: "1.125rem" }}>On your computer</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
        {rows.map(([name, note, depth]) => (
          <li key={name} style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", paddingLeft: depth * 28, fontWeight: 700 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.125rem", color: depth ? "var(--text)" : "var(--lavender)" }}>{name}</span>
            {note && <span className="muted" style={{ fontSize: "1.125rem", fontWeight: 600 }}>{note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PowerCard() {
  return (
    <div className="card" style={{ width: 640, display: "grid", gap: "1rem" }}>
      <p className="notice" data-tone="good" style={{ fontSize: "1.125rem" }}>
        Signed in with your Claude subscription.
      </p>
      <p className="muted" style={{ fontSize: "1.125rem", fontWeight: 600 }}>
        No new account, no separate service to pay for. Sloo thinks with the plan you already have.
      </p>
    </div>
  );
}

const BEATS = [
  { lines: [["Fully", false], ["local.", true]] as [string, boolean][], sub: "Your courses, progress and Sloo's memory stay on your machine.", motif: <FolderCard /> },
  { lines: [["Open", false], ["source.", true]] as [string, boolean][], sub: "Read every line. Change what you like.", motif: <div className="float-card ad-big-code"><Lesson component={sourceSnippet} /></div> },
  { lines: [["Runs on the", false], ["subscription", true], ["you already have.", false]] as [string, boolean][], sub: "", motif: <PowerCard /> },
];

export function YoursScene() {
  const t = useT();
  return (
    <>
      {BEATS.map((beat, i) => {
        const at = YOURS.beats[i]!;
        const next = YOURS.beats[i + 1] ?? YOURS.end;
        if (t < at - 0.2 || t > next + 0.1) return null;
        const outK = easeIn(clamp((t - (next - 0.3)) / 0.3));
        const motif = enter(t, at + 0.35, { dx: 0, dy: 120, s0: 0.85, duration: 0.6, bounce: 0.3 });
        const three = beat.lines.length === 3;
        const size = three ? 112 : 190;
        return (
          <div key={i}>
            <div className="kin" style={{ left: 940, top: three ? 70 : 110, fontSize: size, lineHeight: 0.98, zIndex: 20, transform: `translateY(${-outK * 160}px)`, opacity: 1 - outK }}>
              {beat.lines.map(([text, accent], j) => (
                <div key={text}>
                  <Word at={at + j * 0.16} className={accent ? "accent" : undefined}>
                    {text}
                  </Word>
                </div>
              ))}
            </div>
            {beat.sub && (
              <p style={{ position: "absolute", left: 948, top: 500, width: 860, zIndex: 20, fontSize: 34, fontWeight: 700, color: "var(--muted)", lineHeight: 1.3, opacity: clamp((t - at - 0.45) / 0.2) * (1 - outK) }}>
                {beat.sub}
              </p>
            )}
            <Layer x={948} y={(three ? 500 : 600) + motif.y + outK * 500} scale={1.45 * motif.scale} opacity={motif.opacity * (1 - outK)} z={20}>
              {beat.motif}
            </Layer>
          </div>
        );
      })}
    </>
  );
}

export function yoursPose(t: number, from: { x: number; y: number; size: number }) {
  const k = spring(t, 0, { duration: 0.75, bounce: 0.22 });
  return { x: from.x + (470 - from.x) * k, y: from.y + (1010 - from.y) * k, size: from.size + (900 - from.size) * k, opacity: 1 };
}

export function EndScene() {
  const t = useT();
  const pose = useSlooPose();
  const cushion = spring(t, 0.1, { duration: 0.7, bounce: 0.35 });
  const fade = clamp((t - END.end + 0.5) / 0.5);
  return (
    <>
      <Layer x={pose.x} y={pose.y - 290 * (pose.size / 620)} ox={330} oy={330} scale={cushion * (pose.size / 620)} z={5}>
        <Cushion size={660} />
      </Layer>
      <div className="kin" style={{ left: 0, width: 1920, top: 760, fontSize: 168, textAlign: "center", zIndex: 20 }}>
        <Word at={END.wordmark}>sloodle</Word>
      </div>
      <div className="kin" style={{ left: 0, width: 1920, top: 935, fontSize: 64, textAlign: "center", zIndex: 20 }}>
        <Word at={END.tagline} from={-40}>
          Learn{" "}
        </Word>{" "}
        <Word at={END.tagline + 0.12} from={-40} className="accent">
          anything.
        </Word>
      </div>
      <Sparkle x={650} y={210} size={90} t0={0.55} life={1.1} />
      <Sparkle x={1290} y={160} size={70} t0={0.7} life={1} rotate={25} />
      <Sparkle x={1330} y={480} size={54} t0={0.85} life={0.9} />
      <Sparkle x={600} y={520} size={46} t0={1.0} life={0.8} rotate={-20} />
      {fade > 0 && <div style={{ position: "absolute", inset: 0, background: "var(--canvas)", opacity: fade * 0, zIndex: 40 }} />}
    </>
  );
}

export function endPose(t: number, from: { x: number; y: number; size: number }) {
  const k = spring(t, 0, { duration: 0.8, bounce: 0.25 });
  void easeInOut;
  return { x: from.x + (960 - from.x) * k, y: from.y + (690 - from.y) * k, size: from.size + (620 - from.size) * k, opacity: 1 };
}
