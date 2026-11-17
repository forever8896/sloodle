// Sharing courses: export to one file, import from one. A shared course is untrusted input: it is size-limited,
// cleaned of invisible control characters, validated strictly (unknown keys are rejected), and given a fresh id.
//
// Pictures travel inside the file: next to the course document's fields, `images` maps each image id the lesson
// plans use to {type, data} with the cached thumbnail in base64. The credit stays in the blocks. A file without
// pictures is exactly the course document, as before. On import each picture is decoded, size-checked and sniffed;
// one that fails or that no block uses is dropped, and its block shows the alt text instead.

import { COURSE_FORMAT, COURSE_VERSION, courseSchema, imageIdSchema, type CourseDoc, type Progress } from "./formats";
import { MAX_IMAGE_BYTES, sniffImage, type ImageType } from "./images";

/** Under the engine's 16 MB WebSocket message limit, since the file travels over it both ways. */
export const MAX_IMPORT_BYTES = 15_000_000;

/** Every picture the course's lesson plans use. */
export function courseImageIds(doc: Pick<CourseDoc, "modules">): string[] {
  const ids = new Set<string>();
  for (const m of doc.modules) for (const o of m.objectives) for (const b of o.lesson.blocks) if (b.type === "image") for (const i of b.images) ids.add(i.image);
  return [...ids];
}

export type SharedImage = { id: string; type: ImageType; bytes: Uint8Array };

export function courseSlug(text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "course";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * The shareable file: the course document, validated, with nothing personal in it, plus the pictures its plans use
 * (from `readImage`, which returns undefined for one not in the cache; that block then shows its alt text).
 */
export function exportCourse(doc: CourseDoc, readImage: (id: string) => SharedImage | undefined = () => undefined): { fileName: string; json: string; missingImages: number } {
  const clean = courseSchema.parse(doc);
  const base = clean.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "course";
  const images: Record<string, { type: ImageType; data: string }> = {};
  let missingImages = 0;
  for (const id of courseImageIds(clean)) {
    const image = readImage(id);
    if (image) images[id] = { type: image.type, data: Buffer.from(image.bytes).toString("base64") };
    else missingImages += 1;
  }
  const file = Object.keys(images).length ? { ...clean, images } : clean;
  const json = `${JSON.stringify(file, null, 2)}\n`;
  if (json.length > MAX_IMPORT_BYTES) throw new Error(`With its pictures this course is ${Math.ceil(json.length / 1e6)} MB, more than the ${MAX_IMPORT_BYTES / 1e6} MB a shared course may be. Remove some picture blocks and try again.`);
  return { fileName: `${base}.sloodle.json`, json, missingImages };
}

/** The pictures of a shared file that are well formed and used by the course; the rest are dropped. */
export function sharedImages(raw: unknown, doc: Pick<CourseDoc, "modules">): SharedImage[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const wanted = new Set(courseImageIds(doc));
  const out: SharedImage[] = [];
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!wanted.has(id) || !imageIdSchema.safeParse(id).success) continue;
    const data = (entry as { data?: unknown } | null)?.data;
    if (typeof data !== "string" || data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) continue;
    const bytes = new Uint8Array(Buffer.from(data, "base64"));
    const type = sniffImage(bytes);
    if (!type || bytes.byteLength > MAX_IMAGE_BYTES) continue;
    out.push({ id, type, bytes });
  }
  return out;
}

// C0/C1 controls (except tab and newline), bidi overrides and zero-width characters can hide text from a reader.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Rebuilds plain JSON data with clean strings. Anything that is not JSON data is rejected. */
export function sanitise(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error("The file is nested too deeply.");
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("The file contains an invalid number.");
    return value;
  }
  if (value === null || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => sanitise(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out[key] = sanitise(v, depth + 1);
    }
    return out;
  }
  throw new Error("The file contains something that is not JSON data.");
}

export type ImportResult = { doc: CourseDoc; progress: Progress; images: SharedImage[] };

/** Parses and validates a shared course. Throws with a readable list of problems. */
export function importCourse(text: string, now: Date): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("That file is too large to be a sloodle course.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const embedded = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).images : undefined;
  if (embedded !== undefined) delete (raw as Record<string, unknown>).images;
  const data = sanitise(raw) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data) || data.format !== COURSE_FORMAT) {
    throw new Error("That file is not a sloodle course.");
  }
  if (typeof data.version === "number" && data.version > COURSE_VERSION) {
    throw new Error(`That course was made by a newer version of sloodle (format version ${data.version}). Update sloodle to open it.`);
  }

  const originalId = typeof data.id === "string" ? data.id.slice(0, 64) : undefined;
  const title = typeof data.title === "string" ? data.title : "course";
  const parsed = courseSchema.safeParse({ ...data, id: courseSlug(title) });
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "course"}: ${i.message}`);
    throw new Error(`That course file has problems:\n- ${problems.join("\n- ")}`);
  }
  const doc = parsed.data;
  const progress: Progress = {
    format: "sloodle.progress",
    version: 1,
    id: doc.id,
    topic: doc.subject || doc.title,
    createdAt: now.toISOString(),
    phase: "ready",
    origin: { kind: "imported", importedTitle: doc.title, importedId: originalId, at: now.toISOString() },
    objectiveStates: {},
    summaries: [],
    projects: [],
    reviewCards: [],
    sdkSessions: {},
  };
  return { doc, progress, images: sharedImages(embedded, doc) };
}

/** Wraps course text for a prompt so it reads as quoted material, and cannot close its own wrapper. */
export function fence(text: string): string {
  return text.replace(/<\/?\s*course_material/gi, (m) => m.replace("<", "‹"));
}
