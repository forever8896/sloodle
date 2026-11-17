import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Textarea } from "@ui-sdk/react/textarea";
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { onCourses, rpc, type AuthStatus, type ChatOffer, type CourseListing, type LearnerDoc, type Progress, type PublicSettings } from "./api";
import { ChatView } from "./components/ChatView";
import { ImportCourseButton } from "./components/CourseShare";
import { Onboarding } from "./components/Onboarding";
import { ProfileDialog } from "./components/ProfileDialog";
import { CourseView } from "./components/CourseView";
import { SettingsDialog } from "./components/SettingsDialog";
import { Growth, Sloo } from "./components/Sloo";
import { sfx, useNavigateSound } from "./sound";

type Screen = "home" | "course" | "lesson" | "review" | "chat";

/** The rail's entry for the global chat; course ids are lowercase slugs, so it never collides with one. */
const CHAT = "@chat";

/** `screen` picks the opening screen; the demo gallery uses it to show every screen at once. */
function App({ screen }: { screen?: Screen }) {
  const [courses, setCourses] = useState<CourseListing[]>();
  const [selected, setSelectedState] = useState<string | undefined>(screen === undefined || screen === "home" ? undefined : screen === "chat" ? CHAT : "demo");
  // A button in the chat can open a course straight into a lesson or review, or start a course with its goal typed in.
  const [courseMode, setCourseMode] = useState<"overview" | "lesson" | "review">();
  const [prefill, setPrefill] = useState<string>();
  const setSelected = useCallback((id: string | undefined) => {
    setCourseMode(undefined);
    setPrefill(undefined);
    setSelectedState(id);
  }, []);
  const onOffer = useCallback((offer: ChatOffer) => {
    if (offer.kind === "new_course") {
      setSelectedState(undefined);
      setPrefill(offer.topic);
      return;
    }
    setCourseMode(offer.kind === "start_lesson" ? "lesson" : offer.kind === "review" ? "review" : "overview");
    setSelectedState(offer.courseId);
  }, []);
  const [auth, setAuth] = useState<AuthStatus>();
  const [error, setError] = useState<string>();
  const [welcome, setWelcome] = useState<boolean | undefined>(screen ? false : undefined);
  useNavigateSound(selected);

  const load = useCallback(() => {
    setError(undefined);
    rpc<CourseListing[]>("courses.list").then(setCourses, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    rpc<AuthStatus>("auth.status").then(setAuth, () => undefined);
    return onCourses(load);
  }, [load]);

  // The welcome shows once, on a first open with no courses yet; Settings can bring it back.
  useEffect(() => {
    if (welcome !== undefined || courses === undefined) return;
    if (courses.length > 0) return setWelcome(false);
    rpc<PublicSettings>("settings.get").then(
      (settings) => setWelcome(!settings.onboardedAt),
      () => setWelcome(false),
    );
  }, [courses, welcome]);

  if (welcome) {
    return (
      <Onboarding
        onDone={(course) => {
          setWelcome(false);
          rpc<AuthStatus>("auth.status").then(setAuth, () => undefined);
          if (course) setSelected(course.id);
        }}
      />
    );
  }
  // Until we know whether the welcome is due, show only the canvas so Home doesn't flash first.
  if (welcome === undefined && !error) return null;

  return (
    <div className="app">
      <nav className="rail" aria-label="Courses">
        <div className="brand">
          <Sloo size={40} />
          <span>sloodle</span>
        </div>
        <Button className="rail-button rail-new" data-current={selected === undefined || undefined} onClick={() => setSelected(undefined)}>
          <span className="rail-title">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Learn something new
          </span>
        </Button>
        <Button className="rail-button rail-chat" data-current={selected === CHAT || undefined} onClick={() => setSelected(CHAT)}>
          <span className="rail-title">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />
            </svg>
            Chat with Sloo
          </span>
          <span className="rail-meta">Your studies, your courses</span>
        </Button>
        {courses && courses.length > 0 && <p className="rail-heading">Your courses</p>}
        <ul>
          {courses?.map((course) => (
            <li key={course.id}>
              <Button className="rail-button" data-current={selected === course.id || undefined} onClick={() => setSelected(course.id)}>
                <span className="rail-title">
                  <Growth status={course.phase !== "ready" ? "new" : course.mastered === course.total ? "mastered" : course.mastered > 0 ? "practiced" : "learning"} size={20} />
                  {course.title ?? course.topic}
                </span>
                <span className="rail-meta">
                  {course.phase === "interview" && "Getting started"}
                  {course.phase === "planning" && "Being built"}
                  {course.phase === "ready" && `${course.mastered} of ${course.total} mastered${course.due ? `, ${course.due} to review` : ""}`}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="rail-end">
          <ProfileDialog />
          <SettingsDialog onAuthChange={setAuth} onShowWelcome={() => setWelcome(true)} />
        </div>
      </nav>

      <main>
        {error ? (
          <section className="state" role="alert">
            <div className="stage">
              <Sloo mood="thinking" size={180} />
            </div>
            <h1>I can't reach my engine</h1>
            <p>{error} It usually comes back on its own in a moment.</p>
            <Button data-variant="solid" className="big" onClick={load}>
              Try again
            </Button>
          </section>
        ) : selected === CHAT ? (
          <ChatView onOffer={onOffer} />
        ) : selected ? (
          <CourseView key={`${selected}-${courseMode}`} courseId={selected} initialMode={screen === "lesson" || screen === "review" ? screen : (courseMode ?? "overview")} onDeleted={() => setSelected(undefined)} />
        ) : (
          <Home key={prefill} auth={auth} initialTopic={prefill} onCreated={(course) => setSelected(course.id)} onChat={() => setSelected(CHAT)} />
        )}
      </main>
    </div>
  );
}

function Home({ auth, initialTopic, onCreated, onChat }: { auth?: AuthStatus; initialTopic?: string; onCreated: (course: Progress) => void; onChat: () => void }) {
  const [topic, setTopic] = useState(initialTopic ?? "");
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState<string>();

  useEffect(() => {
    rpc<LearnerDoc>("learner.get").then((learner) => setName(learner.stated.name), () => undefined);
  }, []);

  function create(event?: FormEvent) {
    event?.preventDefault();
    if (!topic.trim() || creating) return;
    setCreating(true);
    rpc<Progress>("course.create", { topic }).then(
      (course) => {
        sfx.play("courseCreated");
        onCreated(course);
      },
      (e: Error) => {
        setError(e.message);
        setCreating(false);
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      create();
    }
  }

  return (
    <section className="home">
      <div className="home-layout">
        <div className="home-hello">
          <p className="bubble">
            {name ? `Hi ${name.split(/\s+/)[0]}!` : "Hi, I'm Sloo!"} Tell me what you'd love to be able to do, and we'll grow it together, one small step at a time.
          </p>
          <div className="stage">
            <Sloo mood={topic.trim() ? "listening" : "wave"} size={260} />
          </div>
        </div>

        <div className="home-main">
          <form onSubmit={create}>
            <Field name="topic">
              <FieldLabel className="home-title">
                What do you <em>want to learn</em>?
              </FieldLabel>
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Anything. A language, calculus, how engines work, reading sheet music…"
                rows={3}
                autoFocus
              />
            </Field>
            <ol className="steps">
              <li>
                <strong>We talk</strong> about your goal
              </li>
              <li>
                <strong>I research</strong> and build your course
              </li>
              <li>
                <strong>You grow</strong> at your own pace
              </li>
            </ol>
            <div className="home-actions">
              <Button type="submit" data-variant="solid" className="big" disabled={!topic.trim() || auth?.ok === false} data-loading={creating || undefined}>
                Let's begin
              </Button>
            </div>
            {auth && !auth.ok && (
              <p className="notice" data-tone="warn" role="alert">
                {auth.detail} Open Settings to fix this.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
          <div className="home-import">
            <p className="muted">Someone shared a course with you?</p>
            <ImportCourseButton onImported={onCreated} />
          </div>
          <div className="home-import home-chat">
            <p className="muted">Not sure what's next, or want to change a course?</p>
            <Button onClick={onChat}>Chat with Sloo</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const galleryScreens: { screen: Screen; label: string }[] = [
  { screen: "home", label: "Home" },
  { screen: "course", label: "Course" },
  { screen: "lesson", label: "Session with Sloo" },
  { screen: "review", label: "Review" },
  { screen: "chat", label: "Chat with Sloo" },
];

function DemoGallery() {
  return (
    <div className="demo-gallery">
      {galleryScreens.map(({ screen, label }) => (
        <section key={screen} aria-label={label}>
          <h2>{label}</h2>
          <div className="demo-frame">
            <App screen={screen} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** ?demo&onboarding: the first-run welcome on sample data; finishing it shows the home screen. */
function DemoOnboarding() {
  const [done, setDone] = useState(false);
  return done ? <App screen="home" /> : <Onboarding onDone={() => setDone(true)} />;
}

export { App, DemoGallery, DemoOnboarding };
