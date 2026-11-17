import { Button } from "@ui-sdk/react/button";
import { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { useCallback, useEffect, useState } from "react";
import { audioUrl, onCourses, rpc, type AudioLesson, type Module } from "../api";

type Step = "listen" | "ask" | "answer";

const statusText: Record<AudioLesson["status"], string> = {
  writing: "Sloo is writing the script…",
  recording: "Recording",
  ready: "Ready",
  failed: "Could not be made",
};

function Player({ courseId, lesson }: { courseId: string; lesson: AudioLesson }) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>("listen");
  const [src, setSrc] = useState<string>();

  const segment = lesson.segments[index];
  const available = index < lesson.recorded;
  const finished = index >= lesson.segments.length && lesson.status === "ready";

  useEffect(() => {
    if (!available) return setSrc(undefined);
    const file = step === "listen" ? `${index}.wav` : step === "ask" ? `${index}-q.wav` : `${index}-a.wav`;
    let current = true;
    void audioUrl(courseId, lesson.id, file).then((url) => current && setSrc(url));
    return () => {
      current = false;
    };
  }, [courseId, lesson.id, index, step, available]);

  function onEnded() {
    if (step === "listen") setStep("ask");
    else if (step === "answer") next();
  }

  function next() {
    setIndex(index + 1);
    setStep("listen");
  }

  if (finished) {
    return (
      <div className="player">
        <p className="player-text">That's the whole lesson. The ideas will come up again in your next session, where you'll put them to use.</p>
        <Button onClick={() => (setIndex(0), setStep("listen"))}>Listen again</Button>
      </div>
    );
  }

  if (!segment || !available) {
    return (
      <p className="player-wait" role="status">
        {lesson.status === "failed" ? lesson.error : "Recording the next part. It will start when it's ready…"}
      </p>
    );
  }

  return (
    <div className="player">
      <p className="eyebrow">
        Part {index + 1} of {lesson.segments.length}: {segment.heading}
      </p>
      {src && <audio key={src} src={src} controls autoPlay onEnded={onEnded} />}

      {step === "listen" && <p className="player-text">{segment.text}</p>}

      {step === "ask" && (
        <>
          <p className="player-question">{segment.recallQuestion}</p>
          <p className="muted">Say your answer out loud, or think it through. Take your time; nothing plays until you continue.</p>
          <div data-slot="row">
            <Button data-variant="solid" onClick={() => setStep("answer")}>
              I've answered
            </Button>
          </div>
        </>
      )}

      {step === "answer" && (
        <>
          <p className="player-question">{segment.recallQuestion}</p>
          <p className="review-back">{segment.recallAnswer}</p>
          <div data-slot="row">
            <Button onClick={next}>Next part</Button>
          </div>
        </>
      )}
    </div>
  );
}

function AudioLessons({ courseId, modules }: { courseId: string; modules: Module[] }) {
  const [lessons, setLessons] = useState<AudioLesson[]>([]);
  const [open, setOpen] = useState<string>();
  const [moduleId, setModuleId] = useState<string | null>(modules[0]?.id ?? null);
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    rpc<AudioLesson[]>("audio.list", { courseId }).then(setLessons, (e: Error) => setError(e.message));
  }, [courseId]);

  useEffect(() => {
    load();
    return onCourses(load);
  }, [load]);

  function create() {
    if (!moduleId) return;
    setError(undefined);
    rpc<AudioLesson>("audio.create", { courseId, moduleId }).then(
      (lesson) => setOpen(lesson.id),
      (e: Error) => setError(e.message),
    );
  }

  const busy = lessons.some((lesson) => lesson.status === "writing" || lesson.status === "recording");

  return (
    <section className="chapter">
      <h2>Listen</h2>
      <p className="lede">Audio lessons for a walk or the commute. Sloo pauses to ask you questions, because recalling is what makes it stick.</p>

      {lessons.map((lesson) => (
        <article key={lesson.id} className="content-card audio-lesson">
          <div className="audio-lesson-head">
            <div>
              <h3>{lesson.title}</h3>
              <p className="muted">
                {statusText[lesson.status]}
                {lesson.status === "recording" && ` part ${Math.min(lesson.recorded + 1, lesson.segments.length)} of ${lesson.segments.length}`}
              </p>
            </div>
            {lesson.recorded > 0 && <Button onClick={() => setOpen(open === lesson.id ? undefined : lesson.id)}>{open === lesson.id ? "Close" : "Listen"}</Button>}
          </div>
          {lesson.status === "failed" && (
            <p className="error" role="alert">
              {lesson.error}
            </p>
          )}
          {open === lesson.id && lesson.status !== "failed" && <Player courseId={courseId} lesson={lesson} />}
        </article>
      ))}

      <div className="audio-new">
        <Select value={moduleId} onValueChange={(value) => setModuleId(value as string | null)} items={modules.map((m) => ({ value: m.id, label: m.title }))}>
          <SelectLabel>Make an audio lesson about</SelectLabel>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modules.map((module) => (
              <SelectItem key={module.id} value={module.id}>
                {module.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button data-variant="solid" onClick={create} disabled={!moduleId || busy}>
          {busy ? "Making one…" : "Make it"}
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export { AudioLessons };
