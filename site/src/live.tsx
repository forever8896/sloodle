// The app's real lesson components, answerable on the page. The engine's projection and graders run here through
// the app's own simulator (components/blocks/simulate.ts), exactly as in the app's ?blocks gallery and the ad.
import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComponentAction, ComponentUpdate, LessonBlock, ShownComponent } from "../../src/api";
import { Block } from "../../src/components/blocks/Block";
import { PictureSourceContext } from "../../src/components/blocks/pictures";
import { samplePictures, samples } from "../../src/components/blocks/samples";
import { Simulator } from "../../src/components/blocks/simulate";
import { applyUpdate, freshProgress, type ComponentProgress } from "../../src/components/blocks/state";

export { samples };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** One simulated engine for the page; seeded, so the shuffles are the same on every visit (and in screenshots). */
export const sim = new Simulator(seeded(7));

/** The progress after some work, as the engine would report it: for laying out a finished state ahead of time. */
export function after(component: ShownComponent, actions: ComponentAction[]): ComponentProgress {
  return actions.flatMap((action) => sim.act(component.id, action)).reduce(applyUpdate, freshProgress());
}

export function useShown(block: LessonBlock): ShownComponent {
  return useMemo(() => sim.show(block, "site"), [block]);
}

/** Live progress for a shown component; `onUpdate` hears every update the engine sends back. */
export function useLive(component: ShownComponent, onUpdate?: (updates: ComponentUpdate[]) => void) {
  const [progress, setProgress] = useState(freshProgress);
  const listener = useRef(onUpdate);
  listener.current = onUpdate;
  const act = useMemo(
    () => async (action: ComponentAction) => {
      // The engine answers over a socket in the app; a short wait keeps the components' pending states honest.
      await new Promise((resolve) => setTimeout(resolve, 220));
      const updates = sim.act(component.id, action);
      setProgress((current) => updates.reduce(applyUpdate, current));
      listener.current?.(updates);
    },
    [component.id],
  );
  return { progress, act, reset: () => setProgress(freshProgress()) };
}

export const LiveBlock = memo(function LiveBlock({ component, progress, act }: { component: ShownComponent; progress: ComponentProgress; act: (action: ComponentAction) => Promise<void> }) {
  return <Block component={component} progress={progress} act={act} />;
});

export const StaticBlock = memo(function StaticBlock({ component, progress }: { component: ShownComponent; progress?: ComponentProgress }) {
  return <Block component={component} progress={progress ?? freshProgress()} act={async () => undefined} />;
});

/**
 * Lays the live component and a finished copy of it in one grid cell. The copy is invisible and inert; it only holds
 * the space the component will need once answered, so grading never pushes the page down.
 */
export function Reserve({ ghost, children, className }: { ghost: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`reserve ${className ?? ""}`}>
      <div className="reserve-ghost" aria-hidden="true" inert>
        {ghost}
      </div>
      <div className="reserve-live">{children}</div>
    </div>
  );
}

const fromSite = async (src: string) => {
  const file = samplePictures[src.split("/").pop() ?? ""];
  return file ? `.${file}` : undefined;
};

/** Lesson pictures come from the page's own copies in public/samples. */
export function Pictures({ children }: { children: ReactNode }) {
  return <PictureSourceContext.Provider value={fromSite}>{children}</PictureSourceContext.Provider>;
}
