import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { courseSchema, type ObjectiveState, type Progress } from "./formats";
import { buildJourney, JOURNEY_LIMIT, readJourney } from "./journey";
import { acceptProposal, applyChanges, propose, rejectProposal, type CourseChange } from "./revise";
import { courseDir, dataDir, store } from "./store";
import { sampleCourse } from "./testdata";

store.init();

const mastered: ObjectiveState = {
  status: "mastered",
  evidence: [
    { at: "2026-11-01T10:00:00.000Z", score: 1, hintsUsed: 0, kind: "short" },
    { at: "2026-11-03T10:00:00.000Z", score: 1, hintsUsed: 0, kind: "short" },
  ],
  firstSuccessDay: "2026-11-01",
};
const learning: ObjectiveState = { status: "learning", evidence: [{ at: "2026-11-04T10:00:00.000Z", score: 0.4, hintsUsed: 1, kind: "short" }] };

let n = 0;
/** A ready course in the test data folder: m1-read mastered, m1-scale learning. */
function setup(): string {
  n += 1;
  const id = `revise-${n}`;
  const doc = { ...sampleCourse(), id };
  store.saveContent(doc);
  const progress: Progress = {
    format: "sloodle.progress",
    version: 1,
    id,
    topic: "fractions",
    createdAt: `2026-11-0${n % 9}T10:00:00.000Z`,
    phase: "ready",
    origin: { kind: "generated", at: "2026-11-01T10:00:00.000Z" },
    objectiveStates: { "m1-read": structuredClone(mastered), "m1-scale": structuredClone(learning) },
    summaries: [],
    projects: [],
    reviewCards: [],
    sdkSessions: {},
  };
  store.saveProgress(progress);
  return id;
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);
const backups = (id: string) => {
  const dir = join(dataDir, "backups", "revisions", id);
  return existsSync(dir) ? readdirSync(dir) : [];
};

const addLesson: CourseChange = {
  op: "add_lesson",
  module_id: "m1",
  lesson: { id: "m1-halve", statement: "Can halve a recipe amount given as a fraction.", level: "apply", prerequisites: ["m1-read"] },
  after: "m1-read",
  position: "end",
};

test("accepting a proposal backs up course.json, writes a valid course, keeps progress and records an event", () => {
  const id = setup();
  const before = read(join(courseDir(id), "course.json"))!;
  const progressBefore = store.progress(id);
  const { proposal, problems } = propose(id, "You asked for halving too.", [addLesson, { op: "edit_lesson", lesson_id: "m1-scale", statement: "Can double or triple a recipe amount given as a fraction.", replan: false }]);
  expect(problems).toEqual([]);
  expect(proposal!.view.after[0]!.lessons.map((l) => [l.id, l.mark])).toEqual([
    ["m1-read", undefined],
    ["m1-halve", "added"],
    ["m1-scale", "changed"],
  ]);
  // Proposing writes nothing.
  expect(read(join(courseDir(id), "course.json"))).toBe(before);
  expect(backups(id)).toEqual([]);

  const accepted = acceptProposal(proposal!);
  expect(accepted.proposal.status).toBe("accepted");

  const files = backups(id);
  expect(files.length).toBe(1);
  expect(readFileSync(join(dataDir, accepted.backup), "utf8")).toBe(before);

  const after = store.content(id)!;
  expect(courseSchema.safeParse(after).success).toBe(true);
  expect(after.modules[0]!.objectives.map((o) => o.id)).toEqual(["m1-read", "m1-halve", "m1-scale"]);
  expect(after.modules[0]!.objectives[2]!.statement).toContain("triple");
  // The kept lesson's plan is untouched; the new lesson waits for its plan.
  expect(after.modules[0]!.objectives[0]!.lesson).toEqual(sampleCourse().modules[0]!.objectives[0]!.lesson);
  expect(Object.keys(accepted.replan).sort()).toEqual(["m1-halve", "m1-scale"]);

  const progressAfter = store.progress(id);
  expect(progressAfter.objectiveStates["m1-read"]).toEqual(progressBefore.objectiveStates["m1-read"]!);
  expect(progressAfter.objectiveStates["m1-scale"]).toEqual(progressBefore.objectiveStates["m1-scale"]!);
  expect(progressAfter.objectiveStates["m1-halve"]).toBeUndefined();

  const event = store.events().find((e) => e.type === "course_revised" && e.courseId === id);
  expect(event).toBeDefined();
  expect(event!.type === "course_revised" && event!.added).toEqual(["m1-halve"]);
  expect(event!.type === "course_revised" && event!.backup).toBe(accepted.backup);

  // Accepting twice is refused.
  expect(() => acceptProposal(accepted.proposal)).toThrow(/already accepted/);
});

test("rejecting a proposal writes nothing", () => {
  const id = setup();
  const paths = [join(courseDir(id), "course.json"), join(courseDir(id), "progress.json"), join(dataDir, "events.jsonl")];
  const before = paths.map(read);
  const { proposal } = propose(id, "Drop doubling.", [{ op: "remove_lesson", lesson_id: "m1-scale" }]);
  const rejected = rejectProposal(proposal!);
  expect(rejected.status).toBe("rejected");
  expect(paths.map(read)).toEqual(before);
  expect(backups(id)).toEqual([]);
  expect(() => acceptProposal(rejected)).toThrow(/already rejected/);
});

test("removing a completed lesson is flagged on the card, and lessons that built on it are freed", () => {
  const id = setup();
  const { proposal, problems } = propose(id, "You know this already.", [{ op: "remove_lesson", lesson_id: "m1-read" }]);
  expect(problems).toEqual([]);
  const view = proposal!.view;
  expect(view.warnings.length).toBe(1);
  expect(view.warnings[0]).toContain("mastered");
  expect(view.warnings[0]).toContain("record of it is kept");
  expect(view.before[0]!.lessons.find((l) => l.id === "m1-read")!.mark).toBe("removed");
  expect(view.lines.some((l) => l.includes("no longer waits for"))).toBe(true);

  const accepted = acceptProposal(proposal!);
  const after = store.content(id)!;
  expect(after.modules[0]!.objectives.map((o) => o.id)).toEqual(["m1-scale"]);
  expect(after.modules[0]!.objectives[0]!.prerequisites).toEqual([]);
  // The removed lesson's record stays in progress.json.
  expect(store.progress(id).objectiveStates["m1-read"]).toEqual(mastered);
  expect(accepted.replan).toEqual({});
});

test("a started lesson being removed is flagged too; an untouched one is not", () => {
  const states = { "m1-scale": learning };
  const flagged = applyChanges(sampleCourse(), states, [{ op: "remove_lesson", lesson_id: "m1-scale" }]);
  expect(flagged.warnings.join(" ")).toContain("started");
  const quiet = applyChanges(sampleCourse(), {}, [{ op: "remove_lesson", lesson_id: "m1-scale" }]);
  expect(quiet.warnings).toEqual([]);
});

test("a course changed after the proposal is not overwritten", () => {
  const id = setup();
  const { proposal } = propose(id, "Add halving.", [addLesson]);
  const doc = store.content(id)!;
  doc.title = "Changed meanwhile";
  store.saveContent(doc);
  const now = read(join(courseDir(id), "course.json"));
  expect(() => acceptProposal(proposal!)).toThrow(/changed after/);
  expect(read(join(courseDir(id), "course.json"))).toBe(now);
  expect(backups(id)).toEqual([]);
});

test("invalid proposals come back as problems and are never shown", () => {
  const id = setup();
  expect(propose(id, "x", [{ op: "remove_lesson", lesson_id: "nope" }]).problems[0]).toContain("no lesson");
  expect(propose(id, "x", [{ ...addLesson, lesson: { id: "m1-read", statement: "Again.", level: "apply", prerequisites: [] } } as CourseChange]).problems[0]).toContain("already used");
  // An id that still has progress on record cannot be reused for a different lesson.
  const progress = store.progress(id);
  progress.objectiveStates["m1-old"] = structuredClone(mastered);
  store.saveProgress(progress);
  const reuse = propose(id, "x", [{ ...addLesson, lesson: { id: "m1-old", statement: "Something else.", level: "apply", prerequisites: [] } } as CourseChange]);
  expect(reuse.problems[0]).toContain("progress on record");
  // Prerequisite cycles are caught by the course schema.
  const cycle = propose(id, "x", [{ op: "edit_lesson", lesson_id: "m1-read", prerequisites: ["m1-scale"], replan: false }]);
  expect(cycle.problems.join(" ")).toContain("cycle");
  expect(backups(id)).toEqual([]);
});

test("the journey summary is deterministic and bounded", () => {
  setup();
  const now = new Date("2026-11-17T12:00:00.000Z");
  const input = readJourney();
  const text = buildJourney(input, now);
  expect(buildJourney(structuredClone(input), now)).toBe(text);
  expect(text).toContain("Fractions for Cooking");
  expect(text).toContain("m1-read [mastered]");
  expect(text).toContain("## The learner");

  // Many large courses still fit, with less detail.
  const big = structuredClone(input);
  const course = sampleCourse();
  const module = course.modules[0]!;
  course.modules = Array.from({ length: 30 }, (_, m) => ({
    ...module,
    id: `m${m}`,
    title: `Module ${m} ${"x".repeat(60)}`,
    objectives: Array.from({ length: 12 }, (_, o) => ({ ...module.objectives[1]!, id: `m${m}-o${o}`, prerequisites: [], statement: `Can do thing ${o} ${"y".repeat(200)}` })),
  }));
  big.courses = Array.from({ length: 25 }, (_, i) => ({ progress: { ...input.courses[0]!.progress, id: `c${i}`, createdAt: `2026-10-${String(i + 1).padStart(2, "0")}` }, content: { ...course, id: `c${i}` } }));
  const bounded = buildJourney(big, now);
  expect(bounded.length).toBeLessThanOrEqual(JOURNEY_LIMIT);
  expect(buildJourney(structuredClone(big), now)).toBe(bounded);
});
