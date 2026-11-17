import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  activityEventSchema,
  courseSchema,
  defaultSloo,
  emptyLearner,
  learnerSchema,
  progressSchema,
  slooSchema,
  type ActivityEvent,
  type CourseDoc,
  type LearnerDoc,
  type Progress,
  type ReviewItem,
  type SlooDoc,
} from "./formats";
import { migrateDataDir } from "./migrate";
import type { AudioLesson, SessionEvent, Settings } from "./types";

// Data folder layout:
//   settings.json                 app settings (mode 600: may hold an API key)
//   learner.json                  sloodle.learner: the person
//   sloo.json                     sloodle.sloo: the teacher's memory and approach
//   events.jsonl                  activity log the observed profile is derived from
//   courses/<id>/course.json      sloodle.course: shareable content and lesson plans (absent until planned)
//   courses/<id>/progress.json    sloodle.progress: this person's enrollment, mastery and review cards
//   courses/<id>/sessions/*.jsonl session transcripts
//   courses/<id>/audio/<lesson>/  audio lessons
//   backups/                      originals of anything a migration changed

function defaultDataDir(): string {
  if (process.env.SLOODLE_DATA) return process.env.SLOODLE_DATA;
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "sloodle");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "sloodle");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "sloodle");
}

export const dataDir = defaultDataDir();

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown, mode?: number): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

export const defaultSettings: Settings = {
  authMode: "subscription",
  models: { tutor: "claude-sonnet-5-5", planner: "claude-opus-5-5", grader: "claude-haiku-5-5" },
  desiredRetention: 0.9,
  voice: { speakReplies: false, voice: "af_heart", speed: 1 },
};

/** Saved settings over the defaults; fields the defaults lack, like onboardedAt, are kept as saved. */
export function withDefaults(saved: Partial<Settings>): Settings {
  return {
    ...defaultSettings,
    ...saved,
    models: { ...defaultSettings.models, ...saved.models },
    voice: { ...defaultSettings.voice, ...saved.voice },
  };
}

export function courseDir(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid course id: ${id}`);
  return join(dataDir, "courses", id);
}

export const store = {
  init(): void {
    mkdirSync(join(dataDir, "courses"), { recursive: true });
    const report = migrateDataDir(dataDir);
    if (report.learner || report.courses.length || report.failed.length) {
      console.error(`sloodle: migrated data (${JSON.stringify(report)})`);
    }
  },

  settings(): Settings {
    return withDefaults(readJson<Partial<Settings>>(join(dataDir, "settings.json"), {}));
  },

  saveSettings(settings: Settings): void {
    writeJson(join(dataDir, "settings.json"), settings, 0o600);
  },

  learner(): LearnerDoc {
    const path = join(dataDir, "learner.json");
    return existsSync(path) ? learnerSchema.parse(readJson(path, {})) : emptyLearner();
  },

  saveLearner(learner: LearnerDoc): void {
    writeJson(join(dataDir, "learner.json"), learnerSchema.parse(learner));
  },

  sloo(): SlooDoc {
    const path = join(dataDir, "sloo.json");
    return existsSync(path) ? slooSchema.parse(readJson(path, {})) : defaultSloo();
  },

  saveSloo(sloo: SlooDoc): void {
    writeJson(join(dataDir, "sloo.json"), slooSchema.parse(sloo));
  },

  events(): ActivityEvent[] {
    const path = join(dataDir, "events.jsonl");
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const parsed = activityEventSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      });
  },

  appendEvent(event: ActivityEvent): void {
    appendFileSync(join(dataDir, "events.jsonl"), `${JSON.stringify(activityEventSchema.parse(event))}\n`);
  },

  /** Replaces the whole log; used when the person deletes their activity history. */
  replaceEvents(events: ActivityEvent[]): void {
    const path = join(dataDir, "events.jsonl");
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, events.map((e) => `${JSON.stringify(e)}\n`).join(""));
    renameSync(tmp, path);
  },

  courseIds(): string[] {
    const root = join(dataDir, "courses");
    return readdirSync(root).filter((id) => existsSync(join(root, id, "progress.json")));
  },

  progress(id: string): Progress {
    const path = join(courseDir(id), "progress.json");
    if (!existsSync(path)) throw new Error(`No such course: ${id}`);
    return progressSchema.parse(readJson(path, {}));
  },

  saveProgress(progress: Progress): void {
    mkdirSync(courseDir(progress.id), { recursive: true });
    writeJson(join(courseDir(progress.id), "progress.json"), progressSchema.parse(progress));
  },

  /** The course content, once it has been planned or imported. */
  content(id: string): CourseDoc | undefined {
    const path = join(courseDir(id), "course.json");
    if (!existsSync(path)) return undefined;
    return courseSchema.parse(readJson(path, {}));
  },

  saveContent(doc: CourseDoc): void {
    mkdirSync(courseDir(doc.id), { recursive: true });
    writeJson(join(courseDir(doc.id), "course.json"), courseSchema.parse(doc));
  },

  deleteCourse(id: string): void {
    rmSync(courseDir(id), { recursive: true, force: true });
  },

  items(courseId: string): ReviewItem[] {
    return this.progress(courseId).reviewCards;
  },

  saveItems(courseId: string, items: ReviewItem[]): void {
    const progress = this.progress(courseId);
    progress.reviewCards = items;
    this.saveProgress(progress);
  },

  appendSessionEvent(courseId: string, sessionId: string, event: SessionEvent): void {
    const dir = join(courseDir(courseId), "sessions");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${sessionId}.jsonl`), `${JSON.stringify(event)}\n`);
  },

  sessionEvents(courseId: string, sessionId: string): SessionEvent[] {
    const path = join(courseDir(courseId), "sessions", `${sessionId}.jsonl`);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEvent);
  },

  clearSessionEvents(courseId: string, sessionId: string): void {
    rmSync(join(courseDir(courseId), "sessions", `${sessionId}.jsonl`), { force: true });
  },

  audioDir(courseId: string, lessonId: string): string {
    if (!/^[a-z0-9-]+$/.test(lessonId)) throw new Error(`Invalid audio lesson id: ${lessonId}`);
    return join(courseDir(courseId), "audio", lessonId);
  },

  audioLessons(courseId: string): AudioLesson[] {
    const root = join(courseDir(courseId), "audio");
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((id) => existsSync(join(root, id, "lesson.json")))
      .map((id) => readJson<AudioLesson>(join(root, id, "lesson.json"), undefined as never))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  saveAudioLesson(courseId: string, lesson: AudioLesson): void {
    const dir = this.audioDir(courseId, lesson.id);
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, "lesson.json"), lesson);
  },
};
