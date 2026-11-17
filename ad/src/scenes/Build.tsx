// 3. Sloo builds it: research activity and the course outline, then real lesson components in a constellation
// around the owl, each doing its thing (a diagram drawing itself, code running, a card flipping, an order snapping).
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Growth } from "../../../src/components/Sloo";
import { enter, Layer, Word } from "../kit";
import { after, idOf, Lesson, Pictures, samples, show } from "../lesson";
import { clamp, easeIn, easeInOut, easeOut, spring, squash, useT } from "../time";

export const BUILD = {
  start: 10.0,
  caption: 0.25,
  activities: [0.55, 1.0, 1.45, 1.9],
  outline: 2.05,
  objectives: [2.35, 2.52, 2.69, 2.86],
  fold: 3.75,
  constellation: 3.95,
  // Pair one: a diagram draws itself, a picture, a flashcard turns over.
  diagram: 4.0,
  picture: 4.2,
  flash: 4.3,
  flip: 5.55,
  swap: 6.55,
  // Pair two: code runs, an ordering snaps into place and is graded.
  code: 6.75,
  callout: 6.95,
  ordering: 6.9,
  run: 7.5,
  snap: 7.75,
  correct: 8.45,
  end: 9.6,
};

const diagram = show(samples.diagram);
const code = show(samples.code);
const flashcard = show(samples.flashcard);
const ordering = show(samples.ordering);
const picture = show(samples.cards);
const orderingDone = after(ordering, [{ do: "order", order: samples.ordering.items.map((text) => idOf(ordering, text)) }]);
const flipped = after(flashcard, [{ do: "flip" }]);

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

/** The camera over the constellation: a slow drift and pull-back, shared with Sloo so he sits in the same space. */
export function buildCamera(t: number) {
  const k = clamp((t - BUILD.constellation) / (BUILD.end - BUILD.constellation));
  return { scale: 1.07 - 0.07 * easeInOut(k), dx: 26 - 52 * easeInOut(k), dy: 10 - 16 * k };
}

/** Applies the camera, with parallax by depth (1 = moves with the camera, 0 = fixed far away). */
function camera(t: number, x: number, y: number, depth: number) {
  const c = buildCamera(t);
  const s = 1 + (c.scale - 1) * depth;
  return { x: 960 + (x - 960) * s + c.dx * depth, y: 540 + (y - 540) * s + c.dy * depth, s };
}

function Card({ t, at, cx, top, scale, depth, from, z, blur = 0, children, out, bare }: { t: number; at: number; cx: number; top: number; scale: number; depth: number; from: { dx: number; dy: number }; z: number; blur?: number; children: ReactNode; out?: number; bare?: boolean }) {
  const e = enter(t, at, { dx: from.dx, dy: from.dy, s0: 0.7, duration: 0.75, bounce: 0.28 });
  const bob = Math.sin((t + cx * 0.01) * 1.3) * 6 * depth;
  const p = camera(t, cx + e.x, top + e.y + bob, depth);
  let opacity = e.opacity;
  let s = scale * e.scale * p.s;
  let shift = 0;
  if (out !== undefined && t > out) {
    const k = easeIn(clamp((t - out) / 0.4));
    opacity *= 1 - k * k;
    s *= 1 - 0.1 * k;
    shift = Math.abs(cx - 960) < 100 ? 0 : Math.sign(cx - 960) * 800 * k;
    if (shift === 0) p.y -= 500 * k;
  }
  return (
    <Layer x={p.x + shift} y={p.y} ox={320} oy={0} scale={s} opacity={opacity} blur={blur} z={z}>
      {bare ? <div style={{ width: 640 }}>{children}</div> : <div className="float-card">{children}</div>}
    </Layer>
  );
}

/** The diagram's final layout, measured once from mermaid's untouched SVG: when each part appears and where its centre is. */
interface Plan {
  nodes: { el: SVGGElement; base: string; cx: number; cy: number; at: number }[];
  edges: { el: SVGPathElement; length: number; at: number }[];
  labels: { el: SVGGElement; at: number }[];
}
const plans = new WeakMap<SVGSVGElement, Plan>();

/** Translation of an element from its own transform attribute (mermaid places nodes and labels with translate()). */
function translation(el: Element): [number, number] {
  const m = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/.exec(el.getAttribute("transform") ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function planFor(svg: SVGSVGElement): Plan {
  let plan = plans.get(svg);
  if (plan) return plan;
  // Everything is measured before any reveal style is applied, so the schedule never feeds back on itself.
  const nodes = [...svg.querySelectorAll<SVGGElement>("g.node")].map((el) => {
    const box = el.getBBox();
    const [tx, ty] = translation(el);
    return { el, base: el.getAttribute("transform") ?? "", cx: box.x + box.width / 2, cy: box.y + box.height / 2, y: ty + box.y + box.height / 2, tx };
  });
  const edges = [...svg.querySelectorAll<SVGPathElement>("g.edgePaths path, path.flowchart-link")].map((el) => {
    const box = el.getBBox();
    return { el, length: el.getTotalLength(), y0: box.y, y1: box.y + box.height };
  });
  const labels = [...svg.querySelectorAll<SVGGElement>("g.edgeLabel")].map((el) => {
    const box = el.getBBox();
    const [, ty] = translation(el);
    return { el, y: ty + box.y + box.height / 2 };
  });
  const ys = nodes.map((n) => n.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = 1.25;
  const when = (y: number) => BUILD.diagram + 0.12 + ((y - lo) / Math.max(1, hi - lo)) * span;
  plan = {
    nodes: nodes.map((n) => ({ el: n.el, base: n.base, cx: n.cx, cy: n.cy, at: when(n.y) })),
    // An edge grows once the node it leaves has popped in, and finishes as the node it reaches appears.
    edges: edges.map((e) => ({ el: e.el, length: e.length, at: when(e.y0) + 0.12 })),
    labels: labels.map((l) => ({ el: l.el, at: when(l.y) + 0.2 })),
  };
  plans.set(svg, plan);
  return plan;
}

/**
 * The diagram draws itself inside mermaid's one finished layout: each node scales up about its own centre, each link
 * strokes along its path, each label fades in after its link. Nothing moves once it is drawn, and the card keeps its
 * final size throughout because only SVG transforms, opacity and stroke offsets change.
 */
function DrawnDiagram({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const svg = ref.current?.querySelector<SVGSVGElement>(".block-diagram-canvas svg");
    if (!svg) return;
    const plan = planFor(svg);
    for (const node of plan.nodes) {
      const s = spring(t, node.at, { duration: 0.4, bounce: 0.4 });
      const k = 0.35 + 0.65 * s;
      node.el.setAttribute("transform", `${node.base} translate(${node.cx} ${node.cy}) scale(${k}) translate(${-node.cx} ${-node.cy})`);
      node.el.setAttribute("opacity", String(clamp((t - node.at) / 0.12)));
    }
    for (const edge of plan.edges) {
      const k = easeOut(clamp((t - edge.at) / 0.35));
      edge.el.style.strokeDasharray = `${edge.length} ${edge.length}`;
      edge.el.style.strokeDashoffset = String(edge.length * (1 - k));
      edge.el.setAttribute("opacity", k > 0 ? "1" : "0");
      // The arrowhead sits at the end of the path; it appears with the last stretch of the stroke.
      edge.el.style.markerEnd = k < 0.97 ? "none" : "";
    }
    for (const label of plan.labels) label.el.setAttribute("opacity", String(clamp((t - label.at) / 0.2)));
  });
  return (
    <div ref={ref}>
      <Lesson component={diagram} />
    </div>
  );
}

/**
 * The code runs once, out of sight, as soon as the card mounts, so the output panel has its final size from the first
 * visible frame. Until Run is "pressed" the panel is invisible and the button keeps its first label at its final
 * width; then the lines are revealed one by one in place.
 */
function RunningCode({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const output = root.querySelector<HTMLElement>(".block-code-output");
    if (!output) return;
    const button = [...root.querySelectorAll<HTMLElement>(".block-code-actions button")].find((b) => /^Run/.test(b.textContent ?? ""));
    if (output.hidden && !root.dataset.ran) {
      root.dataset.ran = "1";
      button?.click();
      return;
    }
    output.style.display = "";
    const ran = t >= BUILD.run;
    output.style.visibility = ran ? "" : "hidden";
    if (button) {
      if (!button.dataset.width && button.textContent === "Run again") button.dataset.width = String(button.offsetWidth);
      button.style.minWidth = button.dataset.width ? `${button.dataset.width}px` : "";
      const label = ran ? "Run again" : "Run";
      const text = [...button.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (text && text.textContent !== label) text.textContent = label;
      const p = squash(t, BUILD.run, 0.1, 0.3);
      button.style.transform = `scale(${1 + p}, ${1 - p})`;
    }
    root.querySelectorAll<HTMLElement>(".block-code-output pre span").forEach((line, i) => {
      line.style.opacity = String(clamp((t - BUILD.run - 0.15 - i * 0.12) / 0.08));
    });
    const status = root.querySelector<HTMLElement>(".block-code-status");
    if (status) status.style.opacity = String(clamp((t - BUILD.run - 0.85) / 0.15));
  });
  return (
    <div ref={ref} className="ad-code">
      <Lesson component={code} />
    </div>
  );
}

/** Both faces are laid out in the same cell, so the card has one size; the turn only rotates them. */
function FlippingCard({ t }: { t: number }) {
  const k = clamp((t - BUILD.flip) / 0.5);
  const angle = easeInOut(k) * 180;
  const face = { gridArea: "1 / 1", backfaceVisibility: "hidden" } as const;
  return (
    <div style={{ perspective: 1600, display: "grid" }}>
      <div className="float-card" style={{ ...face, transform: `rotateY(${angle}deg)` }}>
        <Lesson component={flashcard} />
      </div>
      <div className="float-card" style={{ ...face, transform: `rotateY(${angle - 180}deg)` }}>
        <Lesson component={flashcard} progress={flipped} />
      </div>
    </div>
  );
}

/**
 * The ordering is laid out once in its graded form (the engine's real result), so nothing reflows when the grade lands.
 * Before that the items start in the shuffled order the learner saw and slide into place, with the marks, the
 * explanation and the verdict held invisible in their final places.
 */
function SnappingOrder({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const graded = t >= BUILD.correct;
    const items = [...root.querySelectorAll<HTMLElement>(".block-list > li")];
    const pitch = items.length > 1 ? items[1]!.offsetTop - items[0]!.offsetTop : 0;
    const shown = ordering.type === "ordering" ? ordering.items.map((item) => item.text) : [];
    items.forEach((item, slot) => {
      if (!item.dataset.mark0) item.dataset.mark0 = item.getAttribute("data-mark") ?? "";
      if (graded) item.setAttribute("data-mark", item.dataset.mark0);
      else item.removeAttribute("data-mark");
      const text = item.textContent ?? "";
      const start = shown.findIndex((label) => text.includes(label));
      const s = spring(t, BUILD.snap + slot * 0.12, { duration: 0.5, bounce: 0.35 });
      item.style.position = "relative";
      item.style.zIndex = String(10 - slot);
      item.style.transform = `translateY(${(start - slot) * pitch * (1 - s)}px)`;
    });
    for (const el of root.querySelectorAll<HTMLElement>(".block-mark, .block-explanation")) el.style.visibility = graded ? "" : "hidden";
    const verdict = root.querySelector<HTMLElement>(".verdict");
    if (verdict) {
      const s = spring(t, BUILD.correct, { duration: 0.45, bounce: 0.5 });
      verdict.style.visibility = graded ? "" : "hidden";
      verdict.style.transform = `scale(${0.5 + 0.5 * s})`;
      verdict.style.transformOrigin = "left center";
    }
  });
  return (
    <div ref={ref}>
      <Lesson component={ordering} progress={orderingDone} />
    </div>
  );
}

function Outline({ t }: { t: number }) {
  return (
    <section className="section path" style={{ width: 600 }}>
      <article className="card module">
        <p className="module-part">Part 1</p>
        <h3>The staff and its anchors</h3>
        <p className="module-why">Every note you play with your daughter sits on one of these lines or spaces.</p>
        <ul className="objectives">
          {OBJECTIVES.map((statement, i) => {
            const e = enter(t, BUILD.objectives[i]!, { dx: 40, dy: 0, s0: 0.92, duration: 0.45, bounce: 0.35 });
            return (
              <li key={statement} data-status="new" style={{ opacity: e.opacity, transform: `translateX(${e.x}px) scale(${e.scale})` }}>
                <Growth status="new" />
                <span>{statement}</span>
                <span className="status-text">Seed</span>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}

export function BuildScene() {
  const t = useT();
  const fold = clamp((t - BUILD.fold) / 0.4);
  const foldE = easeIn(fold);
  const constellationOut = BUILD.end - 0.45;

  return (
    <>
      {fold < 1 && (
        <>
          <div className="kin" style={{ left: 0, width: 1920, top: 70, fontSize: 92, textAlign: "center", zIndex: 20, opacity: 1 - foldE }}>
            <Word at={BUILD.caption}>Sloo builds </Word> <Word at={BUILD.caption + 0.15}>your </Word> <Word at={BUILD.caption + 0.3} className="accent">course.</Word>
          </div>
          {ACTIVITIES.map(([label, detail], i) => {
            const e = enter(t, BUILD.activities[i]!, { dx: -60, dy: 0, s0: 0.8, duration: 0.5, bounce: 0.4 });
            return (
              <Layer key={label} x={90 + e.x - foldE * 200} y={380 + i * 92} scale={1.75 * e.scale} opacity={e.opacity * (1 - foldE)} z={20}>
                <p className="activity" style={{ width: 340 }}>
                  <span>{label}</span> {detail}
                </p>
              </Layer>
            );
          })}
          {(() => {
            const e = enter(t, BUILD.outline, { dx: 120, dy: 0, s0: 0.85, duration: 0.6, bounce: 0.3 });
            return (
              <Layer x={1185 + e.x + foldE * 300} y={290} scale={1.22 * e.scale} opacity={e.opacity * (1 - foldE)} z={20}>
                <Outline t={t} />
              </Layer>
            );
          })()}
        </>
      )}

      {t >= BUILD.constellation - 0.1 && t < BUILD.swap + 0.5 && (
        <Pictures>
          <Card t={t} at={BUILD.picture} cx={985} top={95} scale={0.6} depth={0.4} from={{ dx: 0, dy: -160 }} z={8} out={BUILD.swap}>
            <Lesson component={picture} />
          </Card>
          <Card t={t} at={BUILD.diagram} cx={415} top={110} scale={1.08} depth={0.9} from={{ dx: -300, dy: 40 }} z={12} out={BUILD.swap}>
            <DrawnDiagram t={t} />
          </Card>
          <Card t={t} at={BUILD.flash} cx={1505} top={250} scale={1.12} depth={1} from={{ dx: 300, dy: 0 }} z={12} out={BUILD.swap} bare>
            <FlippingCard t={t} />
          </Card>
        </Pictures>
      )}
      {t >= BUILD.code - 0.1 && (
        <>
          <Card t={t} at={BUILD.code} cx={415} top={150} scale={1.08} depth={0.9} from={{ dx: -300, dy: 60 }} z={12} out={constellationOut}>
            <RunningCode t={t} />
          </Card>
          <Card t={t} at={BUILD.ordering} cx={1505} top={110} scale={1.06} depth={1} from={{ dx: 300, dy: 60 }} z={12} out={constellationOut}>
            <SnappingOrder t={t} />
          </Card>
        </>
      )}
    </>
  );
}

/** Sloo during the build, scene seconds. Starts where the open left him (on the cushion at the left). */
export function buildPose(t: number) {
  const move = spring(t, 0.0, { duration: 0.8, bounce: 0.2 });
  let x = 520 + (900 - 520) * move;
  let y = 905 + (1010 - 905) * move;
  let size = 760 - 40 * move;
  if (t >= BUILD.fold) {
    const k = spring(t, BUILD.fold, { duration: 0.7, bounce: 0.25 });
    y = 1010 + (1030 - 1010) * k;
    size = 720 + (600 - 720) * k;
    x = 900 + (970 - 900) * k;
    const c = camera(t, x, y, 0.85);
    x = c.x;
    y = c.y;
    size *= c.s;
  }
  return { x, y, size, opacity: 1 };
}

