// ?blocks: every lesson component with sample data, in each of its states. Development only (see main.tsx).
// "Try it" cards run against the engine's own projection and graders (simulate.ts); the rest are fixed states.
import { useMemo, useState } from "react";
import type { ComponentAction, ComponentUpdate, LessonBlock, ShownComponent } from "../../api";
import { Block } from "./Block";
import { fromSamples, PictureSourceContext } from "./pictures";
import { samples } from "./samples";
import { Simulator } from "./simulate";
import { applyUpdate, freshProgress, type ComponentProgress } from "./state";
import "./gallery.css";

interface Shown {
  label: string;
  component: ShownComponent;
  progress: ComponentProgress;
  act?: (action: ComponentAction) => Promise<void>;
}

const OFFLINE = () => Promise.reject(new Error("Lost the connection to the sloodle engine."));

/** A component after some of the learner's work, run through the simulated engine. */
function after(sim: Simulator, block: LessonBlock, work: (id: string) => ComponentAction[], extra: ComponentUpdate[] = []): { component: ShownComponent; progress: ComponentProgress } {
  const component = sim.show(block, "demo");
  const updates = work(component.id).flatMap((action) => sim.act(component.id, action));
  return { component, progress: [...updates, ...extra].reduce(applyUpdate, freshProgress()) };
}

function Live({ block }: { block: LessonBlock }) {
  const sim = useMemo(() => new Simulator(), []);
  const component = useMemo(() => sim.show(block, "demo"), [sim, block]);
  const [progress, setProgress] = useState(freshProgress);
  const act = async (action: ComponentAction) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const updates = sim.act(component.id, action);
    setProgress((current) => updates.reduce(applyUpdate, current));
  };
  return <Block component={component} progress={progress} act={act} />;
}

function states(): { type: string; live: LessonBlock[]; fixed: Shown[] }[] {
  const sim = new Simulator();
  const s = samples;
  const ordering = (order: (ids: string[]) => string[]) =>
    after(sim, s.ordering, (id) => [{ do: "order", order: order(s.ordering.items.map((text) => sim.idOf(id, text))) }]);
  const matching = (rights: string[]) =>
    after(sim, s.matching, (id) => [{ do: "match", pairs: Object.fromEntries(s.matching.pairs.map((p, i) => [sim.idOf(id, p.left), sim.idOf(id, rights[i]!)])) }]);
  const blanks = (answers: string[]) => after(sim, s.blanks, () => [{ do: "fill", answers }]);
  const errorOf = (block: LessonBlock): Shown => ({ label: "Error: the engine refuses or is unreachable (press a button)", component: sim.show(block, "demo"), progress: freshProgress(), act: OFFLINE });

  return [
    {
      type: "Ordering",
      live: [s.ordering],
      fixed: [
        { label: "Answered correct", ...ordering((ids) => ids) },
        { label: "Partial: one neighbouring swap", ...ordering(([a, b, ...rest]) => [b!, a!, ...rest]) },
        { label: "Incorrect: reversed", ...ordering((ids) => [...ids].reverse()) },
        { label: "With a hint taken", ...after(sim, s.ordering, () => [{ do: "hint" }]) },
        errorOf(s.ordering),
      ],
    },
    {
      type: "Matching",
      live: [s.matching],
      fixed: [
        { label: "Answered correct", ...matching(["E", "G", "B", "F"]) },
        { label: "Partial", ...matching(["E", "G", "F", "C"]) },
        { label: "Incorrect", ...matching(["G", "B", "F", "E"]) },
        errorOf(s.matching),
      ],
    },
    {
      type: "Fill in the blanks",
      live: [s.blanks, s.codeBlanks],
      fixed: [
        { label: "Answered correct", ...blanks(["e", "D."]) },
        { label: "Partial", ...blanks(["E", "C"]) },
        { label: "Incorrect", ...blanks(["A", ""]) },
        { label: "Code, answered correct", ...after(sim, s.codeBlanks, () => [{ do: "fill", answers: ["'B'", "2"] }]) },
        errorOf(s.blanks),
      ],
    },
    {
      type: "Worked example",
      live: [s.steps],
      fixed: [
        { label: "Partway, prediction partly right", ...after(sim, s.steps, () => [{ do: "reveal" }, { do: "reveal", prediction: "G, I think" }]) },
        {
          label: "Finished, predictions correct and incorrect",
          ...after(sim, s.steps, () => [{ do: "reveal" }], [
            { kind: "step", index: 1, text: s.steps.steps[1]!.text, prediction: { answer: "G", verdict: "correct", score: 1 } },
            { kind: "step", index: 2, text: s.steps.steps[2]!.text, prediction: { answer: "C", verdict: "incorrect", score: 0 } },
          ]),
        },
        errorOf(s.steps),
      ],
    },
    {
      type: "Flashcard",
      live: [s.flashcard],
      fixed: [
        { label: "Flipped", ...after(sim, s.flashcard, () => [{ do: "flip" }]) },
        { label: "Rated", ...after(sim, s.flashcard, () => [{ do: "flip" }, { do: "rate", rating: "good" }]) },
        errorOf(s.flashcard),
      ],
    },
    {
      type: "Diagram",
      live: [s.diagram, s.sequence],
      fixed: [{ label: "Error: fails to parse, shows the description (and tells the tutor)", component: sim.show(s.brokenDiagram, "demo"), progress: freshProgress(), act: async () => undefined }],
    },
    { type: "Code", live: [s.code, s.python, s.failingCode], fixed: [] },
    {
      type: "Picture",
      live: [s.picture, s.cards],
      fixed: [{ label: "Not cached: shows the alt text", component: sim.show(s.missingPicture, "demo"), progress: freshProgress() }],
    },
    { type: "Comparison table", live: [s.table], fixed: [] },
    { type: "Callout", live: [s.tip, s.warning, s.keyIdea, s.mistake], fixed: [] },
    { type: "Text", live: [s.markdown], fixed: [] },
  ];
}

function BlockGallery() {
  const sections = useMemo(states, []);
  return (
    <PictureSourceContext value={fromSamples}>
    <main className="block-gallery">
      <div className="block-gallery-column">
        <header>
          <h1>Lesson components</h1>
          <p>
            Every component Sloo can show, with sample data. “Try it” cards are answerable and graded by the engine's own code; the rest show fixed states. The
            failing code sample stops after 3 seconds. Development only.
          </p>
          <nav aria-label="Components">
            {sections.map((section) => (
              <a key={section.type} href={`#${section.type.toLowerCase().replace(/\W+/g, "-")}`}>
                {section.type}
              </a>
            ))}
          </nav>
        </header>
        {sections.map((section) => (
          <section key={section.type} id={section.type.toLowerCase().replace(/\W+/g, "-")} aria-label={section.type}>
            <h2>{section.type}</h2>
            {section.live.map((block) => (
              <div key={block.id} className="block-gallery-case">
                <p className="chip" data-tone="lavender">
                  {section.fixed.length ? "Try it (fresh)" : "Sample"}
                </p>
                <Live block={block} />
              </div>
            ))}
            {section.fixed.map((shown) => (
              <div key={shown.label} className="block-gallery-case">
                <p className="chip">{shown.label}</p>
                <Block component={shown.component} progress={shown.progress} act={shown.act ?? (async () => undefined)} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
    </PictureSourceContext>
  );
}

export { BlockGallery };
