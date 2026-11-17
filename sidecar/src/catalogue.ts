// The lesson-component catalogue at work: what each type is for, how it is shown without giving the answer away, and
// how gradable work is graded. Pure and deterministic (given the random source), so the interface's demo and gallery
// can run the same code. The shapes themselves are defined in formats.ts.

import type { AnswerKind, BlockOf, ComponentType, LessonBlock } from "./formats";
import type { BlankPart, ComponentResult, ReviewGrade, ShownComponent, ShownItem, Verdict } from "./types";

export interface ComponentInfo {
  label: string;
  /** The tutor's tool for improvising one mid-session. */
  tool: string;
  /** The learner works on it and the tutor waits for the result, as with a question. */
  awaits: boolean;
  /** The kind of answer event it records, if it records any. */
  evidence?: AnswerKind;
  /** When it teaches better than text. Used in the tool descriptions and both prompts. */
  when: string;
}

export const catalogue: Record<ComponentType, ComponentInfo> = {
  markdown: { label: "Text", tool: "show_content", awaits: false, when: "an explanation, a short passage or a formula: the default when nothing below fits better." },
  diagram: {
    label: "Diagram",
    tool: "show_diagram",
    awaits: false,
    when: "a process with steps and decisions, messages between parties over time, or how several ideas connect. Anything easier to see than to read.",
  },
  code: {
    label: "Code",
    tool: "show_code",
    awaits: false,
    when: "code to read, highlighted and copyable. Mark JavaScript runnable when seeing its output teaches something; the learner presses Run.",
  },
  ordering: {
    label: "Ordering",
    tool: "ask_ordering",
    awaits: true,
    evidence: "ordering",
    when: "the steps of a procedure, a sequence of events, or ranking by size. Graded by the engine. It is recognition, so a right order is not proof on its own: follow it with a why or a written answer.",
  },
  matching: {
    label: "Matching",
    tool: "ask_matching",
    awaits: true,
    evidence: "matching",
    when: "terms to definitions, symbols to meanings, causes to effects. Quick recognition practice, graded by the engine; weak evidence like multiple choice.",
  },
  blanks: {
    label: "Fill in the blanks",
    tool: "ask_blanks",
    awaits: true,
    evidence: "blanks",
    when: "recall of a key term, value or piece of syntax in context: a sentence or a line of code with gaps the learner types. Graded by the engine, and real recall evidence.",
  },
  steps: {
    label: "Worked example",
    tool: "show_steps",
    awaits: true,
    evidence: "prediction",
    when: "new material for a novice: a worked example revealed one step at a time, with a 'predict the next step' question before the steps that matter so the learner commits first.",
  },
  flashcard: {
    label: "Flashcard",
    tool: "show_flashcard",
    awaits: true,
    evidence: "flashcard",
    when: "a quick recall of one fact inside the lesson; the learner flips it and rates themselves. Weak evidence. For long-term retention use add_review_item instead.",
  },
  table: { label: "Comparison table", tool: "show_table", awaits: false, when: "comparing two to five things along the same dimensions." },
  callout: { label: "Callout", tool: "show_callout", awaits: false, when: "one tip, warning, key idea or common mistake that must stand out from the conversation." },
  image: {
    label: "Picture",
    tool: "show_image",
    awaits: false,
    when: "when the thing itself is visual: a tarot card, an organ, a painting, a plant, a building, a place on a map. A real, openly licensed picture found with find_images; up to six side by side to compare. Not for relationships or processes: those are diagrams.",
  },
};

/** The engine path a lesson picture is served from (main.ts); the window adds the run's address and token. */
export function imagePath(courseId: string, imageId: string): string {
  return `/images/${courseId}/${imageId}`;
}

export function typeOf(block: LessonBlock): ComponentType {
  return block.type ?? "markdown";
}

// ---------------------------------------------------------------- what the learner is shown

/** What the engine keeps back so it can grade a showing: answers by the random ids the learner saw. */
export interface ComponentSecret {
  /** Ordering: the item ids in the right order. */
  order?: string[];
  /** Matching: left id to the id of its right partner. */
  pairs?: Record<string, string>;
  /** Matching: right id to its text, for the tutor's report. */
  texts?: Record<string, string>;
}

type Random = () => number;

function randomId(random: Random, taken: Set<string>): string {
  for (;;) {
    const id = `i${Math.floor(random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0")}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** A shuffle that never leaves the list as it was (when it has two or more distinct positions). */
export function shuffled<T>(list: readonly T[], random: Random): T[] {
  if (list.length < 2) return [...list];
  for (let attempt = 0; attempt < 20; attempt++) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    if (out.some((x, i) => x !== list[i])) return out;
  }
  return [...list.slice(1), list[0]!];
}

export function splitBlanks(text: string): BlankPart[] {
  const parts: BlankPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ blank: Number(m[1]) - 1 });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export interface ShowMeta {
  id: string;
  /** The course whose folder holds the pictures; the gallery and demo leave it out. */
  courseId?: string;
  blockId?: string;
  objectiveId?: string;
  title?: string;
}

/** The learner's view of a block, and what stays in the engine to grade it. */
export function present(block: LessonBlock, meta: ShowMeta, random: Random = Math.random): { view: ShownComponent; secret: ComponentSecret } {
  const base = { id: meta.id, blockId: meta.blockId, objectiveId: meta.objectiveId, intent: block.intent, title: meta.title ?? block.title };
  const taken = new Set<string>();
  switch (block.type) {
    case undefined:
    case "markdown":
      return { view: { ...base, type: "markdown", body: block.body }, secret: {} };
    case "diagram":
    case "code":
    case "table":
    case "callout": {
      const { id: _id, intent: _intent, title: _title, ...fields } = block;
      return { view: { ...base, ...fields } as ShownComponent, secret: {} };
    }
    case "ordering": {
      const items: ShownItem[] = block.items.map((text) => ({ id: randomId(random, taken), text }));
      return { view: { ...base, type: "ordering", prompt: block.prompt, items: shuffled(items, random), hintCount: block.hints.length }, secret: { order: items.map((i) => i.id) } };
    }
    case "matching": {
      const left = block.pairs.map((p) => ({ id: randomId(random, taken), text: p.left }));
      const right = [...block.pairs.map((p) => p.right), ...block.distractors].map((text) => ({ id: randomId(random, taken), text }));
      return {
        view: { ...base, type: "matching", prompt: block.prompt, left, right: shuffled(right, random), hintCount: block.hints.length },
        secret: { pairs: Object.fromEntries(left.map((l, i) => [l.id, right[i]!.id])), texts: Object.fromEntries(right.map((r) => [r.id, r.text])) },
      };
    }
    case "blanks":
      return { view: { ...base, type: "blanks", prompt: block.prompt, mode: block.mode, parts: splitBlanks(block.text), hintCount: block.hints.length }, secret: {} };
    case "steps":
      return { view: { ...base, type: "steps", prompt: block.prompt, steps: block.steps.map((s) => (s.predict ? { predict: s.predict } : {})) }, secret: {} };
    case "flashcard":
      return { view: { ...base, type: "flashcard", front: block.front }, secret: {} };
    case "image":
      return {
        view: { ...base, type: "image", caption: block.caption, images: block.images.map((i) => ({ src: imagePath(meta.courseId ?? "sample", i.image), alt: i.alt, caption: i.caption, credit: i.credit })) },
        secret: {},
      };
  }
}

// ---------------------------------------------------------------- grading

export const SUCCESS = 0.8;
/** Partly right work scores at most this, so it can never count as a success. */
const PARTIAL_CAP = 0.75;

export function verdictOf(score: number): Verdict {
  return score >= SUCCESS ? "correct" : score >= 0.4 ? "partial" : "incorrect";
}

const round = (x: number) => Math.round(x * 100) / 100;
const partial = (fraction: number, allRight: boolean) => (allRight ? 1 : round(Math.min(PARTIAL_CAP, Math.max(0, fraction))));

/**
 * Partial credit by how many pairs of items are in the right relative order, rescaled so a random order scores about
 * 0 and only the exact order scores 1. One neighbouring swap in five items scores 0.75.
 */
export function gradeOrdering(correct: string[], submitted: string[], explanation?: string): ComponentResult {
  if (submitted.length !== correct.length || new Set(submitted).size !== submitted.length || submitted.some((id) => !correct.includes(id))) {
    throw new Error("That order does not use each item exactly once.");
  }
  const position = new Map(submitted.map((id, i) => [id, i]));
  let agree = 0;
  let pairs = 0;
  for (let i = 0; i < correct.length; i++) {
    for (let j = i + 1; j < correct.length; j++) {
      pairs += 1;
      if (position.get(correct[i]!)! < position.get(correct[j]!)!) agree += 1;
    }
  }
  const exact = agree === pairs;
  const score = partial(2 * (agree / pairs) - 1, exact);
  return { type: "ordering", verdict: verdictOf(score), score, submitted, correct, explanation };
}

export function gradeMatching(secret: Required<Pick<ComponentSecret, "pairs" | "texts">>, submitted: Record<string, string>): ComponentResult {
  const lefts = Object.keys(secret.pairs);
  const clean: Record<string, string> = {};
  for (const left of lefts) {
    const right = submitted[left];
    if (right !== undefined && right in secret.texts) clean[left] = right;
  }
  const right = lefts.filter((l) => clean[l] === secret.pairs[l]).length;
  const score = partial(right / lefts.length, right === lefts.length);
  return { type: "matching", verdict: verdictOf(score), score, submitted: clean, correct: secret.pairs };
}

const QUOTES: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—−]/g, "-"],
  [/[  ]/g, " "],
];

/**
 * How a typed blank is compared: Unicode-normalised, typographic quotes and dashes made plain, whitespace collapsed.
 * Prose also ignores case (unless the blank says otherwise), surrounding quotes and a trailing full stop or comma.
 * Code keeps case and only ignores spacing around punctuation, so `x+1` matches `x + 1` but `X` does not match `x`.
 */
export function normaliseBlank(value: string, mode: "prose" | "code", caseSensitive?: boolean): string {
  let s = value.normalize("NFKC");
  for (const [pattern, plain] of QUOTES) s = s.replace(pattern, plain);
  s = s.trim().replace(/\s+/g, " ");
  if (mode === "code") {
    s = s.replace(/\s*([^\w\s])\s*/g, "$1");
  } else {
    s = s.replace(/^["'](.*)["']$/, "$1").replace(/[.,;:!]+$/, "").trim();
  }
  if (!(caseSensitive ?? mode === "code")) s = s.toLowerCase();
  return s;
}

function asNumber(value: string): number | undefined {
  const s = value.trim().replace(/(?<=\d),(?=\d{3}\b)/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function blankAccepts(accept: string[], answer: string, mode: "prose" | "code", caseSensitive?: boolean): boolean {
  const given = normaliseBlank(answer, mode, caseSensitive);
  if (given === "") return false;
  const number = asNumber(given);
  return accept.some((a) => {
    const expected = normaliseBlank(a, mode, caseSensitive);
    if (expected === given) return true;
    const n = asNumber(expected);
    return n !== undefined && number !== undefined && Math.abs(n - number) <= 1e-9 * Math.max(1, Math.abs(n));
  });
}

export function gradeBlanks(block: BlockOf<"blanks">, answers: string[]): ComponentResult {
  const submitted = block.blanks.map((_, i) => String(answers[i] ?? "").slice(0, 400));
  const right = block.blanks.map((b, i) => blankAccepts(b.accept, submitted[i]!, block.mode, b.caseSensitive));
  const count = right.filter(Boolean).length;
  const score = partial(count / right.length, count === right.length);
  return { type: "blanks", verdict: verdictOf(score), score, submitted, right, expected: block.blanks.map((b) => b.accept[0]!) };
}

/** A self-rating is what the learner says, not what they showed. */
export const flashcardScore: Record<ReviewGrade, number> = { again: 0, hard: 0.5, good: 0.85, easy: 1 };

// ---------------------------------------------------------------- what the tutor is told

const cut = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);

/** One line per block for the lesson prompt. Never contains an answer. */
export function blockSummary(block: LessonBlock): string {
  switch (block.type) {
    case undefined:
    case "markdown":
      return cut(block.body, 900);
    case "diagram":
      return `diagram (${block.kind}): ${cut(block.description, 400)}`;
    case "code":
      return `code (${block.language}${block.runnable ? ", runnable" : ""})${block.caption ? `: ${cut(block.caption, 200)}` : ""}\n${cut(block.code, 400)}`;
    case "ordering":
      return `ordering of ${block.items.length} items: ${cut(block.prompt, 300)} (the right order stays with the engine)`;
    case "matching":
      return `matching of ${block.pairs.length} pairs: ${cut(block.prompt, 300)} (the pairs stay with the engine)`;
    case "blanks":
      return `fill in ${block.blanks.length} blank(s): ${block.prompt ? `${cut(block.prompt, 200)} ` : ""}"${cut(block.text, 300)}" (answers stay with the engine)`;
    case "steps":
      return `worked example in ${block.steps.length} steps, ${block.steps.filter((s) => s.predict).length} with a prediction first: ${cut(block.prompt, 300)} (the steps stay hidden until revealed)`;
    case "flashcard":
      return `flashcard: ${cut(block.front, 200)}`;
    case "table":
      return `table${block.caption ? ` "${block.caption}"` : ""}: ${block.columns.join(" | ")}; rows ${block.rows.map((r) => r.label).join(", ")}`;
    case "callout":
      return `callout (${block.tone}): ${cut(block.body, 300)}`;
    case "image":
      return `${block.images.length === 1 ? "picture" : `${block.images.length} pictures`}${block.caption ? ` "${cut(block.caption, 200)}"` : ""}: ${block.images.map((i) => `${cut(i.alt, 200)}${i.credit ? ` (file "${i.credit.title}")` : ""}`).join("; ")}`;
  }
}

/** The result as the tutor reads it, with the answer now that the learner has answered. */
export function describeResult(view: ShownComponent, result: ComponentResult, secret: ComponentSecret): string {
  const textOf = (items: ShownItem[], id: string) => items.find((i) => i.id === id)?.text ?? "(none)";
  if (result.type === "ordering" && view.type === "ordering") {
    return `Learner's order: ${result.submitted.map((id, i) => `${i + 1}. ${textOf(view.items, id)}`).join("  ")}\nRight order: ${result.correct.map((id, i) => `${i + 1}. ${textOf(view.items, id)}`).join("  ")}`;
  }
  if (result.type === "matching" && view.type === "matching") {
    return view.left
      .map((l) => {
        const chosen = result.submitted[l.id];
        const right = result.correct[l.id]!;
        return `- ${l.text} → ${chosen ? secret.texts?.[chosen] : "(left empty)"}${chosen === right ? " (right)" : `; should be ${secret.texts?.[right]}`}`;
      })
      .join("\n");
  }
  if (result.type === "blanks") {
    return result.submitted.map((answer, i) => `- Blank ${i + 1}: "${answer || "(empty)"}" ${result.right[i] ? "right" : `wrong; expected "${result.expected[i]}"`}`).join("\n");
  }
  return "";
}
