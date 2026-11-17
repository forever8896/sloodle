import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemas, schemaDir } from "./emit-schema";
import { courseSchema, defaultSloo, emptyLearner, planGaps, progressSchema, type MarkdownBlock } from "./formats";
import { sampleCourse } from "./testdata";

test("a well-formed course validates, and sparse lesson plans are filled with empty lists", () => {
  const course = sampleCourse();
  expect(courseSchema.parse(course).id).toBe(course.id);
  const sparse = structuredClone(course) as any;
  delete sparse.modules[0].objectives[1].lesson;
  delete sparse.tags;
  const parsed = courseSchema.parse(sparse);
  expect(parsed.modules[0]!.objectives[1]!.lesson.checks).toEqual([]);
  expect(parsed.tags).toEqual([]);
});

test("cross-references are checked: prerequisites, cycles, check and misconception ids", () => {
  const unknownPrereq = sampleCourse();
  unknownPrereq.modules[0]!.objectives[1]!.prerequisites = ["nope"];
  expect(courseSchema.safeParse(unknownPrereq).success).toBe(false);

  const cycle = sampleCourse();
  cycle.modules[0]!.objectives[0]!.prerequisites = ["m1-scale"];
  const result = courseSchema.safeParse(cycle);
  expect(result.success).toBe(false);
  expect(JSON.stringify(result.error?.issues)).toContain("cycle");

  const badCheck = sampleCourse();
  (badCheck.modules[0]!.objectives[0]!.lesson.blocks[2] as MarkdownBlock).checkId = "missing";
  expect(courseSchema.safeParse(badCheck).success).toBe(false);

  const badMisconception = sampleCourse();
  badMisconception.modules[0]!.objectives[0]!.lesson.checks[1]!.misconceptionIds = ["m9-x"];
  expect(courseSchema.safeParse(badMisconception).success).toBe(false);

  const choiceWithoutAnswer = sampleCourse();
  delete choiceWithoutAnswer.modules[0]!.objectives[0]!.lesson.checks[0]!.correctOption;
  expect(courseSchema.safeParse(choiceWithoutAnswer).success).toBe(false);
});

test("unknown keys and unsafe values are rejected", () => {
  const extra = { ...sampleCourse(), learner: { name: "Ana" } };
  expect(courseSchema.safeParse(extra).success).toBe(false);
  const js = sampleCourse();
  js.sources[0]!.url = "javascript:alert(1)";
  expect(courseSchema.safeParse(js).success).toBe(false);
  const badId = sampleCourse();
  badId.modules[0]!.id = "../etc";
  expect(courseSchema.safeParse(badId).success).toBe(false);
});

test("planGaps names what a thin plan lacks", () => {
  const [full, empty] = sampleCourse().modules[0]!.objectives;
  expect(planGaps(full!)).toEqual([]);
  expect(planGaps(empty!).length).toBe(4);
});

test("the defaults for a new learner, Sloo and progress are valid", () => {
  expect(emptyLearner().stated.preferences).toEqual([]);
  const sloo = defaultSloo();
  expect(sloo.persona.name).toBe("Sloo");
  expect(sloo.approach.challenge.value).toBe("balanced");
  expect(progressSchema.parse({ format: "sloodle.progress", version: 1, id: "x", topic: "t", createdAt: "now", phase: "interview" }).reviewCards).toEqual([]);
});

test("the published JSON Schema files match the zod definitions (run `bun run schema` after changing formats.ts)", () => {
  for (const [file, text] of Object.entries(jsonSchemas())) {
    expect(readFileSync(join(schemaDir, file), "utf8")).toBe(text);
  }
});
