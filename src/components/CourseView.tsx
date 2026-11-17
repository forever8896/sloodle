import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@ui-sdk/react/progress";
import { useCallback, useEffect, useState } from "react";
import { onCourses, rpc, type CourseDetail, type MasteryStatus, type Progress as Enrollment } from "../api";
import { ExportCourseButton } from "./CourseShare";
import { AudioLessons } from "./AudioLessons";
import { Markdown } from "./Markdown";
import { ReviewView } from "./ReviewView";
import { SessionView } from "./SessionView";
import { Growth, Sloo } from "./Sloo";
import { useCourseSounds, useNavigateSound } from "../sound";

const statusLabel: Record<MasteryStatus, string> = {
  new: "Seed",
  learning: "Sprouting",
  practiced: "Budding",
  mastered: "In bloom",
};

const stages: MasteryStatus[] = ["new", "learning", "practiced", "mastered"];

function startOfWeek(now: Date): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.getTime();
}

/** Distinct days this week on which the learner did a session or answered a question. */
function daysStudiedThisWeek(course: Enrollment, now: Date): number {
  const since = startOfWeek(now);
  const stamps = [...course.summaries.map((s) => s.at), ...Object.values(course.objectiveStates).flatMap((state) => state.evidence.map((e) => e.at))];
  return new Set(stamps.map((at) => new Date(at)).filter((d) => d.getTime() >= since).map((d) => d.toDateString())).size;
}

type Mode = "overview" | "lesson" | "review";

function CourseView({ courseId, onDeleted, initialMode = "overview" }: { courseId: string; onDeleted: () => void; initialMode?: Mode }) {
  const [detail, setDetail] = useState<CourseDetail>();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<Mode>(initialMode);
  useNavigateSound(mode);
  useCourseSounds(detail);

  const load = useCallback(() => {
    rpc<CourseDetail>("course.get", { courseId }).then(setDetail, (e: Error) => setError(e.message));
  }, [courseId]);

  useEffect(() => {
    setDetail(undefined);
    load();
    return onCourses(load);
  }, [courseId, load]);

  if (error) {
    return (
      <section className="state" role="alert">
        <div className="stage">
          <Sloo mood="thinking" size={180} />
        </div>
        <h1>This course didn't open</h1>
        <p>{error}</p>
        <Button data-variant="solid" className="big" onClick={() => (setError(undefined), load())}>
          Try again
        </Button>
      </section>
    );
  }
  if (!detail) {
    return (
      <section className="pane overview" aria-busy="true" aria-label="Opening the course">
        <div className="column">
          <div className="skeleton skeleton-hero" />
          <div className="overview-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      </section>
    );
  }

  const { course } = detail;

  if (course.phase === "interview") {
    return (
      <section className="pane">
        <header className="pane-header">
          <h1>{course.topic}</h1>
          <p>First, a short conversation about what you want and where you are starting from.</p>
        </header>
        <SessionView key="interview" courseId={courseId} kind="interview" />
      </section>
    );
  }

  if (course.phase === "planning") {
    return (
      <section className="pane">
        <header className="pane-header">
          <h1>Building your course</h1>
          <p>Researching how this is best learned and choosing materials. This takes a few minutes; you can leave it running.</p>
        </header>
        <SessionView key="planning" courseId={courseId} kind="planning" />
      </section>
    );
  }

  const curriculum = detail.content!;
  const objectives = curriculum.modules.flatMap((m) => m.objectives);
  const mastered = objectives.filter((o) => course.objectiveStates[o.id]?.status === "mastered").length;
  const lastSession = course.summaries.at(-1);
  const next = objectives.filter((o) => detail.nextUp.includes(o.id)).slice(0, 3);
  const counts = Object.fromEntries(stages.map((stage) => [stage, objectives.filter((o) => (course.objectiveStates[o.id]?.status ?? "new") === stage).length]));
  const weekGoal = Math.max(1, Math.round(course.brief?.sessionsPerWeek ?? 3));
  const weekDone = daysStudiedThisWeek(course, new Date());
  const greeting =
    mastered === objectives.length && objectives.length > 0
      ? "Every skill is in bloom. You did what you set out to do!"
      : course.activeLesson
        ? "We were in the middle of something. Shall we pick it up where we stopped?"
        : detail.due > 0
          ? `${detail.due} quick ${detail.due === 1 ? "review is" : "reviews are"} waiting. About a minute each, and they keep what you learned from fading.`
          : weekDone >= weekGoal
            ? "You hit your goal for this week. Anything more is a bonus."
            : lastSession
              ? "Good to see you. A short session today keeps things growing."
              : "Your course is ready! The first session is the easiest one to start.";

  if (mode === "lesson") {
    return (
      <section className="pane">
        <header className="pane-header pane-header-row">
          <Button className="back" aria-label="Back to course" onClick={() => setMode("overview")}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Button>
          <h1>{curriculum.title}</h1>
        </header>
        <SessionView
          key="lesson"
          courseId={courseId}
          kind="lesson"
          footer={() => (
            <div className="session-end">
              <p>Session saved. What you practised today comes back in review and at the start of next time.</p>
              <Button data-variant="solid" onClick={() => setMode("overview")}>
                Back to course
              </Button>
            </div>
          )}
        />
      </section>
    );
  }

  if (mode === "review") {
    return (
      <section className="pane">
        <header className="pane-header pane-header-row">
          <Button className="back" aria-label="Back to course" onClick={() => setMode("overview")}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Button>
          <h1>Review</h1>
        </header>
        <ReviewView courseId={courseId} onDone={() => setMode("overview")} />
      </section>
    );
  }

  return (
    <section className="pane overview">
      <div className="column">
        <header className="course-hero card">
          <div className="course-hero-text">
            <h1>{curriculum.title}</h1>
            <p className="bubble">{greeting}</p>
            <div className="today-actions">
              <Button data-variant="solid" className="big" onClick={() => setMode("lesson")}>
                {course.activeLesson ? "Continue session" : "Start a session"}
              </Button>
              <Button className="big" onClick={() => setMode("review")} disabled={detail.due === 0}>
                {detail.due > 0 ? `Review ${detail.due} due` : "No reviews due"}
              </Button>
            </div>
          </div>
          <div className="stage">
            <Sloo mood={mastered === objectives.length ? "happy" : "wave"} size={220} />
          </div>
        </header>

        <section className="card today" aria-label="Today">
          {lastSession ? (
            <dl className="today-notes">
              <div>
                <dt>Last time</dt>
                <dd>{lastSession.summary}</dd>
              </div>
              <div>
                <dt>Next</dt>
                <dd>{lastSession.nextStep}</dd>
              </div>
            </dl>
          ) : (
            <p className="today-plan">
              {course.brief ? `Sessions are about ${course.brief.minutesPerSession} minutes.` : "Sessions are short: start one whenever you're ready."}
              {course.brief?.studyCue ? ` Your plan: ${course.brief.studyCue}` : ""}
            </p>
          )}
          {next.length > 0 && (
            <>
              <h2 className="card-title">Up next</h2>
              <ul className="next-up">
                {next.map((o) => (
                  <li key={o.id}>{o.statement}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="overview-grid">
          <section className="card stat" aria-label="This week">
            <h2 className="card-title">This week</h2>
            <p className="stat-value">
              {Math.min(weekDone, weekGoal)} of {weekGoal} <span>sessions</span>
            </p>
            <div className="week" aria-hidden="true">
              {Array.from({ length: weekGoal }, (_, day) => (
                <span key={day} data-done={day < weekDone || undefined} />
              ))}
            </div>
          </section>

          <section className="card stat" aria-label="Your garden">
            <h2 className="card-title">Your garden</h2>
            <ul className="garden">
              {stages.map((stage) => (
                <li key={stage} data-status={stage}>
                  <Growth status={stage} size={28} />
                  <strong>{counts[stage]}</strong>
                  <span>{statusLabel[stage]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="card bloom">
          <Progress value={mastered} max={Math.max(objectives.length, 1)} getValueLabel={() => `${mastered} of ${objectives.length} skills in bloom`}>
            <ProgressLabel>Skills in bloom</ProgressLabel>
            <ProgressValue>{() => `${mastered} of ${objectives.length}`}</ProgressValue>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
          <p className="muted">A skill blooms once you recall it unaided on two different days.</p>
        </section>

        {course.projects.length > 0 && (
          <section className="section">
            <h2>Projects</h2>
            {course.projects.map((project) => (
              <article key={project.id} className="content-card">
                <h3>{project.title}</h3>
                <Markdown text={project.brief} />
                <ul>
                  {project.deliverables.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )}

        <section className="section path">
          <h2>The path</h2>
          <p className="lede">{curriculum.summary}</p>
          {curriculum.modules.map((module, index) => (
            <article key={module.id} className="card module">
              <p className="module-part">Part {index + 1}</p>
              <h3>{module.title}</h3>
              <p className="module-why">{module.why}</p>
              <ul className="objectives">
                {module.objectives.map((o) => {
                  const status = course.objectiveStates[o.id]?.status ?? "new";
                  return (
                    <li key={o.id} data-status={status}>
                      <Growth status={status} />
                      <span>{o.statement}</span>
                      <span className="status-text">{statusLabel[status]}</span>
                    </li>
                  );
                })}
              </ul>
              {module.project && <p className="module-project">Project: {module.project.title}</p>}
            </article>
          ))}
        </section>

        <AudioLessons courseId={courseId} modules={curriculum.modules} />

        {course.brief && (
          <section className="section">
            <h2>Your goal</h2>
            <div className="card goal">
              <p>{course.brief.targetPerformance}</p>
              <p className="muted">{course.brief.motivation}</p>
            </div>
          </section>
        )}

        {curriculum.sources.length > 0 && (
          <section className="section">
            <h2>Built from</h2>
            <ul className="sources">
              {curriculum.sources.map((source) => (
                <li key={source.url} className="card">
                  <Markdown text={`[${source.title}](${source.url})`} />
                  <span className="muted">{source.why}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="course-footer">
          <ExportCourseButton courseId={courseId} />
          <AlertDialog>
            <AlertDialogTrigger data-variant="ghost" className="danger-link">
              Delete this course
            </AlertDialogTrigger>
            <AlertDialogBackdrop />
            <AlertDialogContent>
              <div data-slot="stack">
                <AlertDialogTitle>Delete this course?</AlertDialogTitle>
                <AlertDialogDescription>This removes the course, your progress and its review items from this computer.</AlertDialogDescription>
              </div>
              <div data-slot="row">
                <AlertDialogClose>Cancel</AlertDialogClose>
                <AlertDialogClose data-variant="destructive" value="confirm" onClick={() => void rpc("course.delete", { courseId }).then(onDeleted)}>
                  Delete
                </AlertDialogClose>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </footer>
      </div>
    </section>
  );
}

export { CourseView };
