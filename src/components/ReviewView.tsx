import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Textarea } from "@ui-sdk/react/textarea";
import { useEffect, useState } from "react";
import { rpc, type ReviewGrade, type ReviewItem } from "../api";
import { Markdown } from "./Markdown";
import { Sloo } from "./Sloo";
import { gradeSounds, sfx } from "../sound";

const grades: { grade: ReviewGrade; label: string; hint: string }[] = [
  { grade: "again", label: "Forgot", hint: "Show it again soon" },
  { grade: "hard", label: "Hard", hint: "Got it with effort" },
  { grade: "good", label: "Good", hint: "Recalled it" },
  { grade: "easy", label: "Easy", hint: "Instant" },
];

function ReviewView({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const [queue, setQueue] = useState<ReviewItem[]>();
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    rpc<ReviewItem[]>("review.due", { courseId }).then(setQueue, (e: Error) => setError(e.message));
  }, [courseId]);

  const item = queue?.[0];

  async function grade(value: ReviewGrade) {
    if (!item || !queue) return;
    try {
      await rpc("review.grade", { courseId, itemId: item.id, grade: value });
      // A forgotten item comes back at the end of this sitting.
      setQueue(value === "again" ? [...queue.slice(1), item] : queue.slice(1));
      setReviewed((n) => n + 1);
      sfx.play(queue.length === 1 && value !== "again" ? "reviewDone" : gradeSounds[value]);
      setRevealed(false);
      setAttempt("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="review">
      <div className="column">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {queue && !item && (
          <div className="state">
            <div className="stage">
              <Sloo mood={reviewed > 0 ? "happy" : "idle"} size={200} />
            </div>
            <h2>{reviewed > 0 ? "Review done" : "Nothing is due"}</h2>
            <p>
              {reviewed > 0
                ? `You recalled ${reviewed} ${reviewed === 1 ? "item" : "items"}. Each one comes back just before you would forget it.`
                : "Items come back on a schedule, just before you would forget them."}
            </p>
            <Button data-variant="solid" onClick={onDone}>
              Back to course
            </Button>
          </div>
        )}

        {item && (
          <article className="review-card" key={item.id + reviewed}>
            <p className="eyebrow">
              {queue.length} to go. Answer from memory before you look.
            </p>
            <Markdown text={item.front} className="review-front" />

            {!revealed ? (
              <>
                <Field>
                  <FieldLabel>Your answer (optional, but saying it or typing it helps)</FieldLabel>
                  <Textarea value={attempt} onChange={(e) => setAttempt(e.target.value)} rows={2} autoFocus />
                </Field>
                <div data-slot="row">
                  <Button data-variant="solid" data-sound="flip" onClick={() => setRevealed(true)}>
                    Show answer
                  </Button>
                </div>
              </>
            ) : (
              <>
                {attempt.trim() && <p className="learner">{attempt}</p>}
                <Markdown text={item.back} className="review-back" />
                <p className="eyebrow">How did recalling it go?</p>
                <div className="grades">
                  {grades.map(({ grade: value, label, hint }) => (
                    <Button key={value} onClick={() => void grade(value)} className="grade" data-grade={value}>
                      <strong>{label}</strong>
                      <span>{hint}</span>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

export { ReviewView };
