// Brings a data folder written by an earlier sloodle up to the current formats. Idempotent, and it copies every
// file it changes to backups/<stamp>/ first, so nothing is lost.
//
// v0 learner.json  { notes: [{ at, category, text, courseId? }] }       -> sloodle.learner v1 (notes kept, source tutor)
// v0 course.json   content and personal state mixed                     -> course.json (sloodle.course) + progress.json
// v0 items.json    review cards                                          -> progress.json reviewCards
// mastery evidence and session summaries                                  -> answer and session_end events (source migration)

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  COURSE_FORMAT,
  courseSchema,
  defaultSloo,
  emptyLearner,
  idSchema,
  learnerSchema,
  noteCategories,
  progressSchema,
  questionKinds,
  sessionKinds,
  type ActivityEvent,
  type CourseDoc,
  type LearnerDoc,
  type Progress,
} from "./formats";

type Json = Record<string, any>;

const readJson = (path: string): Json => JSON.parse(readFileSync(path, "utf8")) as Json;

function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

export interface MigrationReport {
  learner: boolean;
  sloo: boolean;
  courses: string[];
  events: number;
  failed: { courseId: string; error: string }[];
  backup?: string;
}

export function migrateDataDir(dir: string, now = new Date()): MigrationReport {
  const report: MigrationReport = { learner: false, sloo: false, courses: [], events: 0, failed: [] };
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(dir, "backups", `v0-${stamp}`);
  const backup = (path: string) => {
    const target = join(backupRoot, relative(dir, path));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
    report.backup = backupRoot;
  };

  const eventsPath = join(dir, "events.jsonl");
  const existingIds = new Set(
    existsSync(eventsPath)
      ? readFileSync(eventsPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => (JSON.parse(line) as { id: string }).id)
      : [],
  );
  const newEvents: ActivityEvent[] = [];
  const addEvent = (event: ActivityEvent) => {
    if (existingIds.has(event.id)) return;
    existingIds.add(event.id);
    newEvents.push(event);
  };

  // The learner.
  const learnerPath = join(dir, "learner.json");
  if (existsSync(learnerPath)) {
    const raw = readJson(learnerPath);
    if (raw.format === undefined) {
      backup(learnerPath);
      writeJson(learnerPath, learnerFromV0(raw, now));
      report.learner = true;
    }
  }

  // The courses.
  const coursesRoot = join(dir, "courses");
  if (existsSync(coursesRoot)) {
    for (const courseId of readdirSync(coursesRoot)) {
      const coursePath = join(coursesRoot, courseId, "course.json");
      if (!existsSync(coursePath)) continue;
      const raw = readJson(coursePath);
      if (raw.format !== undefined) continue;
      try {
        const itemsPath = join(coursesRoot, courseId, "items.json");
        const items = existsSync(itemsPath) ? (JSON.parse(readFileSync(itemsPath, "utf8")) as unknown[]) : [];
        const { progress, doc, events } = courseFromV0(raw, items, now);
        backup(coursePath);
        if (existsSync(itemsPath)) backup(itemsPath);
        writeJson(join(coursesRoot, courseId, "progress.json"), progress);
        if (doc) writeJson(coursePath, doc);
        else renameSync(coursePath, `${coursePath}.v0`);
        if (existsSync(itemsPath)) renameSync(itemsPath, `${itemsPath}.v0`);
        for (const event of events) addEvent(event);
        report.courses.push(courseId);
      } catch (error) {
        report.failed.push({ courseId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (newEvents.length) {
    appendFileSync(eventsPath, newEvents.map((e) => `${JSON.stringify(e)}\n`).join(""));
    report.events = newEvents.length;
  }

  const slooPath = join(dir, "sloo.json");
  if (!existsSync(slooPath)) {
    const sloo = defaultSloo(now);
    sloo.log.push({ at: now.toISOString(), source: "migration", change: "created", reason: "Sloo's memory starts here, with default settings.", evidence: [] });
    writeJson(slooPath, sloo);
    report.sloo = true;
  }
  return report;
}

export function learnerFromV0(raw: Json, now: Date): LearnerDoc {
  const learner = emptyLearner(now);
  const notes = Array.isArray(raw.notes) ? raw.notes : [];
  learner.notes = notes
    .filter((n: Json) => n && typeof n.text === "string")
    .map((n: Json, i: number) => ({
      id: `v0-${i}`,
      at: typeof n.at === "string" ? n.at : now.toISOString(),
      source: "tutor" as const,
      category: (noteCategories as readonly string[]).includes(n.category) ? n.category : "context",
      text: String(n.text).slice(0, 2000),
      ...(typeof n.courseId === "string" ? { courseId: n.courseId } : {}),
    }));
  return learnerSchema.parse(learner);
}

/** Ids that are not valid slugs are rewritten, and references to them follow. */
function slugIds(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    let next = idSchema.safeParse(id).success ? id : id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "x";
    while (used.has(next)) next = `${next}-${used.size}`;
    used.add(next);
    map.set(id, next);
  }
  return map;
}

export function courseFromV0(raw: Json, items: unknown[], now: Date): { progress: Progress; doc?: CourseDoc; events: ActivityEvent[] } {
  const id = String(raw.id);
  const curriculum = raw.curriculum as Json | undefined;
  const modules: Json[] = Array.isArray(curriculum?.modules) ? curriculum.modules : [];
  const moduleIds = slugIds(modules.map((m) => String(m.id)));
  const objectiveIds = slugIds(modules.flatMap((m) => (Array.isArray(m.objectives) ? m.objectives : []).map((o: Json) => String(o.id))));
  const objectiveId = (old: string) => objectiveIds.get(old) ?? old;

  let doc: CourseDoc | undefined;
  if (curriculum) {
    doc = courseSchema.parse({
      format: COURSE_FORMAT,
      version: 1,
      id,
      title: String(curriculum.title ?? raw.topic).slice(0, 200),
      subject: String(raw.topic ?? curriculum.title).slice(0, 200),
      summary: String(curriculum.summary ?? "").slice(0, 2000),
      audience: "",
      createdAt: String(raw.createdAt ?? now.toISOString()),
      modules: modules.map((m) => ({
        id: moduleIds.get(String(m.id)),
        title: String(m.title).slice(0, 200),
        why: String(m.why ?? "").slice(0, 2000),
        objectives: (m.objectives as Json[]).map((o) => ({
          id: objectiveId(String(o.id)),
          statement: String(o.statement).slice(0, 2000),
          level: o.level,
          prerequisites: (o.prerequisites ?? []).map((p: string) => objectiveId(String(p))),
        })),
        ...(m.project ? { project: { title: String(m.project.title).slice(0, 200), brief: String(m.project.brief ?? ""), deliverables: m.project.deliverables ?? [] } } : {}),
      })),
      sources: (curriculum.sources ?? []).filter((s: Json) => /^https?:\/\/\S+$/i.test(String(s.url))).map((s: Json) => ({ title: String(s.title).slice(0, 200), url: String(s.url), kind: String(s.kind ?? "link").slice(0, 100), why: String(s.why ?? "").slice(0, 2000) })),
    });
  }

  const objectiveStates: Json = {};
  for (const [old, state] of Object.entries((raw.objectiveStates ?? {}) as Json)) objectiveStates[objectiveId(old)] = state;

  const progress = progressSchema.parse({
    format: "sloodle.progress",
    version: 1,
    id,
    topic: String(raw.topic ?? ""),
    createdAt: String(raw.createdAt ?? now.toISOString()),
    phase: raw.phase,
    origin: { kind: "migrated", at: now.toISOString() },
    brief: raw.brief,
    objectiveStates,
    summaries: raw.summaries ?? [],
    projects: raw.projects ?? [],
    reviewCards: items,
    sdkSessions: raw.sdkSessions ?? {},
    ...(raw.activeLesson ? { activeLesson: raw.activeLesson } : {}),
  });

  // The activity log starts with what the old format already recorded.
  const events: ActivityEvent[] = [];
  for (const [objective, state] of Object.entries(progress.objectiveStates)) {
    state.evidence.forEach((e, i) => {
      events.push({
        id: `mig-${id}-${objective}-${i}`,
        at: e.at,
        courseId: id,
        source: "migration",
        type: "answer",
        sessionId: "migrated",
        questionId: `mig-${i}`,
        objectiveId: objective,
        kind: (questionKinds as readonly string[]).includes(e.kind) ? (e.kind as (typeof questionKinds)[number]) : "short",
        score: Math.max(0, Math.min(1, e.score)),
        hintsUsed: e.hintsUsed,
        hintsAvailable: e.hintsUsed,
        ...(e.confidence === 1 || e.confidence === 2 || e.confidence === 3 ? { confidence: e.confidence } : {}),
        presented: [],
        misconceptions: [],
      });
    });
  }
  progress.summaries.forEach((s, i) => {
    if (!(sessionKinds as readonly string[]).includes(s.kind)) return;
    events.push({ id: `mig-${id}-summary-${i}`, at: s.at, courseId: id, source: "migration", type: "session_end", sessionId: `migrated-${i}`, kind: s.kind });
  });
  return { progress, doc, events };
}
