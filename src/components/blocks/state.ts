import type { ComponentResult, ComponentUpdate, ReviewGrade, ShownComponent, Verdict } from "../../api";

/** Everything that has happened to a component on screen, folded from the engine's updates. */
interface ComponentProgress {
  hints: string[];
  result?: ComponentResult;
  steps: { index: number; text: string; prediction?: { answer: string; verdict: Verdict; score: number } }[];
  back?: string;
  rating?: ReviewGrade;
  problem?: string;
}

const freshProgress = (): ComponentProgress => ({ hints: [], steps: [] });

function applyUpdate(progress: ComponentProgress, update: ComponentUpdate): ComponentProgress {
  switch (update.kind) {
    case "hint":
      return { ...progress, hints: [...progress.hints, update.text] };
    case "graded":
      return { ...progress, result: update.result };
    case "step":
      return { ...progress, steps: [...progress.steps.filter((s) => s.index !== update.index), { index: update.index, text: update.text, prediction: update.prediction }] };
    case "flipped":
      return { ...progress, back: update.back };
    case "rated":
      return { ...progress, rating: update.rating };
    case "reported":
      return { ...progress, problem: update.problem };
  }
}

/** Whether the learner still owes work on it. */
function isOpen(component: ShownComponent, progress: ComponentProgress): boolean {
  switch (component.type) {
    case "ordering":
    case "matching":
    case "blanks":
      return !progress.result;
    case "steps":
      return progress.steps.length < component.steps.length;
    case "flashcard":
      return !progress.rating;
    default:
      return false;
  }
}

/** The verdict to celebrate or console, for gradable components that have one. */
function verdictOf(progress: ComponentProgress): Verdict | undefined {
  return progress.result?.verdict;
}

export { applyUpdate, freshProgress, isOpen, verdictOf };
export type { ComponentProgress };
