// 5. Share it: the course's real "Share this course as a file" button turns the course into one file, which hops to a
// friend's sloodle and lands on "Open a shared course".
import { Button } from "@ui-sdk/react/button";
import { useLayoutEffect, useRef } from "react";
import { ExportCourseButton, ImportCourseButton } from "../../../src/components/CourseShare";
import { Growth } from "../../../src/components/Sloo";
import { enter, Layer, Sparkle, Word } from "../kit";
import { clamp, easeIn, easeInOut, spring, squash, useT } from "../time";

export const SHARE = {
  start: 28.5,
  caption: 0.15,
  course: 0.2,
  friend: 0.45,
  press: 1.15,
  file: 1.3,
  fly: 1.75,
  land: 2.55,
  oneFile: 1.6,
  end: 5.6,
};

const FILE = "read-treble-clef-and-play-along.sloodle.json";

function CourseCard({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const button = ref.current?.querySelector<HTMLElement>(".share button");
    if (!button) return;
    const p = squash(t, SHARE.press, 0.1, 0.35);
    button.style.transform = `translateY(${t > SHARE.press && t < SHARE.press + 0.1 ? 3 : 0}px) scale(${1 + p}, ${1 - p})`;
  });
  return (
    <div ref={ref} className="pane overview" style={{ width: 480, height: "auto", overflow: "visible", padding: 0 }}>
      <header className="course-hero card" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1.25rem" }}>
        <h1 style={{ fontSize: "2.25rem" }}>Read Treble Clef and Play Along</h1>
        <p className="muted" style={{ fontSize: "1.25rem" }}>2 parts, 6 skills, lesson plans, pictures and practice.</p>
        <div className="course-footer" style={{ margin: 0, padding: 0, border: 0 }}>
          <ExportCourseButton courseId="demo" />
        </div>
      </header>
    </div>
  );
}

function FileChip() {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.5rem 1rem 1rem", width: "max-content" }}>
      <svg width="56" height="64" viewBox="0 0 56 64" aria-hidden="true">
        <path d="M8 2h28l18 18v36a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill="var(--lavender-soft)" />
        <path d="M36 2v12a6 6 0 0 0 6 6h12" fill="var(--lavender-lip)" />
        <text x="28" y="47" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="18" fill="var(--lavender)">{"{ }"}</text>
      </svg>
      <div>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.25rem" }}>{FILE}</p>
        <p className="muted" style={{ fontSize: "1.125rem", fontWeight: 600 }}>The course and its lesson plans, nothing about you.</p>
      </div>
    </div>
  );
}

function FriendWindow({ t }: { t: number }) {
  const arrived = t >= SHARE.land + 0.15;
  const pop = spring(t, SHARE.land + 0.15, { duration: 0.5, bounce: 0.45 });
  const press = squash(t, SHARE.land, 0.1, 0.35);
  return (
    <div className="app" style={{ width: 560, height: 430, borderRadius: 36, overflow: "hidden", boxShadow: "var(--sheen), var(--elev-3)", gridTemplateColumns: "15rem minmax(0, 1fr)" }}>
      <nav className="rail" aria-label="Courses" style={{ overflow: "hidden" }}>
        <div className="brand">
          <img src="/sloo-frames/idle/000.png" alt="" width={40} height={40} style={{ objectFit: "contain", transform: "scale(1.15)" }} />
          <span>sloodle</span>
        </div>
        <Button className="rail-button rail-new">
          <span className="rail-title">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Learn something new
          </span>
        </Button>
        <p className="rail-heading" style={{ fontSize: "1rem" }}>Your courses</p>
        <ul>
          <li>
            <Button className="rail-button">
              <span className="rail-title">
                <Growth status="practiced" size={20} />
                Knitting Your First Hat
              </span>
              <span className="rail-meta" style={{ fontSize: "1rem" }}>4 of 9 mastered</span>
            </Button>
          </li>
          {/* The shared course takes the next place in the list, held invisible until it arrives, so nothing shifts. */}
          <li style={{ visibility: arrived ? undefined : "hidden", transform: `scale(${arrived ? 0.6 + 0.4 * pop : 0.6})`, opacity: arrived ? clamp(pop * 2) : 0, transformOrigin: "20% 50%" }}>
            <Button className="rail-button" data-current="">
              <span className="rail-title">
                <Growth status="new" size={20} />
                Read Treble Clef and Play Along
              </span>
              <span className="rail-meta" style={{ fontSize: "1rem" }}>0 of 6 mastered</span>
            </Button>
          </li>
        </ul>
      </nav>
      <main style={{ display: "grid", alignContent: "center", padding: "1.25rem 1.5rem" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
          Hi Maya!
        </h2>
        <div className="home-import" style={{ marginTop: 0, transform: `scale(${1 + press}, ${1 - press})`, transformOrigin: "left center" }}>
          <p className="muted">Someone shared a course with you?</p>
          <ImportCourseButton onImported={() => undefined} />
        </div>
      </main>
    </div>
  );
}

export function ShareScene() {
  const t = useT();
  const course = enter(t, SHARE.course, { dx: -200, dy: 0, s0: 0.9, duration: 0.6, bounce: 0.28 });
  const friend = enter(t, SHARE.friend, { dx: 220, dy: 0, s0: 0.9, duration: 0.6, bounce: 0.28 });
  const out = easeIn(clamp((t - SHARE.end + 0.45) / 0.45));

  // The file: pops out of the button, hops in an arc over Sloo, and lands on the friend's import button.
  const fileOut = spring(t, SHARE.file, { duration: 0.45, bounce: 0.45 });
  const k = easeInOut(clamp((t - SHARE.fly) / (SHARE.land - SHARE.fly)));
  const start = { x: 301, y: 730 };
  const end = { x: 1585, y: 744 };
  const fx = start.x + (end.x - start.x) * k;
  const fy = start.y + (end.y - start.y) * k - Math.sin(Math.PI * k) * 430;
  const landed = clamp((t - SHARE.land) / 0.2);
  const fileScale = (0.45 + 0.55 * fileOut) * (1 - 0.35 * Math.sin(Math.PI * k) * 0) * (1 - landed);
  const spin = Math.sin(Math.PI * k) * -8;

  return (
    <>
      <div className="kin" style={{ left: 0, width: 1920, top: 70, fontSize: 104, textAlign: "center", zIndex: 20, opacity: 1 - out }}>
        <Word at={SHARE.caption}>Share </Word> <Word at={SHARE.caption + 0.12}>any </Word> <Word at={SHARE.caption + 0.24}>course.</Word>{" "}
        <Word at={SHARE.oneFile} className="accent">
          One
        </Word>{" "}
        <Word at={SHARE.oneFile + 0.14} className="accent">
          file.
        </Word>
      </div>

      <Layer x={40 + course.x - out * 900} y={300} scale={1.6 * course.scale} opacity={course.opacity} z={8}>
        <CourseCard t={t} />
      </Layer>
      <Layer x={990 + friend.x + out * 900} y={290} scale={1.6 * friend.scale} opacity={friend.opacity} z={8}>
        <FriendWindow t={t} />
        <div className="chip" data-tone="lavender" style={{ position: "absolute", top: -40, left: 24, fontSize: "1.0625rem", padding: "0.2rem 0.9rem" }}>
          Maya's computer
        </div>
      </Layer>

      {t >= SHARE.file && landed < 1 && (
        <Layer x={fx} y={fy} ox={0} oy={0} scale={fileScale * 1.45} rotate={spin} z={30} style={{ transformOrigin: "0 50%" }}>
          <div style={{ transform: "translate(-50%, -50%)" }}>
            <FileChip />
          </div>
        </Layer>
      )}
      <Sparkle x={1420} y={700} size={70} t0={SHARE.land} life={0.7} />
      <Sparkle x={1760} y={690} size={50} t0={SHARE.land + 0.1} life={0.6} rotate={20} />
      <Sparkle x={1700} y={820} size={40} t0={SHARE.land + 0.18} life={0.5} />
    </>
  );
}

/** Sloo sits low between the two windows and waves the file across. */
export function sharePose(t: number, from: { x: number; y: number; size: number }) {
  const k = spring(t, 0.05, { duration: 0.7, bounce: 0.25 });
  return { x: from.x + (895 - from.x) * k, y: from.y + (1068 - from.y) * k, size: from.size + (500 - from.size) * k, opacity: 1 };
}
