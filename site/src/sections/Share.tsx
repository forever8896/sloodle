// 5. Share any course. One file. The course's real "Share this course as a file" button (it downloads the app's demo
// course, exactly as exported), the file hopping to a friend's sloodle, and an honest look at the open format.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Sparkle, Word } from "../../../ad/src/kit";
import { SceneTime } from "../../../ad/src/time";
import { ExportCourseButton, ImportCourseButton } from "../../../src/components/CourseShare";
import { Growth } from "../../../src/components/Sloo";
import { courseFileName, courseSnippet } from "../generated/course-snippet";
import { StaticBlock, sim } from "../live";
import { clamp, easeInOut, enterStyle, SETTLED, spring, squash, useBeatClock, useNear } from "../motion";
import { owl, OwlStop, useOwlZone } from "../owl";

const S = { course: 0.1, friend: 0.3, press: 1.0, file: 1.15, fly: 1.55, land: 2.45 };

function FileChip() {
  return (
    <div className="card file-chip">
      <svg width="40" height="46" viewBox="0 0 56 64" aria-hidden="true">
        <path d="M8 2h28l18 18v36a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill="var(--lavender-soft)" />
        <path d="M36 2v12a6 6 0 0 0 6 6h12" fill="var(--lavender-lip)" />
        <text x="28" y="47" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="18" fill="var(--lavender)">
          {"{ }"}
        </text>
      </svg>
      <div>
        <p className="file-name">{courseFileName}</p>
        <p className="muted">The course and its lesson plans, nothing about you.</p>
      </div>
    </div>
  );
}

function Hop({ t, stage }: { t: number; stage: React.RefObject<HTMLDivElement | null> }) {
  const [path, setPath] = useState<{ x0: number; y0: number; x1: number; y1: number }>();
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root || path || t <= 0 || t >= SETTLED) return;
    const from = root.querySelector(".share-course .share button")?.getBoundingClientRect();
    const to = root.querySelector(".friend .home-import .share button")?.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    if (!from || !to) return;
    setPath({ x0: from.left + from.width / 2 - box.left, y0: from.top - box.top, x1: to.left + to.width / 2 - box.left, y1: to.top + to.height / 2 - box.top });
  });
  if (!path || t >= SETTLED || t < S.file) return null;
  const out = spring(t, S.file, { duration: 0.45, bounce: 0.45 });
  const k = easeInOut(clamp((t - S.fly) / (S.land - S.fly)));
  const landed = clamp((t - S.land) / 0.2);
  if (landed >= 1) return null;
  const height = Math.max(160, Math.abs(path.x1 - path.x0) * 0.35);
  const x = path.x0 + (path.x1 - path.x0) * k;
  const y = path.y0 - 40 * out + (path.y1 - path.y0 + 40) * k - Math.sin(Math.PI * k) * height;
  const scale = (0.45 + 0.55 * out) * (1 - landed);
  return (
    <div className="hop" aria-hidden="true" style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${Math.sin(Math.PI * k) * -8}deg) scale(${scale})` }}>
      <FileChip />
    </div>
  );
}

function Swap() {
  const { zone, stop } = useOwlZone("share", "happy");
  const t = useBeatClock(zone, 3.6, { amount: 0.35 });
  const stage = useRef<HTMLDivElement>(null);
  const [imported, setImported] = useState(false);
  const arrived = t >= S.land + 0.15 || imported;
  const pop = imported ? 1 : spring(t, S.land + 0.15, { duration: 0.5, bounce: 0.45 });
  const press = squash(t, S.press, 0.1, 0.35);
  const land = squash(t, S.land, 0.1, 0.35);

  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="share" className="swap">
      <SceneTime.Provider value={t}>
        <h2 id="share-title" className="display center">
          <Word at={0.05}>Share</Word> <Word at={0.17}>any</Word> <Word at={0.29}>course.</Word>{" "}
          <Word at={1.35} className="accent">
            One
          </Word>{" "}
          <Word at={1.47} className="accent">
            file.
          </Word>
        </h2>
      </SceneTime.Provider>
      <p className="lede center">A course exports to one file you can send anyone. They open it in their sloodle, and Sloo teaches it to them, fitted to them.</p>
      <div ref={stage} className="swap-stage">
        <div className="share-course" style={enterStyle(t, S.course, { dx: -160, dy: 0, s0: 0.9 })}>
          <header className="course-hero card">
            <h3>Read Treble Clef and Play Along</h3>
            <p className="muted">2 parts, 6 skills, lesson plans, pictures and practice.</p>
            <div className="course-footer" style={{ "--press": press } as CSSProperties}>
              <ExportCourseButton courseId="demo" />
            </div>
          </header>
          <p className="cell-note">Press it: you get the real file.</p>
        </div>
        <OwlStop id="share" stopRef={stop} className="stop-share" />
        <div className="friend-wrap" style={enterStyle(t, S.friend, { dx: 160, dy: 0, s0: 0.9 })}>
          <p className="chip" data-tone="lavender">
            Maya's computer
          </p>
          <div className="app friend">
            <nav className="rail" aria-label="Maya's courses">
              <div className="brand">
                <img src="./sloo/mark.webp" alt="" width={34} height={40} />
                <span>sloodle</span>
              </div>
              <p className="rail-heading">Your courses</p>
              <ul>
                <li>
                  <span className="rail-button" data-slot="button">
                    <span className="rail-title">
                      <Growth status="practiced" size={20} />
                      Knitting Your First Hat
                    </span>
                    <span className="rail-meta">4 of 9 mastered</span>
                  </span>
                </li>
                <li style={{ visibility: arrived ? undefined : "hidden", transform: `scale(${arrived ? 0.6 + 0.4 * pop : 0.6})`, opacity: arrived ? clamp(pop * 2) : 0, transformOrigin: "20% 50%" }}>
                  <span className="rail-button" data-slot="button" data-current="">
                    <span className="rail-title">
                      <Growth status="new" size={20} />
                      Read Treble Clef and Play Along
                    </span>
                    <span className="rail-meta">0 of 6 mastered</span>
                  </span>
                </li>
              </ul>
            </nav>
            <div className="friend-main">
              <p className="friend-hello">Hi Maya!</p>
              <div className="home-import" style={{ transform: `scale(${1 + land}, ${1 - land})` }}>
                <p className="muted">Someone shared a course with you?</p>
                <SceneTime.Provider value={t}>
                  <div className="sparkles" aria-hidden="true">
                    <Sparkle x={0} y={0} size={46} t0={S.land} life={0.7} />
                    <Sparkle x={150} y={-20} size={34} t0={S.land + 0.1} life={0.6} rotate={20} />
                    <Sparkle x={120} y={60} size={28} t0={S.land + 0.18} life={0.5} />
                  </div>
                </SceneTime.Provider>
                <ImportCourseButton
                  onImported={() => {
                    setImported(true);
                    owl.react("correct");
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <Hop t={t} stage={stage} />
      </div>
    </div>
  );
}

const snippet = sim.show({ id: "site-format", intent: "example", type: "code", title: courseFileName, language: "json", code: courseSnippet, runnable: false });

function Format() {
  const { zone, stop } = useOwlZone("format", "writing");
  const near = useNear(zone);
  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="format" className="format">
      <div className="format-copy">
        <h3 className="display-sm">
          One open format. <span className="accent">Plain JSON.</span>
        </h3>
        <p>
          Every course is a <code>sloodle.course</code> version 1 document: modules, objectives, lesson plans with their components, checks with answer keys, and review cards. JSON Schemas for it sit in{" "}
          <code>sidecar/schema/</code>.
        </p>
        <p>An imported course is checked strictly, given a fresh id and fresh progress, and its text is treated as data, never as instructions to Sloo.</p>
        <OwlStop id="format" stopRef={stop} className="stop-format" />
      </div>
      <div className="format-code float-card">{near ? <StaticBlock component={snippet} /> : <div className="code-placeholder" />}</div>
    </div>
  );
}

export function Share() {
  return (
    <section id="share" className="beat sharing" aria-labelledby="share-title">
      <Swap />
      <Format />
    </section>
  );
}
