import { describe, expect, test } from "bun:test";
import { blankAccepts, gradeBlanks, gradeMatching, gradeOrdering, normaliseBlank, present, shuffled } from "./catalogue";
import { exportCourse, importCourse } from "./courseio";
import { blockSchema, componentTypes, courseSchema, type BlockOf, type LessonBlock } from "./formats";
import { applyEvidence, strongEvidenceKinds } from "./learner";
import { deriveObserved } from "./observe";
import { answer, courseWithEveryBlock, everyBlock, sampleCourse } from "./testdata";

const now = new Date("2026-11-16T12:00:00Z");
const block = <T extends LessonBlock["type"]>(type: T) => everyBlock().find((b) => b.type === type) as Extract<LessonBlock, { type: T }>;

/** A seeded random source, so tests that shuffle are repeatable. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("schema", () => {
  test("every catalogue type has a valid sample block", () => {
    const blocks = everyBlock();
    expect(new Set(blocks.map((b) => b.type ?? "markdown"))).toEqual(new Set(componentTypes));
    for (const b of blocks) expect(blockSchema.safeParse(b).success).toBe(true);
    expect(courseSchema.safeParse(courseWithEveryBlock()).success).toBe(true);
  });

  test("a block without a type is Markdown, and old courses parse unchanged", () => {
    const old = sampleCourse();
    expect(old.modules[0]!.objectives[0]!.lesson.blocks.every((b) => b.type === undefined)).toBe(true);
    expect(courseSchema.parse(old)).toEqual(old);
    expect(blockSchema.safeParse({ id: "b", intent: "explain", type: "markdown", body: "x" }).success).toBe(true);
  });

  test("each type rejects missing fields, wrong fields and unknown types", () => {
    const bad: unknown[] = [
      { id: "b", intent: "visual", type: "chart", body: "x" },
      { id: "b", intent: "visual", type: "diagram", kind: "flowchart", source: "flowchart LR" },
      { id: "b", intent: "visual", type: "diagram", kind: "gantt", source: "x", description: "y" },
      { ...block("code"), language: "cobol" },
      { ...block("ordering"), items: ["only", "two"] },
      { ...block("ordering"), items: ["one\ntwo", "b", "c"] },
      { ...block("matching"), pairs: [{ left: "a" }] },
      { ...block("blanks"), blanks: [] },
      { ...block("steps"), steps: [{ text: "one" }] },
      { ...block("flashcard"), back: undefined },
      { ...block("table"), columns: ["only"] },
      { ...block("callout"), tone: "fun" },
      { ...block("callout"), body: "x".repeat(2001) },
      { ...block("callout"), checkId: "m1-read-c1" },
      { ...block("diagram"), onclick: "alert(1)" },
    ];
    for (const b of bad) expect(blockSchema.safeParse(b).success).toBe(false);
  });

  test("cross-checks: gap markers, duplicates, table shape and runnable code", () => {
    const withBlock = (b: LessonBlock) => {
      const course = sampleCourse();
      course.modules[0]!.objectives[1]!.lesson.blocks = [b];
      return courseSchema.safeParse(course);
    };
    expect(withBlock({ ...block("blanks"), text: "Only {{1}} here." }).success).toBe(false);
    expect(withBlock({ ...block("blanks"), text: "Out of order {{2}} and {{1}}." }).success).toBe(false);
    expect(withBlock({ ...block("ordering"), items: ["A", "b", "a"] }).success).toBe(false);
    expect(withBlock({ ...block("matching"), distractors: ["1/2"] }).success).toBe(false);
    expect(withBlock({ ...block("table"), rows: [{ label: "x", cells: ["only one"] }] }).success).toBe(false);
    const python = withBlock({ ...block("code"), language: "python" as const });
    expect(python.success).toBe(false);
    expect(JSON.stringify(python.error?.issues)).toContain("only JavaScript can be runnable");
    expect(withBlock({ ...block("code"), language: "python" as const, runnable: false }).success).toBe(true);
  });
});

describe("sharing", () => {
  test("a course with every type exports and imports intact", () => {
    const course = courseWithEveryBlock();
    const { doc } = importCourse(exportCourse(course).json, now);
    expect(doc.modules[0]!.objectives[1]!.lesson.blocks).toEqual(courseSchema.parse(course).modules[0]!.objectives[1]!.lesson.blocks);
  });

  test("an imported component is cleaned and checked like the rest of the course", () => {
    const course = courseWithEveryBlock();
    const diagram = course.modules[0]!.objectives[1]!.lesson.blocks[1] as BlockOf<"diagram">;
    diagram.description = "Steps‮ in order​";
    expect((importCourse(JSON.stringify(course), now).doc.modules[0]!.objectives[1]!.lesson.blocks[1] as BlockOf<"diagram">).description).toBe("Steps in order");

    const bad = courseWithEveryBlock();
    (bad.modules[0]!.objectives[1]!.lesson.blocks[5] as BlockOf<"blanks">).text = "No gaps at all.";
    expect(() => importCourse(JSON.stringify(bad), now)).toThrow("{{1}}");
    const smuggled = courseWithEveryBlock() as any;
    smuggled.modules[0].objectives[1].lesson.blocks[2].autorun = true;
    expect(() => importCourse(JSON.stringify(smuggled), now)).toThrow("Unrecognized key");
  });
});

describe("what the learner is sent", () => {
  const secrets = (b: LessonBlock): string[] => {
    switch (b.type) {
      case "blanks":
        return b.blanks.flatMap((x) => x.accept);
      case "steps":
        return b.steps.map((s) => s.text);
      case "flashcard":
        return [b.back];
      case "ordering":
        return b.explanation ? [b.explanation, ...b.hints] : b.hints;
      case "matching":
        return b.hints;
      default:
        return [];
    }
  };

  test("no answer key appears in any view", () => {
    for (const b of everyBlock()) {
      const { view } = present(b, { id: "s1" }, seeded());
      const json = JSON.stringify(view);
      for (const secret of secrets(b)) expect(json).not.toContain(secret);
    }
  });

  test("an ordering is shuffled, and its ids say nothing about the order", () => {
    const b = block("ordering");
    for (let seed = 1; seed < 40; seed++) {
      const { view, secret } = present(b, { id: "s1" }, seeded(seed));
      if (view.type !== "ordering") throw new Error("not an ordering");
      expect(view.items.map((i) => i.text)).not.toEqual(b.items);
      expect(new Set(view.items.map((i) => i.text))).toEqual(new Set(b.items));
      expect(secret.order).toHaveLength(3);
      // Ids are random, not positions or slugs of the items.
      for (const item of view.items) expect(item.id).toMatch(/^i[0-9a-z]{6}$/);
    }
    // Over many showings the right first item's id is not predictable from its sort order.
    const firstIsSmallest = Array.from({ length: 60 }, (_, seed) => present(b, { id: "s" }, seeded(seed + 100)).secret.order!).filter((order) => order[0] === [...order].sort()[0]).length;
    expect(firstIsSmallest).toBeGreaterThan(5);
    expect(firstIsSmallest).toBeLessThan(55);
  });

  test("a matching shuffles the right column and keeps the pairs back", () => {
    const b = block("matching");
    const { view, secret } = present(b, { id: "s1" }, seeded(3));
    if (view.type !== "matching") throw new Error("not a matching");
    expect(view.left.map((l) => l.text)).toEqual(b.pairs.map((p) => p.left));
    expect(view.right.map((r) => r.text)).not.toEqual([...b.pairs.map((p) => p.right), ...b.distractors]);
    expect(view.right).toHaveLength(4);
    expect(Object.keys(secret.pairs!)).toEqual(view.left.map((l) => l.id));
  });

  test("shuffled never returns the list as it was", () => {
    for (let seed = 0; seed < 200; seed++) expect(shuffled(["a", "b"], seeded(seed))).toEqual(["b", "a"]);
  });
});

describe("grading", () => {
  test("ordering: exact is correct, a near miss is partial, reversed is incorrect", () => {
    const right = ["a", "b", "c", "d", "e"];
    expect(gradeOrdering(right, right)).toMatchObject({ verdict: "correct", score: 1 });
    expect(gradeOrdering(right, ["a", "c", "b", "d", "e"])).toMatchObject({ verdict: "partial", score: 0.75 });
    expect(gradeOrdering(right, ["e", "d", "c", "b", "a"])).toMatchObject({ verdict: "incorrect", score: 0 });
    // Partly right work never reaches the success threshold, however close.
    const long = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(gradeOrdering(long, ["b", "a", "c", "d", "e", "f", "g", "h"]).score).toBeLessThan(0.8);
    expect(() => gradeOrdering(right, ["a", "a", "b", "c", "d"])).toThrow();
    expect(() => gradeOrdering(right, ["a", "b", "c", "d"])).toThrow();
  });

  test("matching: credit per right pair, unknown ids ignored", () => {
    const secret = { pairs: { l1: "r1", l2: "r2", l3: "r3", l4: "r4" }, texts: { r1: "1", r2: "2", r3: "3", r4: "4", r5: "5" } };
    expect(gradeMatching(secret, { l1: "r1", l2: "r2", l3: "r3", l4: "r4" })).toMatchObject({ verdict: "correct", score: 1 });
    expect(gradeMatching(secret, { l1: "r1", l2: "r2", l3: "r4", l4: "r3" })).toMatchObject({ verdict: "partial", score: 0.5 });
    expect(gradeMatching(secret, { l1: "r1", l2: "r2", l3: "r3", l4: "r5" })).toMatchObject({ verdict: "partial", score: 0.75 });
    const tampered = gradeMatching(secret, { l1: "nope", l9: "r1" });
    expect(tampered).toMatchObject({ verdict: "incorrect", score: 0, submitted: {} });
  });

  test("blanks: normalisation in prose", () => {
    expect(normaliseBlank("  The   Numerator. ", "prose")).toBe("the numerator");
    expect(normaliseBlank("“numerator”", "prose")).toBe("numerator");
    expect(blankAccepts(["numerator"], "Numerator", "prose")).toBe(true);
    expect(blankAccepts(["numerator"], "numerators", "prose")).toBe(false);
    expect(blankAccepts(["Paris"], "paris", "prose", true)).toBe(false);
    expect(blankAccepts(["don't"], "don’t", "prose")).toBe(true);
    expect(blankAccepts(["1.5"], "1.50", "prose")).toBe(true);
    expect(blankAccepts(["0.5"], ".5", "prose")).toBe(true);
    expect(blankAccepts(["1000"], "1,000", "prose")).toBe(true);
    expect(blankAccepts(["1.5"], "15", "prose")).toBe(false);
    expect(blankAccepts(["x"], "", "prose")).toBe(false);
  });

  test("blanks: code keeps case and ignores spacing around punctuation", () => {
    expect(blankAccepts(["x + 1"], "x+1", "code")).toBe(true);
    expect(blankAccepts(["len(items)"], "len( items )", "code")).toBe(true);
    expect(blankAccepts(["len(items)"], "Len(items)", "code")).toBe(false);
    expect(blankAccepts(["return x"], "returnx", "code")).toBe(false);
    expect(blankAccepts(["True"], "true", "code", false)).toBe(true);
  });

  test("blanks: partial credit per gap", () => {
    const b = block("blanks");
    expect(gradeBlanks(b, ["3/2", "one and a half"])).toMatchObject({ verdict: "correct", score: 1, right: [true, true], expected: ["6/4", "1.5"] });
    expect(gradeBlanks(b, ["6/4", "2"])).toMatchObject({ verdict: "partial", score: 0.5, right: [true, false] });
    expect(gradeBlanks(b, [])).toMatchObject({ verdict: "incorrect", score: 0, submitted: ["", ""] });
  });
});

describe("evidence", () => {
  const day = (d: number) => `2026-11-${String(10 + d).padStart(2, "0")}T10:00:00`;

  test("recognition and self-rated work never produces mastery, however often it succeeds", () => {
    for (const kind of ["choice", "matching", "ordering", "flashcard", "prediction"]) {
      let state = applyEvidence(undefined, { at: day(0), score: 1, hintsUsed: 0, kind });
      for (let d = 1; d < 6; d++) state = applyEvidence(state, { at: day(d), score: 1, hintsUsed: 0, kind });
      expect(state.status).toBe("learning");
    }
  });

  test("typed blanks are real recall and count like a short answer", () => {
    expect(strongEvidenceKinds.has("blanks")).toBe(true);
    let state = applyEvidence(undefined, { at: day(0), score: 1, hintsUsed: 0, kind: "blanks" });
    expect(state.status).toBe("practiced");
    state = applyEvidence(state, { at: day(2), score: 1, hintsUsed: 0, kind: "blanks" });
    expect(state.status).toBe("mastered");
  });

  test("an unknown kind is weak until it is listed", () => {
    let state = applyEvidence(undefined, { at: day(0), score: 1, hintsUsed: 0, kind: "something-new" });
    state = applyEvidence(state, { at: day(2), score: 1, hintsUsed: 0, kind: "something-new" });
    expect(state.status).toBe("learning");
  });

  test("a wrong prediction does not undo earlier success, a wrong matching does", () => {
    const practiced = applyEvidence(undefined, { at: day(0), score: 1, hintsUsed: 0, kind: "short" });
    expect(applyEvidence(practiced, { at: day(1), score: 0, hintsUsed: 0, kind: "prediction" }).status).toBe("practiced");
    expect(applyEvidence(practiced, { at: day(1), score: 0, hintsUsed: 0, kind: "matching" }).status).toBe("learning");
  });

  test("the profile counts each kind, but flashcards and predictions stay out of accuracy", () => {
    const events = [
      ...Array.from({ length: 6 }, () => answer({ kind: "flashcard", component: "flashcard", score: 1 })),
      ...Array.from({ length: 6 }, () => answer({ kind: "prediction", component: "steps", score: 0 })),
      ...Array.from({ length: 4 }, () => answer({ kind: "blanks", component: "blanks", score: 0 })),
    ];
    const o = deriveObserved(events, now);
    expect(o.answers.byKind.flashcard?.n).toBe(6);
    expect(o.answers.byKind.prediction?.n).toBe(6);
    expect(o.answers.all.n).toBe(4);
    expect(o.recent.n).toBe(4);
    expect(o.findings.some((f) => f.key.startsWith("kind:flashcard") || f.key.startsWith("kind:prediction"))).toBe(false);
  });
});
