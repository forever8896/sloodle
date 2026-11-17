import type { ComponentProgress } from "./state";
import { BlanksBlock } from "./BlanksBlock";
import { CalloutBlock } from "./CalloutBlock";
import { CodeBlock } from "./CodeBlock";
import { DiagramBlock } from "./DiagramBlock";
import { FlashcardBlock } from "./FlashcardBlock";
import { ImageBlock } from "./ImageBlock";
import { MatchingBlock } from "./MatchingBlock";
import { OrderingBlock } from "./OrderingBlock";
import { StepsBlock } from "./StepsBlock";
import { TableBlock } from "./TableBlock";
import { BlockHeader, type BlockProps } from "./parts";
import { Markdown } from "../Markdown";
import type { ShownComponent } from "../../api";
import "./blocks.css";

/** The one place the transcript (and the gallery) turns a lesson component into its view. */
function Block(props: BlockProps<ShownComponent["type"]>) {
  const { component } = props;
  switch (component.type) {
    case "markdown":
      return (
        <article className="content-card block">
          <BlockHeader component={component} />
          <Markdown text={component.body} />
        </article>
      );
    case "diagram":
      return <DiagramBlock {...props} component={component} />;
    case "code":
      return <CodeBlock {...props} component={component} />;
    case "ordering":
      return <OrderingBlock {...props} component={component} />;
    case "matching":
      return <MatchingBlock {...props} component={component} />;
    case "blanks":
      return <BlanksBlock {...props} component={component} />;
    case "steps":
      return <StepsBlock {...props} component={component} />;
    case "flashcard":
      return <FlashcardBlock {...props} component={component} />;
    case "table":
      return <TableBlock {...props} component={component} />;
    case "callout":
      return <CalloutBlock {...props} component={component} />;
    case "image":
      return <ImageBlock {...props} component={component} />;
  }
}

type SoundItem = { type: "tutor" | "user" | "content" | "activity" | "error" | "project" } | { type: "question"; question: { id: string }; hints: string[]; result?: { verdict: "correct" | "partial" | "incorrect" } };

/** The transcript as the session sounds see it: graded components play like questions, the rest like content. */
function soundItems<T extends { type: string }>(items: readonly (T | { type: "component"; component: ShownComponent; progress: ComponentProgress })[]): SoundItem[] {
  return items.map((item) => {
    if (item.type !== "component") return item as unknown as SoundItem;
    const { component, progress } = item as { component: ShownComponent; progress: ComponentProgress };
    if (component.type === "ordering" || component.type === "matching" || component.type === "blanks") {
      return { type: "question", question: { id: component.id }, hints: progress.hints, result: progress.result && { verdict: progress.result.verdict } };
    }
    return { type: "content" };
  });
}

export { Block, soundItems };
