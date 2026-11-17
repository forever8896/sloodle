// 6. Yours: fully local, open source, runs on the subscription you already have. The ad's three beats as one bento,
// each with the small motif the ad gave it.
import { useRef } from "react";
import { Word } from "../../../ad/src/kit";
import { SceneTime } from "../../../ad/src/time";
import { StaticBlock, sim } from "../live";
import { enterStyle, useBeatClock, useNear } from "../motion";
import { OwlStop, useOwlZone } from "../owl";
import { site } from "../site.config";

// Verbatim from src/sound.ts.
const source = sim.show({
  id: "site-source",
  intent: "example",
  type: "code",
  title: "src/sound.ts",
  language: "typescript",
  code: "const D4 = 293.66;\nconst PENTATONIC = [0, 2, 4, 7, 9];\n\n/** Note n of D major pentatonic: 0 is D4, 5 is D5, -1 is B3. */\nfunction pent(n: number): number {\n  const octave = Math.floor(n / 5);\n  const step = PENTATONIC[((n % 5) + 5) % 5]!;\n  return D4 * 2 ** (octave + step / 12);\n}",
  runnable: false,
});

const FOLDER: [string, string, number][] = [
  ["sloodle/", "", 0],
  ["courses/", "every course and its lesson plans", 1],
  ["learner.json", "what you told Sloo", 1],
  ["sloo.json", "how Sloo teaches you", 1],
  ["events.jsonl", "your progress", 1],
];

export function Yours() {
  const { zone, stop } = useOwlZone("yours", "idle");
  const t = useBeatClock(zone, 2.4, { amount: 0.25 });
  const codeRef = useRef<HTMLDivElement>(null);
  const near = useNear(codeRef);
  return (
    <section ref={zone} data-owl-zone="yours" id="yours" className="beat yours" aria-labelledby="yours-title">
      <h2 id="yours-title" className="visually-hidden">
        Yours
      </h2>
      <SceneTime.Provider value={t}>
        <div className="bento">
          <article className="tile-local" style={enterStyle(t, 0.05, { dy: 70, s0: 0.94 })}>
            <OwlStop id="yours" stopRef={stop} className="stop-yours" />
            <h3 className="mega">
              <Word at={0.1}>Fully</Word> <Word at={0.26} className="accent">local.</Word>
            </h3>
            <p className="tile-line">Your courses, your progress and Sloo's memory of you live in one folder on your computer.</p>
            <div className="card folder" aria-label="The data folder">
              <ul>
                {FOLDER.map(([name, note, depth]) => (
                  <li key={name} style={{ paddingLeft: depth * 24 }}>
                    <span className="folder-name" data-root={depth === 0 || undefined}>
                      {name}
                    </span>
                    {note && <span className="muted">{note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <article className="tile-open" style={enterStyle(t, 0.35, { dy: 70, s0: 0.94 })}>
            <h3 className="mega">
              <Word at={0.4}>Open</Word> <Word at={0.55} className="accent">source.</Word>
            </h3>
            <p className="tile-line">{site.licence} licensed. Read every line, change what you like.</p>
            <div ref={codeRef} className="float-card tile-code">
              {near ? <StaticBlock component={source} /> : <div className="code-placeholder small" />}
            </div>
          </article>
          <article className="tile-plan" style={enterStyle(t, 0.65, { dy: 70, s0: 0.94 })}>
            <h3 className="mega small">
              <Word at={0.7}>Runs</Word> <Word at={0.78}>on</Word> <Word at={0.86}>the</Word> <Word at={0.95} className="accent">subscription</Word> <Word at={1.08}>you</Word>{" "}
              <Word at={1.16}>already</Word> <Word at={1.24}>have.</Word>
            </h3>
            <p className="tile-line">Sloodle drives the Claude Code on your computer, signed in with your own Claude plan. No new account and nothing extra to pay. An API key works too.</p>
            <p className="notice" data-tone="good">
              Signed in with your Claude subscription.
            </p>
          </article>
        </div>
      </SceneTime.Provider>
    </section>
  );
}
