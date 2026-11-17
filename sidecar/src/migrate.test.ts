import { afterAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { activityEventSchema, courseSchema, learnerSchema, progressSchema, slooSchema } from "./formats";
import { migrateDataDir } from "./migrate";

const dirs: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "sloodle-migrate-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const v0Course = {
  id: "spanish-abc123",
  topic: "conversational Spanish",
  createdAt: "2026-11-01T10:00:00.000Z",
  phase: "ready",
  brief: { topic: "conversational Spanish", targetPerformance: "Talk to my in-laws", motivation: "Family", useContext: "Dinners", minutesPerSession: 20, sessionsPerWeek: 3, priorKnowledge: "None", formatPreferences: ["talking"], diagnosticFindings: [] },
  curriculum: {
    title: "Dinner-Table Spanish",
    summary: "Greetings to stories.",
    modules: [
      {
        id: "m1",
        title: "Greetings",
        why: "First words at the door.",
        objectives: [
          { id: "m1-a", statement: "Can greet someone.", level: "apply", prerequisites: [] },
          { id: "M1 B", statement: "Can introduce yourself.", level: "apply", prerequisites: ["m1-a"] },
        ],
        project: { title: "Record a greeting", brief: "Thirty seconds.", deliverables: ["A recording"] },
      },
    ],
    sources: [{ title: "SpanishDict", url: "https://www.spanishdict.com", kind: "site", why: "Lookups" }],
  },
  objectiveStates: {
    "m1-a": { status: "practiced", evidence: [{ at: "2026-11-02T19:00:00.000Z", score: 1, hintsUsed: 0, kind: "short", confidence: 3 }], firstSuccessDay: "2026-11-02" },
    "M1 B": { status: "learning", evidence: [{ at: "2026-11-02T19:05:00.000Z", score: 0.4, hintsUsed: 1, kind: "explain" }] },
  },
  summaries: [{ at: "2026-11-02T19:30:00.000Z", kind: "lesson", summary: "Greetings went well.", nextStep: "Introductions." }],
  projects: [],
  sdkSessions: { interview: "abc" },
  activeLesson: "lesson-1",
};

function writeV0(dir: string): void {
  mkdirSync(join(dir, "courses", v0Course.id), { recursive: true });
  mkdirSync(join(dir, "courses", "new-topic-def456"), { recursive: true });
  writeFileSync(join(dir, "learner.json"), JSON.stringify({ notes: [{ at: "2026-11-01T10:10:00.000Z", category: "motivation", text: "Wants to talk to family.", courseId: v0Course.id }] }));
  writeFileSync(join(dir, "courses", v0Course.id, "course.json"), JSON.stringify(v0Course));
  writeFileSync(join(dir, "courses", v0Course.id, "items.json"), JSON.stringify([{ id: "r1", front: "Hola?", back: "Hello", createdAt: "2026-11-02T19:00:00.000Z", card: { due: "2026-11-03T19:00:00.000Z" } }]));
  writeFileSync(join(dir, "courses", "new-topic-def456", "course.json"), JSON.stringify({ id: "new-topic-def456", topic: "engines", createdAt: "2026-11-15T10:00:00.000Z", phase: "interview", objectiveStates: {}, summaries: [], projects: [], sdkSessions: {} }));
}

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("a v0 data folder is split into content, progress, learner, Sloo and events without losing anything", () => {
  const dir = scratch();
  writeV0(dir);
  const report = migrateDataDir(dir, new Date("2026-11-16T12:00:00Z"));
  expect(report.failed).toEqual([]);
  expect(report.courses.sort()).toEqual(["new-topic-def456", "spanish-abc123"]);

  const courseDir = join(dir, "courses", v0Course.id);
  const content = courseSchema.parse(read(join(courseDir, "course.json")));
  expect(content.title).toBe("Dinner-Table Spanish");
  expect(content.modules[0]!.objectives.map((o) => o.id)).toEqual(["m1-a", "m1-b"]);
  expect(JSON.stringify(content)).not.toContain("in-laws");

  const progress = progressSchema.parse(read(join(courseDir, "progress.json")));
  expect(progress.brief?.targetPerformance).toBe("Talk to my in-laws");
  expect(Object.keys(progress.objectiveStates).sort()).toEqual(["m1-a", "m1-b"]);
  expect(progress.reviewCards.map((r) => r.id)).toEqual(["r1"]);
  expect(progress).toMatchObject({ activeLesson: "lesson-1", sdkSessions: { interview: "abc" }, origin: { kind: "migrated" } });

  const learner = learnerSchema.parse(read(join(dir, "learner.json")));
  expect(learner.notes[0]).toMatchObject({ text: "Wants to talk to family.", source: "tutor", category: "motivation", courseId: v0Course.id });
  expect(slooSchema.parse(read(join(dir, "sloo.json"))).persona.name).toBe("Sloo");

  const events = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n").map((l) => activityEventSchema.parse(JSON.parse(l)));
  expect(events.map((e) => e.type).sort()).toEqual(["answer", "answer", "session_end"]);
  expect(events.find((e) => e.type === "answer" && e.objectiveId === "m1-a")).toMatchObject({ confidence: 3, source: "migration" });

  const interviewing = join(dir, "courses", "new-topic-def456");
  expect(progressSchema.parse(read(join(interviewing, "progress.json"))).phase).toBe("interview");
  expect(existsSync(join(interviewing, "course.json"))).toBe(false);

  // The originals are kept.
  const backups = readdirSync(join(dir, "backups"));
  expect(backups).toHaveLength(1);
  expect(read(join(dir, "backups", backups[0]!, "learner.json")).notes).toHaveLength(1);
  expect(read(join(dir, "backups", backups[0]!, "courses", v0Course.id, "course.json")).curriculum.title).toBe("Dinner-Table Spanish");
});

test("migration is idempotent", () => {
  const dir = scratch();
  writeV0(dir);
  migrateDataDir(dir, new Date("2026-11-16T12:00:00Z"));
  const events = readFileSync(join(dir, "events.jsonl"), "utf8");
  const second = migrateDataDir(dir, new Date("2026-11-16T13:00:00Z"));
  expect(second).toMatchObject({ learner: false, sloo: false, courses: [], events: 0 });
  expect(readFileSync(join(dir, "events.jsonl"), "utf8")).toBe(events);
  expect(readdirSync(join(dir, "backups"))).toHaveLength(1);
});

// Runs against a copy of the real data folder when it exists; the real folder is only read.
const real = join(homedir(), ".local", "share", "sloodle");
test.skipIf(!existsSync(join(real, "courses")))("a copy of the real data folder migrates cleanly", () => {
  const dir = scratch();
  for (const name of ["learner.json", "courses"]) {
    if (existsSync(join(real, name))) cpSync(join(real, name), join(dir, name), { recursive: true });
  }
  const report = migrateDataDir(dir);
  expect(report.failed).toEqual([]);
  for (const id of readdirSync(join(dir, "courses"))) {
    progressSchema.parse(read(join(dir, "courses", id, "progress.json")));
    if (existsSync(join(dir, "courses", id, "course.json"))) courseSchema.parse(read(join(dir, "courses", id, "course.json")));
  }
  learnerSchema.parse(read(join(dir, "learner.json")));
});
