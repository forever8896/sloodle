import { Button } from "@ui-sdk/react/button";
import { useEffect, useRef, useState } from "react";
import type { ReviewGrade } from "../../api";
import { gradeSounds, sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, ErrorLine, useAct, type BlockProps } from "./parts";

const grades: { grade: ReviewGrade; label: string; hint: string }[] = [
  { grade: "again", label: "Forgot", hint: "Didn't recall it" },
  { grade: "hard", label: "Hard", hint: "Got it with effort" },
  { grade: "good", label: "Good", hint: "Recalled it" },
  { grade: "easy", label: "Easy", hint: "Instant" },
];

function FlashcardBlock({ component, progress, disabled, act }: BlockProps<"flashcard">) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useAct(act, setPending, setError);
  const back = useRef<HTMLDivElement>(null);
  const flippedBefore = useRef(progress.back !== undefined);
  const locked = disabled || pending;

  useEffect(() => {
    if (progress.back === undefined || flippedBefore.current) return;
    flippedBefore.current = true;
    back.current?.focus();
  }, [progress.back]);

  return (
    <section className="question block block-flashcard" aria-label="Flashcard">
      <BlockHeader component={component} />
      <Markdown text={component.front} className="review-front block-flashcard-front" />
      {progress.back === undefined ? (
        <div data-slot="row" className="question-buttons">
          <Button
            type="button"
            data-variant="solid"
            disabled={locked}
            onClick={() => {
              sfx.play("flip");
              void run({ do: "flip" });
            }}
          >
            Answer in your head, then flip
          </Button>
        </div>
      ) : (
        <>
          <div ref={back} tabIndex={-1} className="block-flashcard-back" aria-label="Answer">
            <Markdown text={progress.back} className="review-back" />
          </div>
          {progress.rating ? (
            <p className="chip" data-tone={progress.rating === "again" ? "bad" : progress.rating === "hard" ? "partial" : "good"} role="status">
              You rated it: {grades.find((g) => g.grade === progress.rating)?.label}
            </p>
          ) : (
            <>
              <p className="eyebrow">How did recalling it go?</p>
              <div className="grades" role="group" aria-label="Rate your recall">
                {grades.map(({ grade, label, hint }) => (
                  <Button
                    key={grade}
                    className="grade"
                    data-grade={grade}
                    disabled={locked}
                    onClick={() => {
                      sfx.play(gradeSounds[grade]);
                      void run({ do: "rate", rating: grade });
                    }}
                  >
                    <strong>{label}</strong>
                    <span>{hint}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <ErrorLine message={error} />
    </section>
  );
}

export { FlashcardBlock };
