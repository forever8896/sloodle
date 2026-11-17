// The data formats of sloodle, defined once. TypeScript types are inferred from these schemas and the published
// JSON Schema files in `sidecar/schema/` are generated from them (`bun run schema`).
//
// - sloodle.course   A shareable course: content and lesson plans, never personal data.
// - sloodle.progress One person's enrollment in a course: goal brief, mastery, summaries, review cards.
// - sloodle.learner  The person: what they told us, notes, and a profile derived by code from their activity.
// - sloodle.sloo     The teacher: persona, memory of this person, and a teaching approach that adapts.
// - activity events  The append-only log (events.jsonl) the derived parts are computed from.

import { z } from "zod";

const text = (max: number) => z.string().max(max);
const SHORT = 200;
const MEDIUM = 2000;
const LONG = 12000;

/** Ids are short lowercase slugs, so they are safe in paths, prompts and HTML. */
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Use a short lowercase slug such as m2-chain-rule.");

export const bloomLevels = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;
export const questionKinds = ["choice", "short", "explain", "numeric"] as const;
/** What an answer event can be: a question, or the learner's work in a gradable component. */
export const answerKinds = [...questionKinds, "ordering", "matching", "blanks", "prediction", "flashcard"] as const;

/** What a block of a lesson plan is for. The tutor may re-present, reorder or substitute blocks by intent. */
export const blockIntents = ["activate", "explain", "example", "analogy", "visual", "practice", "recall", "reflect", "project", "summary"] as const;

export const intentMeaning: Record<(typeof blockIntents)[number], string> = {
  activate: "surface what the learner already thinks, or have them predict, before teaching",
  explain: "a direct explanation of one key idea",
  example: "a worked example, step by step",
  analogy: "a comparison with something familiar",
  visual: "a diagram, table, picture or spatial description",
  practice: "the learner solves a problem (usually a check)",
  recall: "the learner retrieves earlier material from memory",
  reflect: "the learner explains why, or connects the idea to their own use",
  project: "a small hands-on task",
  summary: "a short pulling-together of the key ideas",
};

// ---------------------------------------------------------------- sloodle.course

export const misconceptionSchema = z.strictObject({
  id: idSchema,
  belief: text(MEDIUM).describe("The wrong idea, stated as a learner would believe it."),
  correction: text(MEDIUM).describe("What is actually true, and why the wrong idea is tempting."),
  sign: text(MEDIUM).optional().describe("How it shows up in an answer."),
});

export const checkSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(questionKinds).describe("choice = multiple choice; short = a few words or one sentence; explain = in their own words; numeric = a number."),
  prompt: text(LONG).describe("Markdown shown to the learner: only the question, self-contained."),
  options: z.array(text(MEDIUM)).min(2).max(6).optional().describe("For choice only. Distractors should be what real misconceptions produce."),
  correctOption: z.number().int().min(0).optional().describe("For choice only: zero-based index of the right option."),
  optionMisconceptions: z.array(idSchema.nullable()).max(6).optional().describe("For choice only: per option, the misconception id that picking it reveals, or null."),
  numericAnswer: z.number().optional().describe("For numeric only."),
  tolerance: z.number().min(0).optional().describe("For numeric only: accepted absolute error."),
  answerKey: text(LONG).describe("The complete correct answer. Stays in the engine until the learner has answered."),
  rubric: text(MEDIUM).optional().describe("For short and explain: what full and partial credit need."),
  hints: z.array(text(MEDIUM)).max(3).default([]).describe("Up to three hints from gentle to pointed. A hint guides thinking and never states the answer."),
  misconceptionIds: z.array(idSchema).max(12).default([]).describe("Misconceptions of this objective that this check can reveal."),
});

// ---------------------------------------------------------------- lesson components
//
// A lesson-plan block is one component from this catalogue. Markdown is the original block and stays the default:
// a block without "type" is Markdown, so every course written before the catalogue existed still validates as it was.
// The same shapes are the tutor's tools for improvising a component mid-session (session.ts), and the interface renders
// one component per type (src/components/blocks/). Answer keys (an ordering's order, a matching's pairs, a blank's
// accepted answers, a worked example's steps, a flashcard's back) stay in the engine until the learner has answered.

export const componentTypes = ["markdown", "diagram", "code", "ordering", "matching", "blanks", "steps", "flashcard", "table", "callout", "image"] as const;
export const diagramKinds = ["flowchart", "sequence", "concept"] as const;
export const codeLanguages = ["javascript", "typescript", "python", "html", "css", "json", "bash", "sql", "java", "c", "cpp", "csharp", "go", "rust", "ruby", "php", "kotlin", "swift", "plaintext"] as const;
export const calloutTones = ["tip", "warning", "key-idea", "common-mistake"] as const;

/**
 * Where a lesson image came from. "commons" is Wikimedia Commons; a second source (generated pictures, say) is added
 * here and in images.ts, and needs nothing else in the format.
 */
export const imageProviders = ["commons"] as const;

/** An image is named by a hash of where it came from, so the same picture has the same id in every course. */
export const imageIdSchema = z.string().regex(/^img-[0-9a-f]{16}$/, "Use an image id from a find_images result, such as img-0123456789abcdef.");

const httpsUrl = z.string().max(2000).regex(/^https:\/\/[^\s]+$/i, "Only https links.");

export const imageCreditSchema = z.strictObject({
  provider: z.enum(imageProviders),
  title: text(SHORT).describe("The file's title at the source."),
  author: text(SHORT),
  licence: text(100).describe('Short licence name, such as "CC BY-SA 4.0" or "Public domain".'),
  licenceUrl: httpsUrl.optional(),
  sourceUrl: httpsUrl.describe("The file's page at the source, where its full licence and history are."),
});

export const lessonImageSchema = z.strictObject({
  image: imageIdSchema.describe("The id of a find_images result. Never made up."),
  alt: text(400).min(3).describe("What the picture shows, for someone who cannot see it. Specific, one or two sentences; never just a file name."),
  caption: text(SHORT).optional().describe("Shown under this picture: what to notice."),
  credit: imageCreditSchema.optional().describe("Filled in by the engine from the search result; leave it out."),
});

const blockBase = {
  id: idSchema,
  intent: z.enum(blockIntents),
  title: text(SHORT).optional(),
};

const hintsField = z.array(text(MEDIUM)).max(3).default([]).describe("Up to three hints from gentle to pointed. A hint guides thinking and never states the answer.");
/** Short labels (list items, pairs, table cells): inline Markdown such as `code` or *emphasis*, one line. */
const label = (max: number) => text(max).regex(/^[^\n]*$/, "Keep it to one line.");

/** The fields of each component type, without the block's id, intent and title. Tools reuse these. */
export const componentFields = {
  diagram: {
    type: z.literal("diagram"),
    kind: z.enum(diagramKinds).describe("flowchart = steps and decisions; sequence = messages between actors over time; concept = ideas and how they relate."),
    source: text(4000).describe("Mermaid source: `flowchart TD` / `flowchart LR` for flowchart and concept maps, `sequenceDiagram` for sequence. Plain labels only: no HTML, no click handlers, no styling directives."),
    description: text(MEDIUM).describe("What the diagram shows, in plain sentences. Read by screen readers, and shown instead of the diagram if it cannot be drawn."),
    caption: text(SHORT).optional(),
  },
  code: {
    type: z.literal("code"),
    language: z.enum(codeLanguages),
    code: text(6000).describe("The code, as it should appear. Under about 40 lines."),
    caption: text(MEDIUM).optional().describe("One or two sentences on what to notice."),
    runnable: z.boolean().default(false).describe("JavaScript only: the learner may press Run to see its console output, in a sandbox with no network and a time limit."),
  },
  ordering: {
    type: z.literal("ordering"),
    prompt: text(MEDIUM).describe("Markdown: what to put in order, and by what (time, size, the steps of a procedure)."),
    items: z.array(label(300)).min(3).max(8).describe("The items IN THE CORRECT ORDER. The learner sees them shuffled."),
    explanation: text(MEDIUM).optional().describe("Why this is the order. Shown with the result."),
    hints: hintsField,
  },
  matching: {
    type: z.literal("matching"),
    prompt: text(MEDIUM).describe("Markdown: what to match with what."),
    pairs: z.array(z.strictObject({ left: label(300), right: label(300) })).min(2).max(8).describe("The correct pairs. The learner sees the right-hand items shuffled."),
    distractors: z.array(label(300)).max(3).default([]).describe("Extra right-hand items that match nothing."),
    hints: hintsField,
  },
  blanks: {
    type: z.literal("blanks"),
    prompt: text(MEDIUM).optional().describe("Markdown shown above the text."),
    mode: z.enum(["prose", "code"]).default("prose").describe("code shows the text in a monospace font and compares answers case-sensitively."),
    text: text(MEDIUM).describe("The sentence or code with each gap written as {{1}}, {{2}} and so on, in order."),
    blanks: z
      .array(
        z.strictObject({
          accept: z.array(label(200)).min(1).max(8).describe("Every answer that counts as right. The first is the one shown after answering."),
          caseSensitive: z.boolean().optional().describe("Defaults to false in prose and true in code."),
        }),
      )
      .min(1)
      .max(8),
    hints: hintsField,
  },
  steps: {
    type: z.literal("steps"),
    prompt: text(MEDIUM).describe("Markdown: the problem the worked example solves."),
    steps: z
      .array(
        z.strictObject({
          text: text(MEDIUM).describe("Markdown: this step of the solution and why it is taken."),
          predict: text(MEDIUM).optional().describe("A question the learner answers before this step is revealed, such as 'What would you do next?'. Graded against the step's text."),
        }),
      )
      .min(2)
      .max(10),
  },
  flashcard: {
    type: z.literal("flashcard"),
    front: text(MEDIUM).describe("Markdown: a question that forces recall."),
    back: text(MEDIUM).describe("Markdown: the short answer."),
  },
  table: {
    type: z.literal("table"),
    caption: text(SHORT).optional(),
    columns: z.array(label(120)).min(2).max(5).describe("Column headings. The first heads the row labels."),
    rows: z.array(z.strictObject({ label: label(200), cells: z.array(label(400)).min(1).max(4) })).min(1).max(12).describe("One per thing compared; cells follow the columns after the first."),
  },
  callout: {
    type: z.literal("callout"),
    tone: z.enum(calloutTones).describe("tip = a useful shortcut; warning = a real hazard; key-idea = the one thing to remember; common-mistake = what learners often get wrong, and the fix."),
    body: text(MEDIUM).describe("Markdown, a few sentences at most."),
  },
  image: {
    type: z.literal("image"),
    images: z.array(lessonImageSchema).min(1).max(6).describe("One picture, or up to six shown side by side to compare (the cards of a suit, leaf shapes)."),
    caption: text(MEDIUM).optional().describe("Under the whole block: what to look at and why it matters."),
  },
} as const;

export const markdownBlockSchema = z.strictObject({
  ...blockBase,
  type: z.literal("markdown").optional().describe("Optional: a block without a type is Markdown."),
  body: text(LONG).describe("Markdown. For practice and recall blocks, the framing around the check."),
  checkId: idSchema.optional().describe("For practice and recall: the check this block puts to the learner."),
});

export const blockSchema = z.discriminatedUnion("type", [
  markdownBlockSchema,
  z.strictObject({ ...blockBase, ...componentFields.diagram }),
  z.strictObject({ ...blockBase, ...componentFields.code }),
  z.strictObject({ ...blockBase, ...componentFields.ordering }),
  z.strictObject({ ...blockBase, ...componentFields.matching }),
  z.strictObject({ ...blockBase, ...componentFields.blanks }),
  z.strictObject({ ...blockBase, ...componentFields.steps }),
  z.strictObject({ ...blockBase, ...componentFields.flashcard }),
  z.strictObject({ ...blockBase, ...componentFields.table }),
  z.strictObject({ ...blockBase, ...componentFields.callout }),
  z.strictObject({ ...blockBase, ...componentFields.image }),
]);

export const reviewCardSeedSchema = z.strictObject({
  front: text(MEDIUM).describe("A question that forces recall."),
  back: text(MEDIUM).describe("The short answer."),
});

export const lessonPlanSchema = z.strictObject({
  keyIdeas: z.array(text(MEDIUM)).max(12).default([]).describe("The few ideas the learner must leave with."),
  misconceptions: z.array(misconceptionSchema).max(12).default([]),
  blocks: z.array(blockSchema).max(40).default([]).describe("The script, in teaching order. The tutor adapts delivery to the learner."),
  checks: z.array(checkSchema).max(30).default([]),
  review: z.array(reviewCardSeedSchema).max(30).default([]).describe("Facts worth spaced review once met."),
});

export const objectiveSchema = z.strictObject({
  id: idSchema,
  statement: text(MEDIUM).describe('An observable performance: "can ... given ...".'),
  level: z.enum(bloomLevels),
  prerequisites: z.array(idSchema).max(20).default([]),
  lesson: lessonPlanSchema.prefault({}),
});

export const projectSchema = z.strictObject({
  title: text(SHORT),
  brief: text(LONG).describe("Markdown: what to build or do, and why it matters."),
  deliverables: z.array(text(MEDIUM)).max(20).default([]),
});

export const moduleSchema = z.strictObject({
  id: idSchema,
  title: text(SHORT),
  why: text(MEDIUM).describe("One sentence on why this module matters for the course goal."),
  objectives: z.array(objectiveSchema).min(1).max(40),
  project: projectSchema.optional(),
});

export const sourceSchema = z.strictObject({
  title: text(SHORT),
  url: z.string().max(2000).regex(/^https?:\/\/[^\s]+$/i, "Only http and https links."),
  kind: text(100),
  why: text(MEDIUM),
});

export const COURSE_FORMAT = "sloodle.course";
export const COURSE_VERSION = 1;

const courseShape = {
  format: z.literal(COURSE_FORMAT),
  version: z.literal(COURSE_VERSION),
  id: idSchema,
  title: text(SHORT),
  subject: text(SHORT).describe("The subject in a few words."),
  summary: text(MEDIUM),
  audience: text(MEDIUM).describe("Who it is written for: starting level and kind of goal. No personal details."),
  language: z.string().max(35).default("en").describe("BCP 47 language tag of the content."),
  estimatedHours: z.number().positive().max(10000).optional(),
  tags: z.array(text(60)).max(20).default([]),
  createdAt: text(40),
  modules: z.array(moduleSchema).min(1).max(40),
  sources: z.array(sourceSchema).max(100).default([]),
};

/** Without the cross-reference checks: use for tool inputs, where refinements cannot be expressed. */
export const courseBaseSchema = z.strictObject(courseShape);

export const courseSchema = courseBaseSchema.superRefine((course, ctx) => {
  for (const message of courseProblems(course)) ctx.addIssue({ code: "custom", message });
});

export type CourseDoc = z.infer<typeof courseBaseSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type LessonBlock = z.infer<typeof blockSchema>;
export type MarkdownBlock = z.infer<typeof markdownBlockSchema>;
export type ComponentType = (typeof componentTypes)[number];
/** A block of one type; Markdown blocks may leave the type out. */
export type BlockOf<T extends ComponentType> = T extends "markdown" ? MarkdownBlock : Extract<LessonBlock, { type: T }>;
export type DiagramKind = (typeof diagramKinds)[number];
export type CodeLanguage = (typeof codeLanguages)[number];
export type CalloutTone = (typeof calloutTones)[number];
export type ImageProvider = (typeof imageProviders)[number];
export type ImageCredit = z.infer<typeof imageCreditSchema>;
export type LessonImage = z.infer<typeof lessonImageSchema>;
export type Check = z.infer<typeof checkSchema>;
export type Misconception = z.infer<typeof misconceptionSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type BloomLevel = (typeof bloomLevels)[number];
export type QuestionKind = (typeof questionKinds)[number];
export type AnswerKind = (typeof answerKinds)[number];
export type BlockIntent = (typeof blockIntents)[number];

/** Cross-references a schema cannot express: unique ids, a valid acyclic prerequisite graph, and plan references. */
export function courseProblems(course: Pick<CourseDoc, "modules">): string[] {
  const problems: string[] = [];
  const objectives = course.modules.flatMap((m) => m.objectives);
  const seen = (label: string, ids: string[]) => {
    const set = new Set<string>();
    for (const id of ids) {
      if (set.has(id)) problems.push(`Duplicate ${label} id "${id}".`);
      set.add(id);
    }
    return set;
  };
  seen("module", course.modules.map((m) => m.id));
  const ids = seen("objective", objectives.map((o) => o.id));
  seen("check", objectives.flatMap((o) => o.lesson.checks.map((c) => c.id)));
  seen("block", objectives.flatMap((o) => o.lesson.blocks.map((b) => b.id)));

  for (const o of objectives) {
    for (const p of o.prerequisites) {
      if (p === o.id) problems.push(`Objective "${o.id}" lists itself as a prerequisite.`);
      else if (!ids.has(p)) problems.push(`Objective "${o.id}" has unknown prerequisite "${p}".`);
    }
    const checks = new Set(o.lesson.checks.map((c) => c.id));
    const misconceptions = new Set(o.lesson.misconceptions.map((m) => m.id));
    for (const b of o.lesson.blocks) {
      if (isMarkdownBlock(b) && b.checkId && !checks.has(b.checkId)) problems.push(`Block "${b.id}" refers to check "${b.checkId}", which is not in objective "${o.id}".`);
      problems.push(...blockProblems(b));
    }
    for (const c of o.lesson.checks) {
      problems.push(...checkProblems(c, misconceptions));
    }
  }
  if (problems.length) return problems;

  const byId = new Map(objectives.map((o) => [o.id, o]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = byId.get(id)!.prerequisites.some(visit);
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const o of objectives) {
    if (visit(o.id)) {
      problems.push(`Prerequisites form a cycle through "${o.id}".`);
      break;
    }
  }
  return problems;
}

export function checkProblems(c: Check, misconceptions: Set<string>): string[] {
  const problems: string[] = [];
  if (c.kind === "choice") {
    if (!c.options || c.correctOption === undefined || c.correctOption >= c.options.length) {
      problems.push(`Check "${c.id}" is multiple choice and needs options and a valid correctOption.`);
    }
    if (c.optionMisconceptions && c.optionMisconceptions.length !== (c.options?.length ?? 0)) {
      problems.push(`Check "${c.id}": optionMisconceptions needs one entry per option.`);
    }
  } else if (c.options || c.correctOption !== undefined || c.optionMisconceptions) {
    problems.push(`Check "${c.id}" has options but is not multiple choice.`);
  }
  if (c.kind === "numeric" && c.numericAnswer === undefined) problems.push(`Check "${c.id}" is numeric and needs numericAnswer.`);
  for (const id of [...c.misconceptionIds, ...(c.optionMisconceptions ?? [])]) {
    if (id && !misconceptions.has(id)) problems.push(`Check "${c.id}" refers to unknown misconception "${id}".`);
  }
  return problems;
}

export function isMarkdownBlock(b: LessonBlock): b is MarkdownBlock {
  return b.type === undefined || b.type === "markdown";
}

/** What a schema cannot check inside one component: gap markers, duplicate items, table shape. */
export function blockProblems(b: LessonBlock, name = `Block "${b.id}"`): string[] {
  const problems: string[] = [];
  const dupes = (list: string[]) => list.some((x, i) => list.findIndex((y) => y.trim().toLowerCase() === x.trim().toLowerCase()) !== i);
  switch (b.type) {
    case "code":
      if (b.runnable && b.language !== "javascript") problems.push(`${name}: only JavaScript can be runnable.`);
      break;
    case "ordering":
      if (dupes(b.items)) problems.push(`${name}: ordering items must all differ, or the order is ambiguous.`);
      break;
    case "matching":
      if (dupes(b.pairs.map((p) => p.left))) problems.push(`${name}: left-hand items must all differ.`);
      if (dupes([...b.pairs.map((p) => p.right), ...b.distractors])) problems.push(`${name}: right-hand items and distractors must all differ.`);
      break;
    case "blanks": {
      const markers = [...b.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      const expected = b.blanks.map((_, i) => i + 1);
      if (markers.length !== expected.length || markers.some((n, i) => n !== expected[i])) {
        problems.push(`${name}: the text needs the markers ${expected.map((n) => `{{${n}}}`).join(", ")}, each once and in order, one per entry in blanks.`);
      }
      break;
    }
    case "table":
      b.rows.forEach((row, i) => {
        if (row.cells.length !== b.columns.length - 1) problems.push(`${name}: row ${i + 1} needs ${b.columns.length - 1} cells, one per column after the first.`);
      });
      break;
    case "image":
      if (new Set(b.images.map((i) => i.image)).size !== b.images.length) problems.push(`${name}: each picture may appear only once.`);
      for (const i of b.images) {
        if (!i.credit) problems.push(`${name}: picture ${i.image} has no credit. Use an id from a find_images result so the engine can fill it in.`);
      }
      break;
  }
  return problems;
}

/** What a plan still lacks before it can be taught well. Imports may be sparse; the planner's output may not. */
export function planGaps(o: Objective): string[] {
  const gaps: string[] = [];
  const plan = o.lesson;
  if (plan.keyIdeas.length === 0) gaps.push(`"${o.id}" has no key ideas.`);
  if (!plan.blocks.some((b) => b.intent === "explain" || b.intent === "example")) gaps.push(`"${o.id}" has no explain or example block.`);
  if (plan.checks.length < 2) gaps.push(`"${o.id}" needs at least two checks.`);
  if (!plan.checks.some((c) => c.kind !== "choice")) gaps.push(`"${o.id}" needs a check that is not multiple choice.`);
  return gaps;
}

// ---------------------------------------------------------------- sloodle.progress

export const goalBriefSchema = z.object({
  topic: z.string(),
  targetPerformance: z.string(),
  motivation: z.string(),
  useContext: z.string(),
  deadline: z.string().optional(),
  minutesPerSession: z.number(),
  sessionsPerWeek: z.number(),
  studyCue: z.string().optional(),
  priorKnowledge: z.string(),
  priorAttempts: z.string().optional(),
  formatPreferences: z.array(z.string()).default([]),
  constraints: z.string().optional(),
  diagnosticFindings: z.array(z.string()).default([]),
});

export const masteryStatuses = ["new", "learning", "practiced", "mastered"] as const;

export const evidenceSchema = z.object({
  at: z.string(),
  score: z.number(),
  hintsUsed: z.number(),
  kind: z.string(),
  confidence: z.number().optional(),
  note: z.string().optional(),
});

export const objectiveStateSchema = z.object({
  status: z.enum(masteryStatuses),
  evidence: z.array(evidenceSchema).default([]),
  firstSuccessDay: z.string().optional(),
});

export const sessionKinds = ["interview", "planning", "lesson"] as const;

export const sessionSummarySchema = z.object({
  at: z.string(),
  kind: z.enum(sessionKinds),
  summary: z.string(),
  nextStep: z.string(),
});

export const assignedProjectSchema = z.object({
  id: z.string(),
  moduleId: z.string().optional(),
  title: z.string(),
  brief: z.string(),
  deliverables: z.array(z.string()).default([]),
  assignedAt: z.string(),
  status: z.enum(["assigned", "submitted", "reviewed"]),
  feedback: z.string().optional(),
});

export const reviewItemSchema = z.object({
  id: z.string(),
  objectiveId: z.string().optional(),
  front: z.string(),
  back: z.string(),
  createdAt: z.string(),
  card: z.record(z.string(), z.unknown()),
});

export const PROGRESS_FORMAT = "sloodle.progress";

export const progressSchema = z.looseObject({
  format: z.literal(PROGRESS_FORMAT),
  version: z.literal(1),
  id: idSchema.describe("The course id; the course content is course.json in the same folder."),
  topic: z.string().describe("What the learner typed when they started."),
  createdAt: z.string(),
  phase: z.enum(["interview", "planning", "ready"]),
  origin: z
    .object({
      kind: z.enum(["generated", "imported", "migrated"]),
      importedTitle: z.string().optional(),
      importedId: z.string().optional(),
      at: z.string(),
    })
    .prefault({ kind: "generated", at: new Date(0).toISOString() }),
  brief: goalBriefSchema.optional(),
  objectiveStates: z.record(z.string(), objectiveStateSchema).default({}),
  summaries: z.array(sessionSummarySchema).default([]),
  projects: z.array(assignedProjectSchema).default([]),
  reviewCards: z.array(reviewItemSchema).default([]),
  /** Sidecar session id to Claude Code session id, for resuming after a restart. */
  sdkSessions: z.record(z.string(), z.string()).default({}),
  activeLesson: z.string().optional(),
});

export type Progress = z.infer<typeof progressSchema>;
export type GoalBrief = z.infer<typeof goalBriefSchema>;
export type MasteryStatus = (typeof masteryStatuses)[number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type ObjectiveState = z.infer<typeof objectiveStateSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type AssignedProject = z.infer<typeof assignedProjectSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type SessionKind = (typeof sessionKinds)[number];
export type CoursePhase = Progress["phase"];

// ---------------------------------------------------------------- activity events

const eventBase = { id: z.string(), at: z.string(), courseId: z.string(), source: z.enum(["live", "migration"]).default("live") };

export const activityEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("answer"),
    sessionId: z.string(),
    questionId: z.string(),
    objectiveId: z.string().optional(),
    checkId: z.string().optional().describe("Set when the question came from the course's lesson plan."),
    blockId: z.string().optional().describe("Set when the work was a component from the course's lesson plan."),
    kind: z.enum(answerKinds),
    component: z.enum(componentTypes).optional().describe("The lesson component the answer was given in; absent for questions."),
    score: z.number().min(0).max(1),
    hintsUsed: z.number().int().min(0),
    hintsAvailable: z.number().int().min(0).default(0),
    confidence: z.number().int().min(1).max(3).optional().describe("1 guessing, 2 fairly sure, 3 certain."),
    secondsToAnswer: z.number().min(0).optional(),
    presented: z.array(z.enum(blockIntents)).default([]).describe("Intents of material shown since the previous answer."),
    misconceptions: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  }),
  z.object({ ...eventBase, type: z.literal("hint"), sessionId: z.string(), questionId: z.string(), index: z.number().int() }),
  z.object({
    ...eventBase,
    type: z.literal("review"),
    itemId: z.string(),
    objectiveId: z.string().optional(),
    grade: z.enum(["again", "hard", "good", "easy"]),
  }),
  z.object({
    ...eventBase,
    type: z.literal("session_end"),
    sessionId: z.string(),
    kind: z.enum(sessionKinds),
    startedAt: z.string().optional(),
    minutes: z.number().min(0).optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal("course_revised"),
    proposalId: z.string(),
    summary: z.string().describe("What changed, in plain words."),
    backup: z.string().describe("Where the previous course.json was saved, relative to the data folder."),
    added: z.array(z.string()).default([]).describe("Objective ids added."),
    removed: z.array(z.string()).default([]).describe("Objective ids removed. Their progress is kept in progress.json."),
    changed: z.array(z.string()).default([]).describe("Objective ids edited, moved or re-planned."),
  }),
]);

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type AnswerEvent = Extract<ActivityEvent, { type: "answer" }>;

// ---------------------------------------------------------------- sloodle.learner

export const entrySources = ["user", "interview", "tutor", "reflection", "migration"] as const;

export const entrySchema = z.object({
  id: z.string(),
  text: text(MEDIUM),
  at: z.string(),
  source: z.enum(entrySources).describe("Who wrote it: the person, the interview, the tutor during a lesson, the end-of-session reflection, or migration."),
  courseId: z.string().optional().describe("Set when it only applies to one course."),
});

export const noteCategories = ["preference", "misconception", "strength", "struggle", "context", "motivation"] as const;

export const learnerNoteSchema = entrySchema.extend({ category: z.enum(noteCategories) });

export const statSchema = z.object({
  n: z.number(),
  accuracy: z.number().describe("Share of answers scoring 0.8 or more."),
  meanScore: z.number(),
  hintRate: z.number().describe("Share of answers given after taking a hint."),
  evidence: z.array(z.string()).describe("Ids of the most recent events behind this number."),
});

export const timesOfDay = ["morning", "afternoon", "evening", "night"] as const;
export const confidenceLevels = ["guessing", "fairlySure", "certain"] as const;

export const findingSchema = z.object({
  key: z.string().describe("Stable key; the person can dismiss a finding by key."),
  kind: z.enum(["strength", "struggle", "pattern"]),
  text: z.string(),
  evidence: z.array(z.string()),
});

export const observedSchema = z.object({
  derivedAt: z.string(),
  eventCount: z.number(),
  answers: z.object({
    all: statSchema.describe("Graded answers: everything except self-rated flashcards and worked-example predictions."),
    byKind: z.partialRecord(z.enum(answerKinds), statSchema),
  }),
  recent: statSchema.describe("The last 20 answers."),
  calibration: z.object({
    verdict: z.enum(["unknown", "calibrated", "overconfident", "underconfident"]),
    gap: z.number().nullable().describe("Mean stated confidence minus accuracy, over answers with a rating."),
    byConfidence: z.partialRecord(z.enum(confidenceLevels), statSchema),
    evidence: z.array(z.string()),
  }),
  pace: z.object({ medianSecondsToAnswer: z.partialRecord(z.enum(answerKinds), z.number()) }),
  sessions: z.object({
    n: z.number(),
    medianMinutes: z.number().nullable(),
    perWeek: z.number().describe("Lessons per week over the last four weeks."),
    lastAt: z.string().optional(),
    accuracyByTimeOfDay: z.partialRecord(z.enum(timesOfDay), statSchema),
    evidence: z.array(z.string()),
  }),
  presentation: z.partialRecord(z.enum(blockIntents), statSchema).describe("Answers that followed material of each intent."),
  baseline: statSchema.describe("Answers that followed no shown material."),
  misconceptions: z.array(
    z.object({ key: z.string(), id: z.string(), label: z.string(), courseId: z.string(), count: z.number(), lastAt: z.string(), evidence: z.array(z.string()) }),
  ),
  reviews: z.object({ n: z.number(), againRate: z.number(), evidence: z.array(z.string()) }),
  findings: z.array(findingSchema),
});

export const LEARNER_FORMAT = "sloodle.learner";

export const learnerSchema = z.looseObject({
  format: z.literal(LEARNER_FORMAT),
  version: z.literal(1),
  updatedAt: z.string(),
  stated: z
    .object({
      name: text(SHORT).optional(),
      about: text(MEDIUM).optional(),
      preferences: z.array(entrySchema).default([]),
      goals: z.array(entrySchema).default([]),
      interests: z.array(entrySchema).default([]),
    })
    .prefault({}),
  notes: z.array(learnerNoteSchema).default([]),
  observed: observedSchema.optional().describe("Derived by code from events.jsonl. Read only; dismiss findings instead of editing them."),
  dismissed: z.array(z.string()).default([]).describe("Keys of observed findings and misconceptions the person marked as wrong."),
});

export type LearnerDoc = z.infer<typeof learnerSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type LearnerNote = z.infer<typeof learnerNoteSchema>;
export type Stat = z.infer<typeof statSchema>;
export type Observed = z.infer<typeof observedSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type TimeOfDay = (typeof timesOfDay)[number];

// ---------------------------------------------------------------- sloodle.sloo

export const dialLevels = {
  explanationDepth: ["brief", "standard", "thorough"],
  pacing: ["slower", "steady", "brisk"],
  challenge: ["gentle", "balanced", "stretching"],
  hintGenerosity: ["sparing", "standard", "generous"],
} as const;

export type DialName = keyof typeof dialLevels;
export const dialNames = Object.keys(dialLevels) as DialName[];

const dialSchema = <T extends readonly [string, ...string[]]>(levels: T, initial: T[number]) =>
  z
    .object({
      value: z.enum(levels),
      setBy: z.enum(["default", "stats", "reflection", "user"]).default("default"),
      reason: z.string().default(""),
      at: z.string().optional(),
      evidence: z.array(z.string()).default([]),
      locked: z.boolean().default(false).describe("Set by the person: automatic updates leave it alone."),
    })
    .prefault({ value: initial });

export const tacticSchema = z.object({
  id: z.string(),
  text: text(MEDIUM),
  intent: z.enum(blockIntents).optional(),
  source: z.enum(["stats", "reflection", "user"]),
  worked: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
  note: text(MEDIUM).optional(),
  evidence: z.array(z.string()).default([]),
  updatedAt: z.string(),
});

export const changeSchema = z.object({
  at: z.string(),
  source: z.enum(["stats", "reflection", "user", "migration"]),
  change: z.string(),
  reason: z.string(),
  evidence: z.array(z.string()).default([]),
});

export const SLOO_FORMAT = "sloodle.sloo";

export const slooSchema = z.looseObject({
  format: z.literal(SLOO_FORMAT),
  version: z.literal(1),
  updatedAt: z.string(),
  persona: z
    .object({
      name: text(60).default("Sloo"),
      voice: text(MEDIUM).default("A small, friendly sprout and a personal tutor. Talks the way a good tutor talks: short turns, one idea at a time."),
      tone: text(MEDIUM).default("Warm, plain and direct. Lightly playful, never childish. No unearned praise."),
    })
    .prefault({}),
  memory: z
    .object({
      toldMe: z.array(entrySchema).default([]).describe("Things the learner told Sloo about themselves."),
      workingToward: z.array(entrySchema).default([]).describe("What the learner is working toward, beyond a single course."),
      episodes: z.array(entrySchema).default([]).describe("Moments worth recalling: a breakthrough, a joke, a hard day."),
    })
    .prefault({}),
  approach: z
    .object({
      explanationDepth: dialSchema(dialLevels.explanationDepth, "standard"),
      pacing: dialSchema(dialLevels.pacing, "steady"),
      challenge: dialSchema(dialLevels.challenge, "balanced"),
      hintGenerosity: dialSchema(dialLevels.hintGenerosity, "standard"),
      tactics: z.array(tacticSchema).default([]),
    })
    .prefault({}),
  log: z.array(changeSchema).default([]).describe("Every automatic change, newest last, bounded."),
});

export type SlooDoc = z.infer<typeof slooSchema>;
export type Dial = SlooDoc["approach"]["explanationDepth"];
export type Tactic = z.infer<typeof tacticSchema>;
export type SlooChange = z.infer<typeof changeSchema>;

export function emptyLearner(now = new Date()): LearnerDoc {
  return learnerSchema.parse({ format: LEARNER_FORMAT, version: 1, updatedAt: now.toISOString() });
}

export function defaultSloo(now = new Date()): SlooDoc {
  return slooSchema.parse({ format: SLOO_FORMAT, version: 1, updatedAt: now.toISOString() });
}

export const schemas = {
  "sloodle.course.v1": courseBaseSchema,
  "sloodle.progress.v1": progressSchema,
  "sloodle.learner.v1": learnerSchema,
  "sloodle.sloo.v1": slooSchema,
  "sloodle.event.v1": activityEventSchema,
};
