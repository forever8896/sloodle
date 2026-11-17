import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { AnswerKind, CourseDoc, Evidence, MasteryStatus, Objective, ObjectiveState, ReviewItem } from "./formats";
import type { ReviewGrade } from "./types";

const SUCCESS = 0.8;

export function dayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The kinds of work that can prove unaided success: the learner produced the answer. Everything else is weak evidence
 * and never counts as proof on its own: a multiple-choice pick or a matching may be a guess or mere recognition, an
 * ordering arranges what is already on screen, a flashcard rating is the learner's own say-so, and a prediction is
 * made inside a worked example. A kind not listed here (including any added later) is weak until it is added.
 */
export const strongEvidenceKinds: ReadonlySet<string> = new Set<AnswerKind>(["short", "explain", "numeric", "blanks"]);

/** Predictions are learning moves made before the step is taught: they never undo earlier success either. */
const neverDemotes: ReadonlySet<string> = new Set<AnswerKind>(["prediction"]);

function isCleanSuccess(e: Evidence): boolean {
  return e.score >= SUCCESS && e.hintsUsed === 0 && strongEvidenceKinds.has(e.kind);
}

/**
 * Mastery needs unaided success on two different days: same-session success
 * overstates learning, so one good day only counts as "practiced".
 */
export function applyEvidence(state: ObjectiveState | undefined, evidence: Evidence): ObjectiveState {
  const next: ObjectiveState = {
    status: state?.status ?? "new",
    evidence: [...(state?.evidence ?? []), evidence].slice(-30),
    firstSuccessDay: state?.firstSuccessDay,
  };
  const today = dayOf(evidence.at);

  if (!isCleanSuccess(evidence)) {
    if (evidence.score < 0.5 && !neverDemotes.has(evidence.kind)) {
      next.firstSuccessDay = undefined;
      next.status = "learning";
    } else if (next.status === "new") {
      next.status = "learning";
    }
    return next;
  }

  if (!next.firstSuccessDay) {
    next.firstSuccessDay = today;
    next.status = "practiced";
  } else if (next.firstSuccessDay !== today) {
    next.status = "mastered";
  } else {
    next.status = "practiced";
  }
  return next;
}

type States = Record<string, ObjectiveState>;

export function allObjectives(content: Pick<CourseDoc, "modules"> | undefined): Objective[] {
  return content?.modules.flatMap((m) => m.objectives) ?? [];
}

export function statusOf(states: States, objectiveId: string): MasteryStatus {
  return states[objectiveId]?.status ?? "new";
}

/** An objective is open once every prerequisite has at least one unaided success. */
export function isUnlocked(states: States, objective: Objective): boolean {
  return objective.prerequisites.every((id) => {
    const status = statusOf(states, id);
    return status === "practiced" || status === "mastered";
  });
}

export function frontier(content: Pick<CourseDoc, "modules"> | undefined, states: States): Objective[] {
  return allObjectives(content).filter((o) => statusOf(states, o.id) !== "mastered" && isUnlocked(states, o));
}

export function masteryCounts(content: Pick<CourseDoc, "modules"> | undefined, states: States): { mastered: number; total: number } {
  const objectives = allObjectives(content);
  return {
    total: objectives.length,
    mastered: objectives.filter((o) => statusOf(states, o.id) === "mastered").length,
  };
}

const grades: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function newReviewItem(id: string, front: string, back: string, objectiveId: string | undefined, now: Date): ReviewItem {
  return {
    id,
    objectiveId,
    front,
    back,
    createdAt: now.toISOString(),
    card: createEmptyCard(now) as unknown as Record<string, unknown>,
  };
}

export function reviewItem(item: ReviewItem, grade: ReviewGrade, desiredRetention: number, now: Date): ReviewItem {
  const scheduler = fsrs(generatorParameters({ request_retention: desiredRetention, enable_fuzz: true }));
  const { card } = scheduler.next(item.card as unknown as Card, now, grades[grade]);
  return { ...item, card: card as unknown as Record<string, unknown> };
}

export function isDue(item: ReviewItem, now: Date): boolean {
  return new Date(item.card.due as string).getTime() <= now.getTime();
}

export function dueItems(items: ReviewItem[], now: Date): ReviewItem[] {
  return items
    .filter((item) => isDue(item, now))
    .sort((a, b) => new Date(a.card.due as string).getTime() - new Date(b.card.due as string).getTime());
}
