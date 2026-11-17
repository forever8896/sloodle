// The engine's side of lesson components, run in the window for the ?blocks gallery and ?demo only. It uses the
// engine's own projection and graders, so what you see here is what a real session sends.
import { flashcardScore, gradeBlanks, gradeMatching, gradeOrdering, present, verdictOf, type ComponentSecret } from "../../../sidecar/src/catalogue";
import type { LessonBlock } from "../../../sidecar/src/formats";
import type { ComponentAction, ComponentUpdate, ShownComponent } from "../../api";

interface Shown {
  block: LessonBlock;
  view: ShownComponent;
  secret: ComponentSecret;
  hints: number;
  revealed: number;
}

class Simulator {
  private shown = new Map<string, Shown>();
  private next = 1;

  constructor(private readonly random: () => number = Math.random) {}

  show(block: LessonBlock, objectiveId?: string): ShownComponent {
    const id = `sim${this.next++}`;
    const { view, secret } = present(block, { id, blockId: block.id, objectiveId }, this.random);
    this.shown.set(id, { block, view, secret, hints: 0, revealed: 0 });
    return view;
  }

  /** What the engine would send back for an action, or a thrown error where it would refuse. */
  act(id: string, action: ComponentAction): ComponentUpdate[] {
    const s = this.shown.get(id);
    if (!s) throw new Error("That is no longer open. Ask the tutor to show it again.");
    const { block } = s;
    switch (action.do) {
      case "report":
        return [{ kind: "reported", problem: action.problem }];
      case "hint": {
        const text = "hints" in block ? block.hints[s.hints] : undefined;
        if (text === undefined) throw new Error("No more hints for this one.");
        return [{ kind: "hint", index: s.hints++, text }];
      }
      case "order":
        if (block.type !== "ordering") break;
        return [{ kind: "graded", result: gradeOrdering(s.secret.order!, action.order, block.explanation) }];
      case "match":
        if (block.type !== "matching") break;
        return [{ kind: "graded", result: gradeMatching({ pairs: s.secret.pairs!, texts: s.secret.texts! }, action.pairs) }];
      case "fill":
        if (block.type !== "blanks") break;
        return [{ kind: "graded", result: gradeBlanks(block, action.answers) }];
      case "reveal": {
        if (block.type !== "steps") break;
        const step = block.steps[s.revealed]!;
        if (step.predict && !action.prediction?.trim()) throw new Error("Write what you predict first, or say you don't know.");
        // No grader model here: a stand-in that only knows "I don't know".
        const score = step.predict ? (/know/i.test(action.prediction ?? "") ? 0 : 0.5) : undefined;
        const prediction = score === undefined ? undefined : { answer: action.prediction!.trim(), score, verdict: verdictOf(score) };
        return [{ kind: "step", index: s.revealed++, text: step.text, prediction }];
      }
      case "flip":
        if (block.type !== "flashcard") break;
        return [{ kind: "flipped", back: block.back }];
      case "rate":
        if (block.type !== "flashcard" || flashcardScore[action.rating] === undefined) break;
        return [{ kind: "rated", rating: action.rating }];
    }
    throw new Error("That answer does not fit this component.");
  }

  /** The id of an ordering's items, or a matching's right-hand items, by their text: for building sample answers. */
  idOf(id: string, text: string): string {
    const { view } = this.shown.get(id)!;
    const items = view.type === "ordering" ? view.items : view.type === "matching" ? [...view.left, ...view.right] : [];
    return items.find((i) => i.text === text)!.id;
  }
}

export { Simulator };
