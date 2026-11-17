import { Button } from "@ui-sdk/react/button";
import { useId, useState, type FormEvent } from "react";
import { sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, ErrorLine, HintButton, HintList, Inline, useAct, VerdictBadge, type BlockProps } from "./parts";
import { SortableItem, SortableList } from "./sortable";

function OrderingBlock({ component, progress, disabled, act }: BlockProps<"ordering">) {
  const [order, setOrder] = useState(() => component.items.map((item) => item.id));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useAct(act, setPending, setError);
  const instructions = useId();
  const promptId = useId();
  const result = progress.result?.type === "ordering" ? progress.result : undefined;
  const locked = disabled || pending || result !== undefined;
  const text = (id: string) => component.items.find((item) => item.id === id)?.text ?? "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    sfx.play("send");
    void run({ do: "order", order });
  }

  return (
    <form className="question block block-ordering" onSubmit={submit} aria-labelledby={promptId}>
      <BlockHeader component={component} />
      <div id={promptId}>
        <Markdown text={component.prompt} className="question-prompt" />
      </div>

      {result ? (
        <div className="block-ordering-result">
          <ol className="block-list" aria-label="Your order">
            {result.submitted.map((id, index) => {
              const right = result.correct[index] === id;
              return (
                <li key={id} className="tile" data-mark={right ? "right" : "wrong"}>
                  <span className="block-position" aria-hidden="true">
                    {index + 1}
                  </span>
                  <Inline text={text(id)} />
                  <span className="block-mark">{right ? "In place" : `Belongs at ${result.correct.indexOf(id) + 1}`}</span>
                </li>
              );
            })}
          </ol>
          {result.verdict !== "correct" && (
            <div className="block-answer">
              <p className="eyebrow">The right order</p>
              <ol>
                {result.correct.map((id) => (
                  <li key={id}>
                    <Inline text={text(id)} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.explanation && <Markdown text={result.explanation} className="block-explanation" />}
        </div>
      ) : (
        <>
          <p className="block-note" id={instructions}>
            Drag the items, or focus one and press Space to pick it up, the arrow keys to move it and Space to drop it.
          </p>
          {locked ? (
            <ol className="block-list" aria-label="Items">
              {order.map((id, index) => (
                <li key={id} className="tile" data-locked="">
                  <span className="block-position" aria-hidden="true">
                    {index + 1}
                  </span>
                  <Inline text={text(id)} />
                </li>
              ))}
            </ol>
          ) : (
            <SortableList
              className="block-list"
              aria-label="Items to put in order"
              value={order}
              itemLabel={text}
              onValueChange={(next, details) => {
                setOrder(next);
                sfx.play("select", { index: next.indexOf(details.event ? order.find((id, i) => next[i] !== id) ?? next[0]! : next[0]!) });
              }}
            >
              {({ order: shown }: { order: string[] }) =>
                shown.map((id, index) => (
                  <SortableItem key={id} value={id} className="tile block-sortable-item" aria-describedby={instructions}>
                    <span className="block-handle" aria-hidden="true">
                      ⠿
                    </span>
                    <span className="block-position" aria-hidden="true">
                      {index + 1}
                    </span>
                    <Inline text={text(id)} />
                  </SortableItem>
                ))
              }
            </SortableList>
          )}
        </>
      )}

      <HintList hints={progress.hints} />
      <ErrorLine message={error} />

      {result ? (
        <VerdictBadge verdict={result.verdict} />
      ) : (
        <div className="question-actions">
          <div data-slot="row" className="question-buttons">
            <HintButton component={component} progress={progress} locked={locked} onHint={() => void run({ do: "hint" })} />
            <Button type="submit" data-variant="solid" disabled={locked}>
              {pending ? "Checking…" : "Check order"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export { OrderingBlock };
