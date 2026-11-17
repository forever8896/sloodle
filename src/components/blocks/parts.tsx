import { Button } from "@ui-sdk/react/button";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, useRef, type ReactNode } from "react";
import type { ComponentAction, ShownComponent, Verdict } from "../../api";
import type { ComponentProgress } from "./state";

interface BlockProps<T extends ShownComponent["type"]> {
  component: Extract<ShownComponent, { type: T }>;
  progress: ComponentProgress;
  /** The session has ended: show the component, but take no more work. */
  disabled?: boolean;
  /** Sends the learner's work to the engine. Rejects with a readable message when it is refused or fails. */
  act: (action: ComponentAction) => Promise<void>;
}

/** One line of inline Markdown (code spans, emphasis), for list items, labels and table cells. */
function Inline({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parseInline(text, { async: false }), { ALLOWED_TAGS: ["code", "em", "strong", "del", "sub", "sup", "br"], ALLOWED_ATTR: [] }), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const eyebrows: Record<ShownComponent["type"], string> = {
  markdown: "Read",
  diagram: "Diagram",
  code: "Code",
  ordering: "Put in order",
  matching: "Match",
  blanks: "Fill in the blanks",
  steps: "Worked example",
  flashcard: "Flashcard",
  table: "Compare",
  callout: "Note",
  image: "Picture",
};

function BlockHeader({ component, id }: { component: ShownComponent; id?: string }) {
  return (
    <header className="block-header">
      <p className="eyebrow">{eyebrows[component.type]}</p>
      {component.title && (
        <h3 id={id} className="block-title">
          {component.title}
        </h3>
      )}
    </header>
  );
}

const verdictLabel: Record<Verdict, string> = { correct: "Correct!", partial: "Partly there", incorrect: "Not yet" };

function VerdictBadge({ verdict, children }: { verdict: Verdict; children?: ReactNode }) {
  return (
    <p className="verdict pop" data-verdict={verdict} role="status">
      {verdictLabel[verdict]}
      {children}
    </p>
  );
}

function HintList({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null;
  return (
    <ol className="hints" aria-label="Hints">
      {hints.map((hint) => (
        <li key={hint}>{hint}</li>
      ))}
    </ol>
  );
}

function HintButton({ component, progress, locked, onHint }: { component: ShownComponent; progress: ComponentProgress; locked: boolean; onHint: () => void }) {
  const left = (component.hintCount ?? 0) - progress.hints.length;
  if (left <= 0) return null;
  return (
    <Button type="button" onClick={onHint} disabled={locked}>
      Hint ({left} left)
    </Button>
  );
}

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="error block-error" role="alert">
      {message}
    </p>
  );
}

/** Runs an action and keeps its failure for display, so the component never sticks in "Checking…". */
function useAct(act: BlockProps<never>["act"], setPending: (pending: boolean) => void, setError: (message?: string) => void) {
  const busy = useRef(false);
  return async (action: ComponentAction): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await act(action);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
}

export { BlockHeader, ErrorLine, eyebrows, HintButton, HintList, Inline, useAct, VerdictBadge };
export type { BlockProps };
