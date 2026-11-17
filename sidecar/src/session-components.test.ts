import { beforeEach, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { z } from "zod";
import { everyBlock, sampleCourse } from "./testdata";
import { Session } from "./session";
import { dataDir, store } from "./store";
import type { LessonBlock } from "./formats";
import type { SessionEvent, ShownComponent } from "./types";

// test-setup.ts points the data folder at a temporary directory; refuse to run against anything else.
if (!dataDir.startsWith(tmpdir())) throw new Error(`Tests must not use the real data folder (${dataDir}).`);

const COURSE = "fractions-abc123";

/** A lesson session whose tools run for real, without a model: the tutor's side is driven by hand. */
function lesson() {
  const events: SessionEvent[] = [];
  const toModel: string[] = [];
  const session = new Session("lesson-1", COURSE, "lesson", (e) => events.push(e), () => undefined);
  // The model's input queue: what the tutor would read next.
  (session as any).input = { push: (m: any) => toModel.push(m.message.content), close: () => undefined };
  const tools = (session as any).tools() as { name: string; inputSchema: z.ZodRawShape; handler: (args: any, extra: unknown) => Promise<any> }[];
  // As the SDK does: the input is parsed against the tool's schema (filling defaults) before the handler runs.
  const call = (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((t) => t.name === name)!;
    return tool.handler(z.object(tool.inputSchema).parse(args), {});
  };
  const shown = () => events.filter((e): e is Extract<SessionEvent, { t: "component" }> => e.t === "component").map((e) => e.component);
  return { session, events, toModel, call, shown, last: () => shown().at(-1)! };
}

beforeEach(() => {
  const course = sampleCourse();
  course.modules[0]!.objectives[1]!.lesson.blocks = everyBlock();
  store.saveContent(course);
  store.saveProgress({ format: "sloodle.progress", version: 1, id: COURSE, topic: "fractions", createdAt: new Date().toISOString(), phase: "ready", origin: { kind: "generated", at: new Date().toISOString() }, objectiveStates: {}, summaries: [], projects: [], reviewCards: [], sdkSessions: {} });
});

const secretsOf = (b: LessonBlock): string[] => {
  switch (b.type) {
    case "blanks":
      return b.blanks.flatMap((x) => x.accept);
    case "steps":
      return b.steps.map((s) => s.text);
    case "flashcard":
      return [b.back];
    case "ordering":
      return [b.explanation ?? "", ...b.hints].filter(Boolean);
    default:
      return [];
  }
};

test("every plan block can be shown, and nothing sent before an answer gives the answer away", async () => {
  const t = lesson();
  for (const block of everyBlock()) {
    const result = await t.call("show_block", { block_id: block.id });
    expect(result.isError).toBeFalsy();
    if (block.type && ["ordering", "matching", "blanks", "steps", "flashcard"].includes(block.type)) {
      expect(result.content[0].text).toContain("End your turn");
      // Clear the wait so the next one can be shown.
      for (const s of (t.session as any).components.values()) s.done = true;
    }
  }
  expect(t.shown().map((c) => c.type)).toEqual(everyBlock().slice(1).map((b) => b.type!));
  const wire = JSON.stringify(t.events);
  for (const block of everyBlock()) for (const secret of secretsOf(block)) expect(wire).not.toContain(secret);
  const ordering = t.shown().find((c) => c.type === "ordering") as Extract<ShownComponent, { type: "ordering" }>;
  expect(ordering.items.map((i) => i.text)).not.toEqual(["Read the amount", "Double the top number", "Simplify"]);
  // The shown id is fresh, not the course's block id.
  expect(ordering.id).not.toBe("m1-scale-b4");
  expect(ordering.blockId).toBe("m1-scale-b4");
});

test("only one thing waits for the learner at a time", async () => {
  const t = lesson();
  expect((await t.call("show_block", { block_id: "m1-scale-b4" })).isError).toBeFalsy();
  expect((await t.call("show_block", { block_id: "m1-scale-b5" })).isError).toBe(true);
  expect((await t.call("ask_question", { kind: "short", prompt: "?", answer_key: "x", hints: [] })).isError).toBe(true);
  // Display components can still be shown alongside.
  expect((await t.call("show_block", { block_id: "m1-scale-b9" })).isError).toBeFalsy();
});

test("an ordering is graded in the engine, recorded, and reported to the tutor with the answer", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b4" });
  const view = t.last() as Extract<ShownComponent, { type: "ordering" }>;
  const byText = (text: string) => view.items.find((i) => i.text === text)!.id;
  await t.session.component(view.id, { do: "hint" });
  await t.session.component(view.id, { do: "order", order: ["Read the amount", "Double the top number", "Simplify"].map(byText) });

  const graded = t.events.find((e) => e.t === "component_update" && e.update.kind === "graded");
  expect(graded).toMatchObject({ update: { result: { verdict: "correct", score: 1 } } });
  expect(t.toModel.at(-1)).toContain("Right order: 1. Read the amount");
  expect(t.toModel.at(-1)).toContain("Hints used: 1");
  expect(t.toModel.at(-1)).toContain("does not count toward mastery");

  const answer = store.events().filter((e) => e.type === "answer").at(-1);
  expect(answer).toMatchObject({ kind: "ordering", component: "ordering", blockId: "m1-scale-b4", objectiveId: "m1-scale", score: 1, hintsUsed: 1 });
  // Recognition work, so no unaided success is recorded.
  expect(store.progress(COURSE).objectiveStates["m1-scale"]?.status).toBe("learning");
  await expect(t.session.component(view.id, { do: "order", order: [] })).rejects.toThrow("finished");
  // And the plan block cannot be repeated in the same session.
  expect((await t.call("show_block", { block_id: "m1-scale-b4" })).isError).toBe(true);
});

test("typed blanks with the right answers count as unaided success", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b6" });
  await t.session.component(t.last().id, { do: "fill", answers: [" 3/2 ", "1.50"] });
  expect(t.events.at(-2)).toMatchObject({ t: "component_update", update: { kind: "graded", result: { verdict: "correct", expected: ["6/4", "1.5"] } } });
  expect(store.progress(COURSE).objectiveStates["m1-scale"]?.status).toBe("practiced");
});

test("a matching with wrong pairs is partial, and tampered input is refused", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b5" });
  const view = t.last() as Extract<ShownComponent, { type: "matching" }>;
  await expect(t.session.component(view.id, { do: "match", pairs: "everything" })).rejects.toThrow();
  await expect(t.session.component(view.id, { do: "fill", answers: [] })).rejects.toThrow("does not fit");
  const right = (text: string) => view.right.find((r) => r.text === text)!.id;
  await t.session.component(view.id, { do: "match", pairs: { [view.left[0]!.id]: right("1/2"), [view.left[1]!.id]: right("2/8"), [view.left[2]!.id]: right("1 1/2") } });
  const graded = t.events.find((e) => e.t === "component_update" && e.update.kind === "graded") as any;
  expect(graded.update.result.verdict).toBe("partial");
  expect(t.toModel.at(-1)).toContain("1/3 → 2/8; should be 2/3");
});

test("a worked example reveals steps one at a time and asks for the prediction first", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b7" });
  const id = t.last().id;
  await t.session.component(id, { do: "reveal" });
  expect(t.events.at(-1)).toMatchObject({ t: "component_update", update: { kind: "step", index: 0, text: "Double the top: 4/3." } });
  await expect(t.session.component(id, { do: "reveal" })).rejects.toThrow("predict");
  expect(JSON.stringify(t.events)).not.toContain("Rewrite as 1 1/3 cups.");
  await t.session.component(id, { do: "reveal", prediction: "I don't know" });
  expect(t.events.at(-1)).toMatchObject({ update: { kind: "step", index: 1, prediction: { verdict: "incorrect", score: 0 } } });
  expect(t.toModel.at(-1)).toContain("worked through");
  expect(store.events().filter((e) => e.type === "answer").at(-1)).toMatchObject({ kind: "prediction", component: "steps" });
});

test("a flashcard flips, then takes a self-rating that never counts as proof", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b8" });
  const id = t.last().id;
  await expect(t.session.component(id, { do: "rate", rating: "easy" })).rejects.toThrow("Flip");
  await t.session.component(id, { do: "flip" });
  expect(t.events.at(-1)).toMatchObject({ update: { kind: "flipped", back: "Only the top number." } });
  await t.session.component(id, { do: "rate", rating: "easy" });
  expect(store.progress(COURSE).objectiveStates["m1-scale"]?.status).toBe("learning");
  expect(t.toModel.at(-1)).toContain("never counts toward mastery");
});

test("improvised components are validated before they are shown", async () => {
  const t = lesson();
  const bad = await t.call("ask_blanks", { text: "No gaps", blanks: [{ accept: ["x"] }], objective_id: "m1-scale" });
  expect(bad.isError).toBe(true);
  expect(bad.content[0].text).toContain("{{1}}");
  const unsafe = await t.call("show_code", { language: "python", code: "print(1)", runnable: true });
  expect(unsafe.isError).toBe(true);
  const good = await t.call("show_diagram", { kind: "sequence", source: "sequenceDiagram\n  A->>B: hi", description: "A greets B." });
  expect(good.isError).toBeFalsy();
  expect(t.last()).toMatchObject({ type: "diagram", intent: "visual", kind: "sequence" });
});

test("a diagram that fails to draw tells the tutor once", async () => {
  const t = lesson();
  await t.call("show_block", { block_id: "m1-scale-b2" });
  const id = t.last().id;
  await t.session.component(id, { do: "report", problem: "Parse error on line 2" });
  await t.session.component(id, { do: "report", problem: "Parse error on line 2" });
  expect(t.toModel.filter((m) => m.includes("could not be shown"))).toHaveLength(1);
  expect(t.toModel.at(-1)).toContain("show_diagram");
});
