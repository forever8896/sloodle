// Types of the global chat shared with the interface (re-exported from types.ts).

import type { MasteryStatus } from "./formats";
import type { SessionEvent } from "./types";

export interface OutlineLesson {
  id: string;
  statement: string;
  status: MasteryStatus;
  mark?: "added" | "removed" | "changed";
}

export interface OutlineModule {
  id: string;
  title: string;
  mark?: "added" | "removed" | "changed";
  lessons: OutlineLesson[];
}

/** A proposed curriculum change as the learner sees it: computed by the engine, never written by the model. */
export interface ProposalView {
  id: string;
  courseId: string;
  courseTitle: string;
  /** Sloo's reason, in its words. */
  reason: string;
  /** What changes, one line per effect, written by the engine. */
  lines: string[];
  /** What the learner must not miss, such as a completed lesson being removed. */
  warnings: string[];
  before: OutlineModule[];
  after: OutlineModule[];
  /** How many lessons get a new lesson plan once accepted. */
  plans: number;
  status: "pending" | "accepted" | "rejected" | "stale" | "failed" | "superseded";
}

/** A button Sloo offers in the chat. */
export type ChatOffer = { id: string; label: string } & (
  | { kind: "open_course"; courseId: string }
  | { kind: "start_lesson"; courseId: string }
  | { kind: "review"; courseId: string }
  | { kind: "new_course"; topic: string }
);

export interface ChatInfo {
  sessionId: string;
  busy: boolean;
  ended: boolean;
  startedAt: string;
  history: SessionEvent[];
}
