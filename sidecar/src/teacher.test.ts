import { expect, test } from "bun:test";
import { defaultSloo, emptyLearner, type Progress } from "./formats";
import { deriveObserved } from "./observe";
import { editLearner, editSloo } from "./profile";
import { lessonPrompt, slooBlock } from "./prompts";
import { applyReflection, applyStats, type Reflection } from "./teacher";
import { answer, many, sampleCourse } from "./testdata";

const now = new Date("2026-11-16T12:00:00");
const at = now.toISOString();

test("easy success moves challenge and pacing up one step at a time, with a logged reason and evidence", () => {
  const sloo = defaultSloo(now);
  const o = deriveObserved(many(10, () => answer({ score: 1 })), now);
  expect(applyStats(sloo, o, at)).toEqual(expect.arrayContaining(["challenge", "pacing", "hintGenerosity"]));
  expect(sloo.approach.challenge).toMatchObject({ value: "stretching", setBy: "stats" });
  expect(sloo.approach.challenge.evidence.length).toBeGreaterThan(0);
  expect(sloo.log.at(-1)?.reason).toContain("answers");

  // Already there: nothing changes and nothing is logged.
  const logged = sloo.log.length;
  expect(applyStats(sloo, o, at)).toEqual([]);
  expect(sloo.log.length).toBe(logged);
});

test("struggling moves toward gentle, slower and generous hints, never more than one step per update", () => {
  const sloo = defaultSloo(now);
  sloo.approach.challenge.value = "stretching";
  const challenge = (): string => sloo.approach.challenge.value;
  const o = deriveObserved(many(10, () => answer({ score: 0, hintsUsed: 2 })), now);
  applyStats(sloo, o, at);
  expect(challenge()).toBe("balanced");
  applyStats(sloo, o, at);
  expect(challenge()).toBe("gentle");
  expect(sloo.approach.pacing.value).toBe("slower");
  expect(sloo.approach.hintGenerosity.value).toBe("generous");
});

test("too little data changes nothing, and a dial the learner locked is never changed", () => {
  const sloo = defaultSloo(now);
  expect(applyStats(sloo, deriveObserved(many(3, () => answer({ score: 1 })), now), at)).toEqual([]);
  const locked = editSloo(defaultSloo(now), { op: "dial", dial: "challenge", value: "gentle" }, now);
  applyStats(locked, deriveObserved(many(10, () => answer({ score: 1 })), now), at);
  expect(locked.approach.challenge).toMatchObject({ value: "gentle", setBy: "user", locked: true });
});

test("presentation forms become tactics with counts recomputed from the profile", () => {
  const sloo = defaultSloo(now);
  const o = deriveObserved([...many(3, () => answer({ presented: ["analogy"], score: 1 })), answer({ presented: ["analogy"], score: 0 })], now);
  applyStats(sloo, o, at);
  expect(sloo.approach.tactics.find((t) => t.id === "form-analogy")).toMatchObject({ worked: 3, failed: 1, source: "stats" });
  applyStats(sloo, o, at);
  expect(sloo.approach.tactics.filter((t) => t.id === "form-analogy")).toHaveLength(1);
});

const reflection: Reflection = {
  toldMe: ["Has a six-year-old daughter who plays piano."],
  workingToward: ["Wants to play duets at the holidays."],
  episodes: ["Laughed when the treble clef looked like a snail."],
  tactics: [{ tactic: "A cooking analogy for fractions", intent: "analogy", outcome: "worked", note: "Got it right straight after." }],
  dials: [{ dial: "explanationDepth", direction: "up", reason: "Asked for more detail twice." }],
  learnerNotes: [{ category: "preference", text: "Likes to see the whole worked example before trying." }],
};

test("a reflection is applied within bounds, deduplicated, and logged", () => {
  const sloo = defaultSloo(now);
  const learner = emptyLearner(now);
  applyReflection(sloo, learner, reflection, { at, courseId: "c1", sessionId: "lesson-1" });
  expect(sloo.memory.toldMe.map((e) => e.text)).toEqual(reflection.toldMe);
  expect(sloo.memory.toldMe[0]!.source).toBe("reflection");
  expect(sloo.approach.explanationDepth).toMatchObject({ value: "thorough", setBy: "reflection" });
  expect(sloo.approach.tactics[0]).toMatchObject({ worked: 1, failed: 0, source: "reflection" });
  expect(learner.notes[0]).toMatchObject({ source: "reflection", category: "preference", courseId: "c1" });
  expect(sloo.log.some((l) => l.source === "reflection" && l.evidence.includes("lesson-1"))).toBe(true);

  // The same reflection again adds no duplicate memories or notes, but counts the tactic again.
  applyReflection(sloo, learner, reflection, { at, courseId: "c1", sessionId: "lesson-2" });
  expect(sloo.memory.toldMe).toHaveLength(1);
  expect(learner.notes).toHaveLength(1);
  expect(sloo.approach.tactics[0]!.worked).toBe(2);
});

test("a reflection that does not match the schema changes nothing but the log", () => {
  const sloo = defaultSloo(now);
  const learner = emptyLearner(now);
  const tooMany = { ...reflection, toldMe: ["a", "b", "c", "d"] };
  expect(applyReflection(sloo, learner, tooMany, { at, sessionId: "s" })).toEqual([]);
  expect(applyReflection(sloo, learner, { dials: [{ dial: "rm -rf", direction: "up", reason: "" }] }, { at, sessionId: "s" })).toEqual([]);
  expect(sloo.memory.toldMe).toEqual([]);
  expect(sloo.log.map((l) => l.change)).toEqual(["ignored", "ignored"]);
});

test("a locked dial ignores reflection too", () => {
  const sloo = editSloo(defaultSloo(now), { op: "dial", dial: "explanationDepth", value: "brief" }, now);
  applyReflection(sloo, emptyLearner(now), reflection, { at, sessionId: "s" });
  expect(sloo.approach.explanationDepth.value).toBe("brief");
});

test("changing Sloo or the learner visibly changes the lesson prompt", () => {
  const course = sampleCourse();
  const progress = { format: "sloodle.progress", version: 1, id: course.id, topic: "fractions", createdAt: at, phase: "ready" as const, origin: { kind: "generated" as const, at }, objectiveStates: {}, summaries: [], projects: [], reviewCards: [], sdkSessions: {} } satisfies Progress;
  const learner = emptyLearner(now);
  const base = lessonPrompt({ ...progress }, course, learner, defaultSloo(now), [], now);
  expect(base).toContain("You are Sloo");
  expect(base).toContain("Challenge: balanced");
  expect(base).toContain("[m1-read-b2] explain");
  expect(base).toContain("<course_material>");
  expect(base).not.toContain("1/3 cup, because thirds"); // answer keys stay in the engine

  let sloo = editSloo(defaultSloo(now), { op: "persona", name: "Pip" }, now);
  sloo = editSloo(sloo, { op: "dial", dial: "challenge", value: "stretching" }, now);
  sloo = editSloo(sloo, { op: "add", list: "toldMe", text: "Bakes bread every Sunday." }, now);
  const edited = editLearner(learner, { op: "add", list: "preferences", text: "Short spoken explanations" }, now);
  const changed = lessonPrompt({ ...progress }, course, edited, sloo, [], now);
  expect(changed).toContain("You are Pip");
  expect(changed).toContain("Challenge: stretching");
  expect(changed).toContain("Bakes bread every Sunday.");
  expect(changed).toContain("Prefers: Short spoken explanations");
});

test("dismissed findings are left out of the prompt", () => {
  const learner = emptyLearner(now);
  learner.observed = deriveObserved(many(6, () => answer({ kind: "explain", score: 1 })), now);
  expect(slooBlock(defaultSloo(now))).toContain("Nothing personal yet");
  const { learnerBlock } = require("./prompts") as typeof import("./prompts");
  expect(learnerBlock(learner)).toContain("explain-in-your-own-words questions well");
  const dismissed = editLearner(learner, { op: "dismiss", key: "kind:explain:strong" }, now);
  expect(learnerBlock(dismissed)).not.toContain("explain-in-your-own-words questions well");
});
