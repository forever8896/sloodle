// Curriculum changes proposed from the global chat. The model can only propose: a proposal is computed and checked
// here, shown to the learner as a before/after card, and nothing touches course.json until they accept. Accepting
// re-checks the course against the schema, backs up the previous course.json, writes the new one and records a
// course_revised event. Progress is keyed by objective id and is never rewritten, so every lesson that survives keeps
// its mastery, and a removed lesson's record stays in progress.json.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { recordActivity } from "./activity";
import { structuredCall } from "./agent";
import { courseProblems, courseSchema, bloomLevels, idSchema, lessonPlanSchema, planGaps, type CourseDoc, type LessonPlan, type Module, type Objective, type ObjectiveState } from "./formats";
import { allObjectives, statusOf } from "./learner";
import { replanPrompt, replanRequest } from "./chatprompts";
import { courseDir, dataDir, store } from "./store";
import type { OutlineLesson, OutlineModule, ProposalView } from "./chattypes";

// ---------------------------------------------------------------- what the model may propose

const statement = z.string().min(1).max(2000);
const lessonDraft = z.strictObject({
  id: idSchema.describe("A new, unused id, such as m3-scale-cups."),
  statement: statement.describe('An observable performance: "can ... given ...".'),
  level: z.enum(bloomLevels),
  prerequisites: z.array(idSchema).max(20).default([]),
});
const placement = {
  after: idSchema.optional().describe("Place it right after this id. Omit to use position."),
  position: z.enum(["start", "end"]).default("end").describe("Used when after is omitted."),
};

export const courseChangeSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add_lesson"), module_id: idSchema, lesson: lessonDraft, ...placement }),
  z.strictObject({ op: z.literal("remove_lesson"), lesson_id: idSchema }),
  z.strictObject({ op: z.literal("move_lesson"), lesson_id: idSchema, module_id: idSchema.describe("The module it ends up in; may be its current one."), ...placement }),
  z.strictObject({
    op: z.literal("edit_lesson"),
    lesson_id: idSchema,
    statement: statement.optional().describe("A new statement renames or re-scopes the lesson; its id and progress stay."),
    level: z.enum(bloomLevels).optional(),
    prerequisites: z.array(idSchema).max(20).optional(),
    replan: z.boolean().default(false).describe("Rewrite its lesson plan. Implied when the statement changes and the lesson is not yet mastered."),
  }),
  z.strictObject({
    op: z.literal("add_module"),
    module: z.strictObject({ id: idSchema, title: z.string().min(1).max(200), why: z.string().min(1).max(2000) }),
    lessons: z.array(lessonDraft).min(1).max(40),
    ...placement,
  }),
  z.strictObject({ op: z.literal("remove_module"), module_id: idSchema }),
  z.strictObject({ op: z.literal("move_module"), module_id: idSchema, ...placement }),
  z.strictObject({ op: z.literal("edit_module"), module_id: idSchema, title: z.string().min(1).max(200).optional(), why: z.string().min(1).max(2000).optional() }),
  z.strictObject({
    op: z.literal("replan_lessons"),
    lesson_ids: z.array(idSchema).min(1).max(40),
    guidance: z.string().min(1).max(1000).describe("How the new plans should differ: depth, pacing, more examples first, harder checks..."),
  }),
  z.strictObject({
    op: z.literal("edit_course"),
    title: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).max(2000).optional(),
    estimated_hours: z.number().positive().max(10000).optional(),
  }),
]);

export type CourseChange = z.infer<typeof courseChangeSchema>;

// ---------------------------------------------------------------- applying changes (pure)

export interface Applied {
  next: CourseDoc;
  /** Plain-language lines for the card, one per effect. */
  lines: string[];
  /** Things the learner must not miss, such as removing a lesson they completed. */
  warnings: string[];
  added: string[];
  removed: string[];
  changed: string[];
  /** Objectives that need a (new) lesson plan, with any guidance for it. */
  replan: Record<string, string>;
  problems: string[];
}

const short = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const quote = (o: Pick<Objective, "statement">) => `"${short(o.statement.trim().replace(/[.!]+$/, ""))}"`;
const emptyPlan = (): LessonPlan => lessonPlanSchema.parse({});
const done = (status: string) => status === "mastered" || status === "practiced";

/** Applies the changes to a copy of the course. Never touches the store. */
export function applyChanges(doc: CourseDoc, states: Record<string, ObjectiveState>, changes: CourseChange[]): Applied {
  const next = structuredClone(doc);
  const out: Applied = { next, lines: [], warnings: [], added: [], removed: [], changed: [], replan: {}, problems: [] };
  const original = new Map(allObjectives(doc).map((o) => [o.id, o]));
  const changed = new Set<string>();
  const removed = new Set<string>();
  const added = new Set<string>();

  const moduleOf = (id: string) => next.modules.find((m) => m.id === id);
  const locate = (lessonId: string) => {
    for (const module of next.modules) {
      const index = module.objectives.findIndex((o) => o.id === lessonId);
      if (index >= 0) return { module, index, lesson: module.objectives[index]! };
    }
    return undefined;
  };
  const idInUse = (id: string) => next.modules.some((m) => m.id === id || m.objectives.some((o) => o.id === id));
  const place = <T extends { id: string }>(list: T[], item: T, where: { after?: string; position: "start" | "end" }, what: string): boolean => {
    if (where.after) {
      const index = list.findIndex((x) => x.id === where.after);
      if (index < 0) {
        out.problems.push(`${what}: "${where.after}" is not there to place it after.`);
        return false;
      }
      list.splice(index + 1, 0, item);
    } else if (where.position === "start") list.unshift(item);
    else list.push(item);
    return true;
  };
  const freshLesson = (draft: z.infer<typeof lessonDraft>, where: string): Objective | undefined => {
    if (idInUse(draft.id)) {
      out.problems.push(`add: id "${draft.id}" is already used in this course. Pick a new id.`);
      return undefined;
    }
    if (states[draft.id]) {
      out.problems.push(`add: id "${draft.id}" belonged to an earlier lesson and still has progress on record. Pick a new id.`);
      return undefined;
    }
    added.add(draft.id);
    out.replan[draft.id] = "";
    out.lines.push(`Adds the lesson ${quote(draft)} to ${where}.`);
    return { ...draft, lesson: emptyPlan() };
  };
  const dropLesson = (lesson: Objective, why: string) => {
    if (added.delete(lesson.id)) {
      delete out.replan[lesson.id];
      return;
    }
    removed.add(lesson.id);
    changed.delete(lesson.id);
    delete out.replan[lesson.id];
    const status = statusOf(states, lesson.id);
    out.lines.push(`${why} ${quote(lesson)}.`);
    if (done(status)) {
      out.warnings.push(`Removes ${quote(lesson)}, which you have ${status === "mastered" ? "mastered" : "already practiced"}. Your record of it is kept, but it will no longer count in this course.`);
    } else if (status === "learning") {
      out.warnings.push(`Removes ${quote(lesson)}, which you have started. Your answers so far are kept on record.`);
    }
  };

  for (const change of changes) {
    switch (change.op) {
      case "add_lesson": {
        const module = moduleOf(change.module_id);
        if (!module) {
          out.problems.push(`add_lesson: there is no module "${change.module_id}".`);
          break;
        }
        const lesson = freshLesson(change.lesson, `"${module.title}"`);
        if (lesson) place(module.objectives, lesson, change, `add_lesson ${lesson.id}`);
        break;
      }
      case "remove_lesson": {
        const found = locate(change.lesson_id);
        if (!found) {
          out.problems.push(`remove_lesson: there is no lesson "${change.lesson_id}".`);
          break;
        }
        found.module.objectives.splice(found.index, 1);
        dropLesson(found.lesson, "Removes the lesson");
        break;
      }
      case "move_lesson": {
        const found = locate(change.lesson_id);
        const target = moduleOf(change.module_id);
        if (!found || !target) {
          out.problems.push(`move_lesson: ${!found ? `there is no lesson "${change.lesson_id}"` : `there is no module "${change.module_id}"`}.`);
          break;
        }
        found.module.objectives.splice(found.index, 1);
        if (!place(target.objectives, found.lesson, change, `move_lesson ${change.lesson_id}`)) break;
        if (!added.has(found.lesson.id)) changed.add(found.lesson.id);
        out.lines.push(target === found.module ? `Moves ${quote(found.lesson)} within "${target.title}".` : `Moves ${quote(found.lesson)} from "${found.module.title}" to "${target.title}".`);
        break;
      }
      case "edit_lesson": {
        const found = locate(change.lesson_id);
        if (!found) {
          out.problems.push(`edit_lesson: there is no lesson "${change.lesson_id}".`);
          break;
        }
        const lesson = found.lesson;
        const before = quote(lesson);
        const status = statusOf(states, lesson.id);
        if (change.statement !== undefined && change.statement !== lesson.statement) {
          lesson.statement = change.statement;
          out.lines.push(`Rewrites ${before} as ${quote(lesson)}.`);
          if (done(status)) out.warnings.push(`${quote(lesson)} keeps the progress you made under its old wording (${status}).`);
          if (status !== "mastered") out.replan[lesson.id] ??= "";
        }
        if (change.level !== undefined && change.level !== lesson.level) {
          out.lines.push(`Changes the level of ${quote(lesson)} from ${lesson.level} to ${change.level}.`);
          lesson.level = change.level;
        }
        if (change.prerequisites !== undefined) {
          lesson.prerequisites = change.prerequisites;
          out.lines.push(`Sets what ${quote(lesson)} builds on: ${change.prerequisites.join(", ") || "nothing"}.`);
        }
        if (change.replan) {
          out.replan[lesson.id] ??= "";
          out.lines.push(`Rewrites the lesson plan of ${quote(lesson)}.`);
        }
        if (!added.has(lesson.id)) changed.add(lesson.id);
        break;
      }
      case "add_module": {
        if (idInUse(change.module.id)) {
          out.problems.push(`add_module: id "${change.module.id}" is already used in this course.`);
          break;
        }
        const module: Module = { ...change.module, objectives: [] };
        out.lines.push(`Adds the module "${module.title}".`);
        for (const draft of change.lessons) {
          const lesson = freshLesson(draft, `"${module.title}"`);
          if (lesson) module.objectives.push(lesson);
        }
        place(next.modules, module, change, `add_module ${module.id}`);
        break;
      }
      case "remove_module": {
        const index = next.modules.findIndex((m) => m.id === change.module_id);
        if (index < 0) {
          out.problems.push(`remove_module: there is no module "${change.module_id}".`);
          break;
        }
        const [module] = next.modules.splice(index, 1);
        out.lines.push(`Removes the module "${module!.title}".`);
        for (const lesson of module!.objectives) dropLesson(lesson, "With it goes the lesson");
        break;
      }
      case "move_module": {
        const index = next.modules.findIndex((m) => m.id === change.module_id);
        if (index < 0) {
          out.problems.push(`move_module: there is no module "${change.module_id}".`);
          break;
        }
        const [module] = next.modules.splice(index, 1);
        if (place(next.modules, module!, change, `move_module ${change.module_id}`)) out.lines.push(`Moves the module "${module!.title}".`);
        break;
      }
      case "edit_module": {
        const module = moduleOf(change.module_id);
        if (!module) {
          out.problems.push(`edit_module: there is no module "${change.module_id}".`);
          break;
        }
        if (change.title !== undefined && change.title !== module.title) {
          out.lines.push(`Renames the module "${module.title}" to "${change.title}".`);
          module.title = change.title;
        }
        if (change.why !== undefined) module.why = change.why;
        break;
      }
      case "replan_lessons": {
        for (const id of change.lesson_ids) {
          const found = locate(id);
          if (!found) {
            out.problems.push(`replan_lessons: there is no lesson "${id}".`);
            continue;
          }
          out.replan[id] = change.guidance;
          if (!added.has(id)) changed.add(id);
        }
        out.lines.push(`Rewrites the lesson plans of ${change.lesson_ids.length === 1 ? "one lesson" : `${change.lesson_ids.length} lessons`} so that: ${short(change.guidance, 200)}`);
        break;
      }
      case "edit_course": {
        if (change.title !== undefined && change.title !== next.title) {
          out.lines.push(`Renames the course to "${change.title}".`);
          next.title = change.title;
        }
        if (change.summary !== undefined) {
          next.summary = change.summary;
          out.lines.push("Rewrites the course summary.");
        }
        if (change.estimated_hours !== undefined) {
          next.estimatedHours = change.estimated_hours;
          out.lines.push(`Sets the estimated time to ${change.estimated_hours} hours.`);
        }
        break;
      }
    }
  }

  // A lesson removed here no longer gates the lessons that built on it.
  const remaining = new Set(allObjectives(next).map((o) => o.id));
  for (const lesson of allObjectives(next)) {
    const kept = lesson.prerequisites.filter((p) => !removed.has(p) || remaining.has(p));
    if (kept.length !== lesson.prerequisites.length) {
      out.lines.push(`${quote(lesson)} no longer waits for ${lesson.prerequisites.filter((p) => !kept.includes(p)).map((p) => quote(original.get(p) ?? { statement: p })).join(" and ")}.`);
      lesson.prerequisites = kept;
    }
  }
  // A module needs at least one lesson; one emptied by removals goes too.
  for (const module of [...next.modules]) {
    if (module.objectives.length === 0) {
      next.modules.splice(next.modules.indexOf(module), 1);
      if (doc.modules.some((m) => m.id === module.id)) out.lines.push(`The module "${module.title}" is left empty, so it is removed.`);
      else out.problems.push(`Module "${module.id}" would have no lessons.`);
    }
  }
  if (next.modules.length === 0) out.problems.push("A course needs at least one module with one lesson.");
  if (changes.length === 0) out.problems.push("Propose at least one change.");

  // Fresh lessons start with an empty plan; a lesson to be re-planned keeps its old one until the new one is written.
  if (out.problems.length === 0) {
    const parsed = courseSchema.safeParse(next);
    if (!parsed.success) out.problems.push(...parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "course"}: ${i.message}`));
  }

  out.added = [...added];
  out.removed = [...removed];
  out.changed = [...changed].filter((id) => remaining.has(id));
  return out;
}

// ---------------------------------------------------------------- proposals

export type ProposalStatus = ProposalView["status"];

export interface Proposal {
  id: string;
  courseId: string;
  createdAt: string;
  reason: string;
  changes: CourseChange[];
  /** Hash of course.json when proposed: accepting refuses if the course changed since. */
  baseHash: string;
  status: ProposalStatus;
  resolvedAt?: string;
  view: ProposalView;
}

export function contentHash(doc: CourseDoc): string {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 16);
}

function outline(doc: CourseDoc, states: Record<string, ObjectiveState>, mark: (lesson: Objective) => OutlineLesson["mark"], markModule: (module: Module) => OutlineModule["mark"]): OutlineModule[] {
  return doc.modules.map((m) => ({
    id: m.id,
    title: m.title,
    mark: markModule(m),
    lessons: m.objectives.map((o) => ({ id: o.id, statement: o.statement, status: statusOf(states, o.id), mark: mark(o) })),
  }));
}

/** Builds a proposal from the model's changes, or returns the problems to send back to it. Writes nothing. */
export function propose(courseId: string, reason: string, changes: CourseChange[], now = new Date()): { proposal?: Proposal; problems: string[] } {
  const doc = store.content(courseId);
  if (!doc) return { problems: [`The course "${courseId}" has no outline yet, so there is nothing to change. It is still being set up.`] };
  const progress = store.progress(courseId);
  if (progress.phase !== "ready") return { problems: [`The course "${courseId}" is still being built; changes can be proposed once it is ready.`] };
  const states = progress.objectiveStates;
  const applied = applyChanges(doc, states, changes);
  if (applied.problems.length) return { problems: applied.problems };

  const removed = new Set(applied.removed);
  const changed = new Set(applied.changed);
  const added = new Set(applied.added);
  const before = new Map(allObjectives(doc).map((o) => [o.id, o]));
  const oldModules = new Map(doc.modules.map((m) => [m.id, m]));
  const newModules = new Map(applied.next.modules.map((m) => [m.id, m]));
  const replanned = new Set(Object.keys(applied.replan));

  const view: ProposalView = {
    id: `p-${crypto.randomUUID().slice(0, 8)}`,
    courseId,
    courseTitle: doc.title,
    reason,
    lines: applied.lines,
    warnings: applied.warnings,
    before: outline(doc, states, (o) => (removed.has(o.id) ? "removed" : changed.has(o.id) ? "changed" : undefined), (m) => (!newModules.has(m.id) ? "removed" : newModules.get(m.id)!.title !== m.title ? "changed" : undefined)),
    after: outline(
      applied.next,
      states,
      (o) => (added.has(o.id) ? "added" : changed.has(o.id) || before.get(o.id)?.statement !== o.statement || replanned.has(o.id) ? "changed" : undefined),
      (m) => (!oldModules.has(m.id) ? "added" : oldModules.get(m.id)!.title !== m.title ? "changed" : undefined),
    ),
    plans: Object.keys(applied.replan).length,
    status: "pending",
  };
  return {
    problems: [],
    proposal: { id: view.id, courseId, createdAt: now.toISOString(), reason, changes, baseHash: contentHash(doc), status: "pending", view },
  };
}

export class ProposalError extends Error {
  constructor(
    message: string,
    readonly status: ProposalStatus,
  ) {
    super(message);
  }
}

export interface Accepted {
  proposal: Proposal;
  /** The previous course.json, relative to the data folder. */
  backup: string;
  replan: Record<string, string>;
}

/**
 * The learner pressed Accept. Re-applies the changes to the course as it is now, validates the result against the
 * schema, backs up the previous course.json, writes the new one and records the event. Throws without writing anything
 * when the proposal is not pending, the course changed since, or the result is invalid.
 */
export function acceptProposal(proposal: Proposal, now = new Date()): Accepted {
  if (proposal.status !== "pending") throw new ProposalError(`This proposal was already ${proposal.status}.`, proposal.status);
  const current = store.content(proposal.courseId);
  if (!current) throw new ProposalError("The course is gone.", "stale");
  if (contentHash(current) !== proposal.baseHash) throw new ProposalError("The course changed after this was proposed, so nothing was changed. Ask Sloo to propose it again.", "stale");
  const progress = store.progress(proposal.courseId);
  const applied = applyChanges(current, progress.objectiveStates, proposal.changes);
  if (applied.problems.length) throw new ProposalError(`The change no longer fits the course: ${applied.problems.join(" ")}`, "failed");
  const next = courseSchema.parse(applied.next);

  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = join(dataDir, "backups", "revisions", proposal.courseId);
  mkdirSync(dir, { recursive: true });
  const backupPath = join(dir, `course-${stamp}-${proposal.id}.json`);
  copyFileSync(join(courseDir(proposal.courseId), "course.json"), backupPath);
  store.saveContent(next);

  const backup = relative(dataDir, backupPath);
  recordActivity(
    {
      type: "course_revised",
      courseId: proposal.courseId,
      proposalId: proposal.id,
      summary: short(applied.lines.join(" "), 1500),
      backup,
      added: applied.added,
      removed: applied.removed,
      changed: applied.changed,
    },
    now,
  );
  const resolved: Proposal = { ...proposal, status: "accepted", resolvedAt: now.toISOString(), view: { ...proposal.view, status: "accepted" } };
  return { proposal: resolved, backup, replan: applied.replan };
}

/** The learner pressed Reject: only the proposal's own status changes. */
export function rejectProposal(proposal: Proposal, now = new Date()): Proposal {
  if (proposal.status !== "pending") throw new ProposalError(`This proposal was already ${proposal.status}.`, proposal.status);
  return { ...proposal, status: "rejected", resolvedAt: now.toISOString(), view: { ...proposal.view, status: "rejected" } };
}

// ---------------------------------------------------------------- lesson plans for new and re-scoped lessons

const BATCH = 3;
const plansSchema = z.object({ plans: z.array(lessonPlanSchema.extend({ objectiveId: idSchema })) });

/**
 * Writes lesson plans for the given objectives with the planner model, a few at a time, the same shape and checks as
 * the planning session's save_lesson_plans. Until a plan lands the tutor teaches the lesson from its statement.
 * Returns the ids that got a plan.
 */
export async function planLessons(courseId: string, replan: Record<string, string>, onProgress: (planned: string[]) => void = () => undefined): Promise<string[]> {
  const ids = Object.keys(replan);
  const planned: string[] = [];
  const settings = store.settings();
  for (let i = 0; i < ids.length; i += BATCH) {
    const doc = store.content(courseId);
    if (!doc) break;
    const targets = ids.slice(i, i + BATCH).flatMap((id) => {
      const objective = allObjectives(doc).find((o) => o.id === id);
      return objective ? [{ objective, guidance: replan[id] ?? "" }] : [];
    });
    if (!targets.length) continue;
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await structuredCall(settings, courseDir(courseId), {
        model: settings.models.planner,
        system: replanPrompt(),
        prompt: replanRequest(doc, store.progress(courseId), store.learner(), targets) + feedback,
        schema: plansSchema,
        label: "Lesson planning",
      });
      // Re-read: the learner may have studied, or accepted another change, while the model was writing.
      const fresh = store.content(courseId);
      if (!fresh) return planned;
      const wanted = new Set(targets.map((t) => t.objective.id));
      const written: string[] = [];
      for (const { objectiveId, ...plan } of raw.plans) {
        const objective = allObjectives(fresh).find((o) => o.id === objectiveId);
        if (!objective || !wanted.has(objectiveId)) continue;
        objective.lesson = lessonPlanSchema.parse(plan);
        written.push(objectiveId);
      }
      const problems = [...courseProblems(fresh), ...allObjectives(fresh).filter((o) => written.includes(o.id)).flatMap(planGaps)];
      if (problems.length === 0 && written.length) {
        store.saveContent(fresh);
        planned.push(...written);
        onProgress(planned);
        break;
      }
      feedback = `\n\nYour previous answer could not be saved. Fix these and answer again:\n- ${problems.slice(0, 20).join("\n- ") || "No plans matched the requested objective ids."}`;
    }
  }
  return planned;
}
