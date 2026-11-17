import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Textarea } from "@ui-sdk/react/textarea";
import { useState, type FormEvent } from "react";
import type { GradeResult, Question } from "../api";
import { Markdown } from "./Markdown";
import { sfx } from "../sound";

interface Props {
  question: Question;
  hints: string[];
  result?: GradeResult;
  disabled: boolean;
  onAnswer: (value: string | number, confidence?: number) => void;
  onHint: () => void;
}

const verdictLabel = { correct: "Correct!", partial: "Partly there", incorrect: "Not yet" };

function QuestionCard({ question, hints, result, disabled, onAnswer, onHint }: Props) {
  const [text, setText] = useState("");
  const [picked, setChoice] = useState<string | null>(null);
  const restored = result && question.options ? question.options.indexOf(result.learnerAnswer) : -1;
  const choice = picked ?? (restored >= 0 ? String(restored) : null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const locked = disabled || sent || result !== undefined;
  const ready = question.kind === "choice" ? choice !== null : text.trim() !== "";
  const hintsLeft = question.hintCount - hints.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || locked) return;
    setSent(true);
    sfx.play("send");
    onAnswer(question.kind === "choice" ? Number(choice) : text.trim(), confidence ? Number(confidence) : undefined);
  }

  function giveUp() {
    setSent(true);
    setText("I don't know");
    onAnswer("I don't know", 1);
  }

  return (
    <form className="question" onSubmit={submit} aria-label="Question">
      <Markdown text={question.prompt} className="question-prompt" />

      {question.kind === "choice" && (
        <RadioGroup aria-label="Options" value={choice} onValueChange={(value) => { if (value !== null) sfx.play("select", { index: Number(value) }); setChoice(value); }} disabled={locked}>
          {question.options?.map((option, index) => (
            <label data-slot="label" key={option} className="option tile">
              <Radio value={String(index)}>
                <RadioIndicator />
              </Radio>
              <span>{option}</span>
            </label>
          ))}
        </RadioGroup>
      )}

      {question.kind === "explain" && (
        <Field>
          <FieldLabel>In your own words</FieldLabel>
          <Textarea value={result && !text ? result.learnerAnswer : text} onChange={(e) => setText(e.target.value)} disabled={locked} rows={4} />
        </Field>
      )}

      {(question.kind === "short" || question.kind === "numeric") && (
        <Field>
          <FieldLabel>Your answer</FieldLabel>
          <Input
            value={result && !text ? result.learnerAnswer : text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            inputMode={question.kind === "numeric" ? "decimal" : "text"}
            autoComplete="off"
          />
        </Field>
      )}

      {hints.length > 0 && (
        <ol className="hints" aria-label="Hints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      )}

      {result ? (
        <p className="verdict pop" data-verdict={result.verdict} role="status">
          {verdictLabel[result.verdict]}
        </p>
      ) : (
        <div className="question-actions">
          <Field className="confidence">
            <FieldLabel>How sure are you?</FieldLabel>
            <SegmentedControl value={confidence} onValueChange={(value) => { if (value) sfx.play("confidence", { index: Number(value) }); setConfidence(value); }} disabled={locked}>
              <SegmentedControlIndicator />
              <SegmentedControlItem value="1">Guessing</SegmentedControlItem>
              <SegmentedControlItem value="2">Fairly sure</SegmentedControlItem>
              <SegmentedControlItem value="3">Certain</SegmentedControlItem>
            </SegmentedControl>
          </Field>
          <div data-slot="row" className="question-buttons">
            {hintsLeft > 0 && (
              <Button type="button" onClick={onHint} disabled={locked}>
                Hint ({hintsLeft} left)
              </Button>
            )}
            <Button type="button" onClick={giveUp} disabled={locked}>
              I don't know
            </Button>
            <Button type="submit" data-variant="solid" disabled={(locked && !sent) || !ready} data-loading={(sent && !result) || undefined}>
              {sent ? "Checking" : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export { QuestionCard };
