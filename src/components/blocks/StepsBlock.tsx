import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Textarea } from "@ui-sdk/react/textarea";
import { useEffect, useRef, useState } from "react";
import { sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, ErrorLine, useAct, type BlockProps } from "./parts";

const verdictWord = { correct: "Spot on", partial: "Partly", incorrect: "Not quite" } as const;

function StepsBlock({ component, progress, disabled, act }: BlockProps<"steps">) {
  const [prediction, setPrediction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useAct(act, setPending, setError);
  const steps = [...progress.steps].sort((a, b) => a.index - b.index);
  const next = steps.length;
  const upcoming = component.steps[next];
  const finished = next >= component.steps.length;
  const locked = disabled || pending;
  const newest = useRef<HTMLLIElement>(null);
  const seen = useRef(next);

  // A step that arrives now (not from history) takes focus, and a graded prediction is heard.
  useEffect(() => {
    if (next <= seen.current) return;
    seen.current = next;
    newest.current?.focus();
    const verdict = steps.at(-1)?.prediction?.verdict;
    sfx.play(verdict ?? "flip");
  }, [next, steps]);

  async function reveal(answer?: string) {
    if (await run({ do: "reveal", prediction: answer })) setPrediction("");
  }

  return (
    <section className="question block block-steps" aria-label={component.title ?? "Worked example"}>
      <BlockHeader component={component} />
      <Markdown text={component.prompt} className="question-prompt" />
      <ol className="block-step-list">
        {steps.map((step, i) => (
          <li key={step.index} className="block-step" tabIndex={-1} ref={i === steps.length - 1 ? newest : undefined}>
            <span className="block-position" aria-hidden="true">
              {step.index + 1}
            </span>
            <div className="block-step-body">
              {step.prediction && (
                <p className="block-prediction">
                  <span className="chip" data-tone={step.prediction.verdict === "correct" ? "good" : step.prediction.verdict === "partial" ? "partial" : "bad"}>
                    {verdictWord[step.prediction.verdict]}
                  </span>{" "}
                  You predicted: “{step.prediction.answer}”
                </p>
              )}
              <Markdown text={step.text} />
            </div>
          </li>
        ))}
      </ol>
      <ErrorLine message={error} />
      {finished ? (
        <p className="block-note" role="status">
          All {component.steps.length} steps shown.
        </p>
      ) : upcoming?.predict ? (
        <form
          className="block-predict"
          onSubmit={(e) => {
            e.preventDefault();
            if (prediction.trim() && !locked) void reveal(prediction.trim());
          }}
        >
          <Field>
            <FieldLabel>{upcoming.predict}</FieldLabel>
            <Textarea value={prediction} onChange={(e) => setPrediction(e.target.value)} rows={2} disabled={locked} placeholder="Commit to a guess before you look" />
          </Field>
          <div data-slot="row" className="question-buttons">
            <Button type="button" onClick={() => void reveal("I don't know")} disabled={locked}>
              I don't know
            </Button>
            <Button type="submit" data-variant="solid" disabled={locked || !prediction.trim()}>
              {pending ? "Checking…" : `Reveal step ${next + 1}`}
            </Button>
          </div>
        </form>
      ) : (
        <div data-slot="row" className="question-buttons">
          <Button type="button" data-variant="solid" onClick={() => void reveal()} disabled={locked}>
            {next === 0 ? "Show the first step" : `Show step ${next + 1} of ${component.steps.length}`}
          </Button>
        </div>
      )}
    </section>
  );
}

export { StepsBlock };
