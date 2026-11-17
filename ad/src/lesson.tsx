// Real lesson components on the app's own sample data, projected and graded by the engine's own code (simulate.ts),
// with a seeded shuffle so every render of a frame is the same.
import type { ReactNode } from "react";
import type { ComponentAction, LessonBlock, ShownComponent } from "../../src/api";
import { Block } from "../../src/components/blocks/Block";
import { PictureSourceContext } from "../../src/components/blocks/pictures";
import { samplePictures, samples } from "../../src/components/blocks/samples";
import { Simulator } from "../../src/components/blocks/simulate";
import { applyUpdate, freshProgress, type ComponentProgress } from "../../src/components/blocks/state";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const sim = new Simulator(seeded(7));

export function show(block: LessonBlock): ShownComponent {
  return sim.show(block, "demo");
}

/** The progress after the learner's actions, as the engine would report it. */
export function after(component: ShownComponent, actions: ComponentAction[]): ComponentProgress {
  return actions.flatMap((action) => sim.act(component.id, action)).reduce(applyUpdate, freshProgress());
}

export const idOf = (component: ShownComponent, text: string) => sim.idOf(component.id, text);

const noop = async () => undefined;

export function Lesson({ component, progress, disabled }: { component: ShownComponent; progress?: ComponentProgress; disabled?: boolean }) {
  return <Block component={component} progress={progress ?? freshProgress()} disabled={disabled} act={noop} />;
}

const fromAd = async (src: string) => {
  const file = samplePictures[src.split("/").pop() ?? ""];
  return file ? file.replace("/samples/", "/app-samples/") : undefined;
};

export function Pictures({ children }: { children: ReactNode }) {
  return <PictureSourceContext.Provider value={fromAd}>{children}</PictureSourceContext.Provider>;
}

export { samples };
