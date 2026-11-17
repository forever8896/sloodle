// 3. Sloo builds your course: the research activity and the outline assembling, then a constellation of the app's
// real lesson components, live. Their entrances, the diagram drawing itself, the card's peek and the first run of the
// code are the ad's (ad/src/scenes/Build.tsx), started when they scroll into view; after that they are the visitor's.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Word } from "../../../ad/src/kit";
import { SceneTime } from "../../../ad/src/time";
import type { ComponentUpdate } from "../../../src/api";
import { Growth } from "../../../src/components/Sloo";
import { after, LiveBlock, Pictures, Reserve, samples, StaticBlock, useLive, useShown } from "../live";
import { clamp, easeOut, enterStyle, SETTLED, spring, squash, useBeatClock, useNear } from "../motion";
import { owl, OwlStop, useOwlZone } from "../owl";

const ACTIVITIES: [string, string][] = [
  ["Searching", "how adults learn to sight-read"],
  ["Reading", "musictheory.net/lessons/10"],
  ["Finding pictures", "treble clef staff"],
  ["Laying out your course", ""],
];

const OBJECTIVES = [
  "Can say how many lines and spaces a staff has and count them from the bottom.",
  "Can name any marked line of the treble staff in under five seconds.",
  "Can name any marked space of the treble staff in under five seconds.",
  "Can order three notes from lowest to highest by their height on the staff.",
];

function Plan() {
  const { zone, stop } = useOwlZone("plan", "thinking");
  const t = useBeatClock(zone, 4, { amount: 0.35 });
  useEffect(() => {
    if (t > 2.1) owl.setMood("plan", "writing");
  }, [t]);
  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="plan" className="plan">
      <SceneTime.Provider value={t}>
        <h2 id="build-title" className="display center">
          <Word at={0.05}>Sloo</Word> <Word at={0.2}>builds</Word> <Word at={0.35}>your</Word> <Word at={0.5} className="accent">course.</Word>
        </h2>
      </SceneTime.Provider>
      <p className="lede center">It reads up on how your subject is best taught, then designs backward from your goal: skills you can observe, in an order that builds.</p>
      <div className="plan-stage">
        <ul className="activities" aria-label="What Sloo is doing">
          {ACTIVITIES.map(([label, detail], i) => (
            <li key={label} style={enterStyle(t, 0.7 + i * 0.4, { dx: -60, dy: 0, s0: 0.8, duration: 0.5, bounce: 0.4 })}>
              <p className="activity">
                <span>{label}</span> {detail}
              </p>
            </li>
          ))}
        </ul>
        <OwlStop id="plan" stopRef={stop} className="stop-plan" />
        <div className="outline-wrap" style={enterStyle(t, 1.9, { dx: 120, dy: 0, s0: 0.88, duration: 0.6, bounce: 0.3 })}>
          <section className="section path" aria-label="Course outline">
            <article className="card module">
              <p className="module-part">Part 1</p>
              <h3>The staff and its anchors</h3>
              <p className="module-why">Every note you play with your daughter sits on one of these lines or spaces.</p>
              <ul className="objectives">
                {OBJECTIVES.map((statement, i) => (
                  <li key={statement} data-status="new" style={enterStyle(t, 2.2 + i * 0.17, { dx: 40, dy: 0, s0: 0.92, duration: 0.45, bounce: 0.35 })}>
                    <Growth status="new" />
                    <span>{statement}</span>
                    <span className="status-text">Seed</span>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */

/** The diagram's final layout, measured once from mermaid's own SVG: when each part appears and where its centre is. */
interface DrawPlan {
  nodes: { el: SVGGElement; base: string; cx: number; cy: number; at: number }[];
  edges: { el: SVGPathElement; length: number; at: number }[];
  labels: { el: SVGGElement; at: number }[];
}
const plans = new WeakMap<SVGSVGElement, DrawPlan>();

function translation(el: Element): [number, number] {
  const m = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/.exec(el.getAttribute("transform") ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function planFor(svg: SVGSVGElement, start: number): DrawPlan {
  let plan = plans.get(svg);
  if (plan) return plan;
  const nodes = [...svg.querySelectorAll<SVGGElement>("g.node")].map((el) => {
    const box = el.getBBox();
    const [, ty] = translation(el);
    return { el, base: el.getAttribute("transform") ?? "", cx: box.x + box.width / 2, cy: box.y + box.height / 2, y: ty + box.y + box.height / 2 };
  });
  const edges = [...svg.querySelectorAll<SVGPathElement>("g.edgePaths path, path.flowchart-link")].map((el) => ({ el, length: el.getTotalLength(), y0: el.getBBox().y }));
  const labels = [...svg.querySelectorAll<SVGGElement>("g.edgeLabel")].map((el) => {
    const box = el.getBBox();
    return { el, y: translation(el)[1] + box.y + box.height / 2 };
  });
  const ys = nodes.map((n) => n.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const when = (y: number) => start + ((y - lo) / Math.max(1, hi - lo)) * 1.25;
  plan = {
    nodes: nodes.map((n) => ({ el: n.el, base: n.base, cx: n.cx, cy: n.cy, at: when(n.y) })),
    edges: edges.map((e) => ({ el: e.el, length: e.length, at: when(e.y0) + 0.12 })),
    labels: labels.map((l) => ({ el: l.el, at: when(l.y) + 0.2 })),
  };
  plans.set(svg, plan);
  return plan;
}

function draw(svg: SVGSVGElement, t: number, start: number) {
  const plan = planFor(svg, start);
  for (const node of plan.nodes) {
    const k = 0.35 + 0.65 * spring(t, node.at, { duration: 0.4, bounce: 0.4 });
    node.el.setAttribute("transform", t >= SETTLED ? node.base : `${node.base} translate(${node.cx} ${node.cy}) scale(${k}) translate(${-node.cx} ${-node.cy})`);
    node.el.setAttribute("opacity", String(clamp((t - node.at) / 0.12)));
  }
  for (const edge of plan.edges) {
    const k = easeOut(clamp((t - edge.at) / 0.35));
    edge.el.style.strokeDasharray = k >= 1 ? "" : `${edge.length} ${edge.length}`;
    edge.el.style.strokeDashoffset = k >= 1 ? "" : String(edge.length * (1 - k));
    edge.el.setAttribute("opacity", k > 0 ? "1" : "0");
    edge.el.style.markerEnd = k < 0.97 ? "none" : "";
  }
  for (const label of plan.labels) label.el.setAttribute("opacity", String(clamp((t - label.at) / 0.2)));
  svg.dataset.planned = "";
}

/**
 * The diagram draws itself inside mermaid's one finished layout. Its canvas has its final size before mermaid has even
 * loaded (site.css reserves it), and only SVG transforms, opacity and stroke offsets change while it draws.
 */
function DrawnDiagram({ t, start }: { t: number; start: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const component = useShown(samples.diagram);
  const time = useRef(t);
  time.current = t;
  useLayoutEffect(() => {
    const svg = ref.current?.querySelector<SVGSVGElement>(".block-diagram-canvas svg");
    if (svg) draw(svg, t, start);
  });
  // The SVG arrives asynchronously (mermaid loads on demand): plan it the moment it lands, before it is painted.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const observer = new MutationObserver(() => {
      const svg = root.querySelector<SVGSVGElement>(".block-diagram-canvas svg:not([data-planned])");
      if (svg) draw(svg, time.current, start);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [start]);
  return (
    <div ref={ref} className="site-diagram" data-drawing={t < SETTLED || undefined}>
      <StaticBlock component={component} />
    </div>
  );
}

/** The code runs in the app's own sandbox. The first run is pressed for you as it comes into view; Run again is yours. */
function RunningCode({ t, at }: { t: number; at: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const component = useShown(samples.code);
  const pressed = useRef(false);
  useLayoutEffect(() => {
    const button = [...(ref.current?.querySelectorAll<HTMLElement>(".block-code-actions button") ?? [])].find((b) => /^Run/.test(b.textContent ?? ""));
    if (!button) return;
    // Pressed once when its moment comes (or straight away in the settled, reduced-motion page).
    if (t >= at && !pressed.current) {
      pressed.current = true;
      button.click();
    }
    const p = t >= SETTLED ? 0 : squash(t, at, 0.1, 0.3);
    button.style.transform = p ? `scale(${1 + p}, ${1 - p})` : "";
  });
  return (
    <div ref={ref} className="site-code">
      <StaticBlock component={component} />
    </div>
  );
}

/** Both faces share one grid cell, so the card has one size; the turn only rotates them. */
function FlippingCard({ t, peek }: { t: number; peek: number }) {
  const component = useShown(samples.flashcard);
  const [flipped, setFlipped] = useState(false);
  const front = useLive(component, (updates) => updates.some((u) => u.kind === "flipped") && setFlipped(true));
  const back = useLive(component, (updates) => updates.some((u) => u.kind === "rated") && owl.react("correct"));
  const backFace = useRef<HTMLDivElement>(null);
  const shownBack = { ...back.progress, back: back.progress.back ?? samples.flashcard.back };

  useEffect(() => {
    if (flipped) backFace.current?.querySelector<HTMLElement>(".block-flashcard-back")?.focus({ preventScroll: true });
  }, [flipped]);

  // A little peek at the back as it arrives, to say it turns over.
  const k = t >= SETTLED ? 0 : clamp((t - peek) / 0.9);
  const wobble = Math.sin(k * Math.PI) * 22 * (1 - k * 0.3);
  const angle = flipped ? 180 : wobble;
  const face: CSSProperties = { gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  return (
    <div className="flip" style={{ perspective: 1600 }}>
      <div className="flip-face float-card" style={{ ...face, transform: `rotateY(${angle}deg)` }} inert={flipped}>
        <LiveBlock component={component} progress={front.progress} act={front.act} />
      </div>
      <div ref={backFace} className="flip-face float-card" style={{ ...face, transform: `rotateY(${angle - 180}deg)` }} inert={!flipped} aria-hidden={!flipped}>
        <LiveBlock component={component} progress={shownBack} act={back.act} />
      </div>
    </div>
  );
}

/** The ordering, laid over its graded form so grading never reflows; the first item nudges once to say it moves. */
function LiveOrdering({ t, nudge }: { t: number; nudge: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const component = useShown(samples.ordering);
  const graded = useState(() => after(component, [{ do: "order", order: samples.ordering.items.map((text) => (component.type === "ordering" ? component.items.find((i) => i.text === text)!.id : "")) }]))[0];
  const live = useLive(component, (updates: ComponentUpdate[]) => {
    const result = updates.find((u) => u.kind === "graded");
    if (result?.kind === "graded" && result.result.verdict === "correct") owl.react("correct");
  });
  useLayoutEffect(() => {
    const item = ref.current?.querySelector<HTMLElement>(".reserve-live .block-list > li");
    if (!item) return;
    const k = t >= SETTLED ? 1 : clamp((t - nudge) / 0.8);
    item.style.translate = k > 0 && k < 1 ? `0 ${Math.sin(k * Math.PI * 2) * 7 * (1 - k)}px` : "";
  });
  return (
    <div ref={ref}>
      <Reserve ghost={<StaticBlock component={component} progress={graded} />}>
        <LiveBlock component={component} progress={live.progress} act={live.act} />
      </Reserve>
    </div>
  );
}

function PictureCard() {
  const component = useShown(samples.cards);
  return <StaticBlock component={component} />;
}

function Card({ t, at, from, rotate = 0, className, depth, children }: { t: number; at: number; from: { dx: number; dy: number }; rotate?: number; className?: string; depth?: number; children: ReactNode }) {
  return (
    <div className={`constellation-cell ${className ?? ""}`} style={{ "--depth": depth ?? 0 } as CSSProperties}>
      <div className="depth">
        <div style={enterStyle(t, at, { ...from, s0: 0.72, duration: 0.75, bounce: 0.28, rotate })}>{children}</div>
      </div>
    </div>
  );
}

const T = { diagram: 0.0, picture: 0.25, flash: 0.4, code: 0.65, ordering: 0.8, draw: 0.45, run: 2.0, peek: 2.6, nudge: 3.1 };

function Constellation() {
  const { zone, stop } = useOwlZone("blocks", "writing");
  const near = useNear(zone);
  const t = useBeatClock(zone, 5, { amount: 0.12 });
  const narrow = useNarrow();
  const side = narrow ? 0 : 1;
  useEffect(() => {
    if (t >= SETTLED) owl.setMood("blocks", "happy");
  }, [t]);

  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="blocks" className="blocks">
      <h3 className="display-sm center">
        Then it teaches with real lesson pieces. <span className="accent">These ones work.</span>
      </h3>
      <p className="lede center">Flip the card, run the code, put the notes in order. They are the app's own components, graded by its own code, right here.</p>
      {near ? (
        <Pictures>
          <div className="constellation">
            <Card t={t} at={T.diagram} from={{ dx: -300 * side, dy: 60 }} rotate={-1.2 * side} className="c-diagram" depth={0.6}>
              <div className="float-card">
                <DrawnDiagram t={t} start={T.draw} />
              </div>
            </Card>
            <Card t={t} at={T.picture} from={{ dx: 0, dy: -140 }} rotate={1.8 * side} className="c-picture" depth={0.25}>
              <div className="float-card">
                <PictureCard />
              </div>
            </Card>
            <div className="constellation-cell c-owl">
              <OwlStop id="blocks" stopRef={stop} className="stop-blocks" />
            </div>
            <Card t={t} at={T.flash} from={{ dx: 300 * side, dy: 40 }} rotate={1.2 * side} className="c-flash" depth={0.9}>
              <FlippingCard t={t} peek={T.peek} />
            </Card>
            <Card t={t} at={T.code} from={{ dx: -300 * side, dy: 80 }} rotate={0.8 * side} className="c-code" depth={0.4}>
              <div className="float-card">
                <RunningCode t={t} at={T.run} />
              </div>
              <p className="cell-note">Runs in the app's sealed sandbox: no network, no access to the page, stopped after 3 seconds.</p>
            </Card>
            <Card t={t} at={T.ordering} from={{ dx: 300 * side, dy: 80 }} rotate={-1 * side} className="c-order" depth={0.75}>
              <div className="float-card">
                <LiveOrdering t={t} nudge={T.nudge} />
              </div>
            </Card>
          </div>
        </Pictures>
      ) : (
        <div className="constellation constellation-placeholder">
          <OwlStop id="blocks" stopRef={stop} className="stop-blocks" />
        </div>
      )}
    </div>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return narrow;
}

export function Build() {
  return (
    <section id="build" className="beat build" aria-labelledby="build-title">
      <Plan />
      <Constellation />
    </section>
  );
}

