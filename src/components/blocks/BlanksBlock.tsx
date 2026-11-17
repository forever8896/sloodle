import { Button } from "@ui-sdk/react/button";
import { Input } from "@ui-sdk/react/input";
import { useId, useState, type FormEvent } from "react";
import { sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, ErrorLine, HintButton, HintList, useAct, VerdictBadge, type BlockProps } from "./parts";

function BlanksBlock({ component, progress, disabled, act }: BlockProps<"blanks">) {
  const count = component.parts.filter((p) => "blank" in p).length;
  const [answers, setAnswers] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useAct(act, setPending, setError);
  const promptId = useId();
  const result = progress.result?.type === "blanks" ? progress.result : undefined;
  const locked = disabled || pending || result !== undefined;
  const values = result ? result.submitted : answers;
  const ready = answers.some((a) => a.trim() !== "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || !ready) return;
    sfx.play("send");
    void run({ do: "fill", answers });
  }

  return (
    <form className="question block block-blanks" onSubmit={submit} aria-labelledby={promptId}>
      <BlockHeader component={component} />
      <div id={promptId}>{component.prompt ? <Markdown text={component.prompt} className="question-prompt" /> : <p className="question-prompt">Fill in the blanks.</p>}</div>
      <p className="block-blank-text" data-mode={component.mode}>
        {component.parts.map((part, index) =>
          "text" in part ? (
            <span key={`t${index}`}>{part.text}</span>
          ) : (
            <span key={`b${part.blank}`} className="block-blank" data-mark={result ? (result.right[part.blank] ? "right" : "wrong") : undefined}>
              <Input
                aria-label={`Blank ${part.blank + 1} of ${count}`}
                value={values[part.blank] ?? ""}
                onChange={(e) => {
                  const next = [...answers];
                  next[part.blank] = e.target.value;
                  setAnswers(next);
                }}
                disabled={locked}
                autoComplete="off"
                spellCheck={component.mode === "prose"}
                style={{ inlineSize: `${Math.max(4, (values[part.blank] ?? "").length + 2)}ch` }}
              />
              {result && !result.right[part.blank] && (
                <span className="block-expected">
                  <span className="block-sr">Expected </span>
                  {result.expected[part.blank]}
                </span>
              )}
            </span>
          ),
        )}
      </p>
      <HintList hints={progress.hints} />
      <ErrorLine message={error} />
      {result ? (
        <VerdictBadge verdict={result.verdict} />
      ) : (
        <div className="question-actions">
          <div data-slot="row" className="question-buttons">
            <HintButton component={component} progress={progress} locked={locked} onHint={() => void run({ do: "hint" })} />
            <Button type="submit" data-variant="solid" disabled={locked || !ready}>
              {pending ? "Checking…" : "Check"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export { BlanksBlock };
