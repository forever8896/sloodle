import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { useId, useState, type FormEvent } from "react";
import { sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, ErrorLine, HintButton, HintList, Inline, useAct, VerdictBadge, type BlockProps } from "./parts";

function MatchingBlock({ component, progress, disabled, act }: BlockProps<"matching">) {
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useAct(act, setPending, setError);
  const promptId = useId();
  const result = progress.result?.type === "matching" ? progress.result : undefined;
  const locked = disabled || pending || result !== undefined;
  const chosen = result ? result.submitted : pairs;
  const ready = component.left.every((l) => chosen[l.id]);
  const text = (id?: string) => component.right.find((r) => r.id === id)?.text ?? "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || !ready) return;
    sfx.play("send");
    void run({ do: "match", pairs });
  }

  return (
    <form className="question block block-matching" onSubmit={submit} aria-labelledby={promptId}>
      <BlockHeader component={component} />
      <div id={promptId}>
        <Markdown text={component.prompt} className="question-prompt" />
      </div>
      <ul className="block-pairs">
        {component.left.map((left) => {
          const mark = result ? (result.submitted[left.id] === result.correct[left.id] ? "right" : "wrong") : undefined;
          return (
            <li key={left.id} className="block-pair" data-mark={mark}>
              <Field>
                <FieldLabel>
                  <Inline text={left.text} />
                </FieldLabel>
                <Select
                  value={chosen[left.id] ?? null}
                  onValueChange={(value: string | null) => {
                    if (!value) return;
                    sfx.play("select", { index: component.right.findIndex((r) => r.id === value) });
                    setPairs((current) => ({ ...current, [left.id]: value }));
                  }}
                  disabled={locked}
                  placeholder="Choose a match"
                  items={component.right.map((r) => ({ value: r.id, label: r.text }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {component.right.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {mark && (
                <span className="block-mark" data-mark={mark}>
                  {mark === "right" ? "Right" : <>Should be <Inline text={text(result!.correct[left.id])} /></>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <HintList hints={progress.hints} />
      <ErrorLine message={error} />
      {result ? (
        <VerdictBadge verdict={result.verdict} />
      ) : (
        <div className="question-actions">
          <div data-slot="row" className="question-buttons">
            <HintButton component={component} progress={progress} locked={locked} onHint={() => void run({ do: "hint" })} />
            <Button type="submit" data-variant="solid" disabled={locked || !ready}>
              {pending ? "Checking…" : "Check matches"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export { MatchingBlock };
