// Shared between the sidecar and the frontend (the frontend imports types only).
// The data documents (course, progress, learner, sloo, events) are defined once in formats.ts.

import type { ChatOffer, ProposalView } from "./chattypes";

import type { AssignedProject, BlockIntent, BlockOf, CourseDoc, CoursePhase, ImageCredit, Progress, QuestionKind, SessionKind } from "./formats";

export type {
  ActivityEvent,
  AssignedProject,
  BlockIntent,
  BloomLevel,
  CalloutTone,
  Check,
  CodeLanguage,
  ComponentType,
  DiagramKind,
  CourseDoc,
  CoursePhase,
  Dial,
  DialName,
  Entry,
  Evidence,
  Finding,
  GoalBrief,
  ImageCredit,
  ImageProvider,
  LearnerDoc,
  LearnerNote,
  LessonBlock,
  LessonImage,
  LessonPlan,
  MasteryStatus,
  Misconception,
  Module,
  Objective,
  ObjectiveState,
  Observed,
  Progress,
  Project,
  QuestionKind,
  ReviewItem,
  SessionKind,
  SessionSummary,
  SlooChange,
  SlooDoc,
  Source,
  Stat,
  Tactic,
} from "./formats";

export type AuthMode = "subscription" | "apiKey";

export interface Settings {
  authMode: AuthMode;
  apiKey?: string;
  models: { tutor: string; planner: string; grader: string };
  desiredRetention: number;
  voice: { speakReplies: boolean; voice: string; speed: number };
  /** When the learner finished or skipped the first-run welcome; absent until then. */
  onboardedAt?: string;
}

export type PublicSettings = Omit<Settings, "apiKey"> & { hasApiKey: boolean };

export interface AudioSegment {
  heading: string;
  text: string;
  recallQuestion: string;
  recallAnswer: string;
}

export interface AudioLesson {
  id: string;
  moduleId: string;
  title: string;
  createdAt: string;
  status: "writing" | "recording" | "ready" | "failed";
  segments: AudioSegment[];
  /** How many segments have audio so far; they can be played while the rest record. */
  recorded: number;
  error?: string;
}

export interface CourseDetail {
  /** This person's enrollment: phase, goal brief, mastery, summaries, projects. */
  course: Progress;
  /** The shareable course content and lesson plans; absent until the course is planned. */
  content?: CourseDoc;
  itemCount: number;
  due: number;
  /** Objective ids the learner can work on now, in curriculum order. */
  nextUp: string[];
}

export interface CourseListing {
  id: string;
  topic: string;
  title?: string;
  phase: CoursePhase;
  createdAt: string;
  mastered: number;
  total: number;
  due: number;
}

export interface CourseExport {
  fileName: string;
  json: string;
  /** Where the engine also wrote the file, when it could. */
  savedTo?: string;
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** What the learner sees. The answer key never leaves the sidecar until graded. */
export interface Question {
  id: string;
  objectiveId?: string;
  kind: QuestionKind;
  prompt: string;
  options?: string[];
  hintCount: number;
}

/** A lesson component as the learner sees it: everything that would give an answer away is left out or shuffled. */
export type ShownComponent = {
  /** This showing's id, used for the learner's actions. Never derived from the course's ids. */
  id: string;
  blockId?: string;
  objectiveId?: string;
  intent?: BlockIntent;
  title?: string;
  hintCount?: number;
} & (
  | { type: "markdown"; body: string }
  | Omit<BlockOf<"diagram">, "id" | "intent" | "title">
  | Omit<BlockOf<"code">, "id" | "intent" | "title">
  | Omit<BlockOf<"table">, "id" | "intent" | "title">
  | Omit<BlockOf<"callout">, "id" | "intent" | "title">
  | { type: "ordering"; prompt: string; items: ShownItem[] }
  | { type: "matching"; prompt: string; left: ShownItem[]; right: ShownItem[] }
  | { type: "blanks"; prompt?: string; mode: "prose" | "code"; parts: BlankPart[] }
  | { type: "steps"; prompt: string; steps: { predict?: string }[] }
  | { type: "flashcard"; front: string }
  | { type: "image"; images: ShownImage[]; caption?: string }
);

/** A lesson picture as the window gets it: `src` is a path on the engine's local server, never an internet address. */
export interface ShownImage {
  src: string;
  alt: string;
  caption?: string;
  credit?: ImageCredit;
}

export interface ShownItem {
  /** A random id for this showing; it says nothing about the right position or partner. */
  id: string;
  text: string;
}

/** Fill-in-the-blank text, split at the gaps. `blank` counts from 0. */
export type BlankPart = { text: string } | { blank: number };

export type Verdict = "correct" | "partial" | "incorrect";

/** The graded result of an ordering, matching or fill-in-the-blank, with the answer it was graded against. */
export type ComponentResult = { verdict: Verdict; score: number } & (
  | { type: "ordering"; submitted: string[]; correct: string[]; explanation?: string }
  | { type: "matching"; submitted: Record<string, string>; correct: Record<string, string> }
  | { type: "blanks"; submitted: string[]; right: boolean[]; expected: string[] }
);

/** What changes on a component once it is on screen. */
export type ComponentUpdate =
  | { kind: "hint"; index: number; text: string }
  | { kind: "graded"; result: ComponentResult }
  | { kind: "step"; index: number; text: string; prediction?: { answer: string; verdict: Verdict; score: number } }
  | { kind: "flipped"; back: string }
  | { kind: "rated"; rating: ReviewGrade }
  | { kind: "reported"; problem: string };

/** What the learner does with a component; sent as `session.component`. */
export type ComponentAction =
  | { do: "order"; order: string[] }
  | { do: "match"; pairs: Record<string, string> }
  | { do: "fill"; answers: string[] }
  | { do: "hint" }
  | { do: "reveal"; prediction?: string }
  | { do: "flip" }
  | { do: "rate"; rating: ReviewGrade }
  | { do: "report"; problem: string };

export interface GradeResult {
  questionId: string;
  verdict: "correct" | "partial" | "incorrect";
  score: number;
  learnerAnswer: string;
}

export type SessionEvent =
  | { t: "user"; text: string }
  | { t: "delta"; text: string }
  | { t: "message"; text: string }
  | { t: "activity"; label: string; detail?: string }
  | { t: "content"; id: string; title: string; markdown: string; intent?: BlockIntent }
  | { t: "question"; question: Question }
  | { t: "component"; component: ShownComponent }
  | { t: "component_update"; id: string; update: ComponentUpdate }
  | { t: "hint"; questionId: string; index: number; text: string }
  | { t: "graded"; result: GradeResult }
  | { t: "project"; project: AssignedProject }
  | { t: "course" }
  | { t: "turn_end" }
  | { t: "ended"; summary?: string; nextStep?: string }
  | { t: "error"; message: string }
  // The global chat only:
  | { t: "proposal"; proposal: ProposalView }
  | { t: "proposal_update"; id: string; status: ProposalView["status"]; note?: string }
  | { t: "offer"; offer: ChatOffer };

export type * from "./chattypes";

export interface SessionInfo {
  sessionId: string;
  courseId: string;
  kind: SessionKind;
  busy: boolean;
  ended: boolean;
  history: SessionEvent[];
}

export interface AuthStatus {
  mode: AuthMode;
  ok: boolean;
  detail: string;
  claudePath?: string;
}

export type ServerPush =
  | { push: "session"; sessionId: string; event: SessionEvent }
  | { push: "courses" }
  | { push: "profile" };

export interface RpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: number;
  result?: unknown;
  error?: string;
}
