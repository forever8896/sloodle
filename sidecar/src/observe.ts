// Derives the learner's observed profile from the activity log. Pure and deterministic: the same events always give
// the same profile, and every number names the events behind it.

import {
  answerKinds,
  blockIntents,
  timesOfDay,
  type ActivityEvent,
  type AnswerEvent,
  type AnswerKind,
  type BlockIntent,
  type Finding,
  type Observed,
  type Stat,
  type TimeOfDay,
} from "./formats";

export const SUCCESS = 0.8;
/** Below this many data points a number is shown but not acted on. */
export const MIN_SAMPLE = 5;
const RECENT = 20;
const EVIDENCE = 5;

export function stat(answers: AnswerEvent[]): Stat {
  const n = answers.length;
  if (n === 0) return { n: 0, accuracy: 0, meanScore: 0, hintRate: 0, evidence: [] };
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    n,
    accuracy: round(answers.filter((a) => a.score >= SUCCESS).length / n),
    meanScore: round(answers.reduce((sum, a) => sum + a.score, 0) / n),
    hintRate: round(answers.filter((a) => a.hintsUsed > 0).length / n),
    evidence: answers.slice(-EVIDENCE).map((a) => a.id),
  };
}

export function timeOfDay(iso: string): TimeOfDay {
  const hour = new Date(iso).getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

const confidenceValue = { 1: 0.33, 2: 0.67, 3: 0.95 } as const;
const confidenceName = { 1: "guessing", 2: "fairlySure", 3: "certain" } as const;

const kindLabel: Record<AnswerKind, string> = {
  choice: "multiple-choice",
  short: "short-answer",
  explain: "explain-in-your-own-words",
  numeric: "numeric",
  ordering: "ordering",
  matching: "matching",
  blanks: "fill-in-the-blank",
  prediction: "worked-example prediction",
  flashcard: "flashcard",
};

/**
 * Self-rated flashcards are what the learner says, and predictions are made before the step is taught, so neither is a
 * graded answer: they get their own per-kind numbers but stay out of accuracy, calibration, timing and presentation.
 */
const ungraded: ReadonlySet<AnswerKind> = new Set(["flashcard", "prediction"]);

export function deriveObserved(events: ActivityEvent[], now: Date): Observed {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const allAnswers = sorted.filter((e): e is AnswerEvent => e.type === "answer");
  const answers = allAnswers.filter((a) => !ungraded.has(a.kind));
  const reviews = sorted.filter((e) => e.type === "review");
  const lessons = sorted.filter((e) => e.type === "session_end" && e.kind === "lesson");

  const byKind: Observed["answers"]["byKind"] = {};
  const pace: Observed["pace"]["medianSecondsToAnswer"] = {};
  for (const kind of answerKinds) {
    const of = allAnswers.filter((a) => a.kind === kind);
    if (of.length) byKind[kind] = stat(of);
    const seconds = of.flatMap((a) => (a.secondsToAnswer === undefined ? [] : [a.secondsToAnswer]));
    const m = seconds.length >= 3 ? median(seconds) : null;
    if (m !== null) pace[kind] = m;
  }

  // Calibration: stated confidence against the result, over answers that carry a rating.
  const rated = answers.filter((a) => a.confidence !== undefined);
  const byConfidence: Observed["calibration"]["byConfidence"] = {};
  for (const level of [1, 2, 3] as const) {
    const of = rated.filter((a) => a.confidence === level);
    if (of.length) byConfidence[confidenceName[level]] = stat(of);
  }
  let gap: number | null = null;
  let verdict: Observed["calibration"]["verdict"] = "unknown";
  if (rated.length >= MIN_SAMPLE) {
    const meanConfidence = rated.reduce((sum, a) => sum + confidenceValue[a.confidence as 1 | 2 | 3], 0) / rated.length;
    gap = Math.round((meanConfidence - stat(rated).accuracy) * 100) / 100;
    verdict = gap > 0.2 ? "overconfident" : gap < -0.2 ? "underconfident" : "calibrated";
  }
  const calibrationEvidence = rated
    .filter((a) => (a.confidence === 3 && a.score < 0.5) || (a.confidence === 1 && a.score >= SUCCESS))
    .slice(-EVIDENCE)
    .map((a) => a.id);

  // Sessions.
  const minutes = lessons.flatMap((s) => (s.type === "session_end" && s.minutes !== undefined ? [s.minutes] : []));
  const fourWeeksAgo = now.getTime() - 28 * 86_400_000;
  const accuracyByTimeOfDay: Observed["sessions"]["accuracyByTimeOfDay"] = {};
  for (const bucket of timesOfDay) {
    const of = answers.filter((a) => timeOfDay(a.at) === bucket);
    if (of.length) accuracyByTimeOfDay[bucket] = stat(of);
  }

  // Presentation: which forms of material were followed by success.
  const presentation: Observed["presentation"] = {};
  for (const intent of blockIntents) {
    const of = answers.filter((a) => a.presented.includes(intent));
    if (of.length) presentation[intent] = stat(of);
  }
  const baseline = stat(answers.filter((a) => a.presented.length === 0));

  // Misconceptions revealed by answers, keyed per course.
  const misconceptions = new Map<string, Observed["misconceptions"][number]>();
  for (const a of answers) {
    for (const m of a.misconceptions) {
      const key = `misconception:${a.courseId}:${m.id}`;
      const entry = misconceptions.get(key) ?? { key, id: m.id, label: m.label, courseId: a.courseId, count: 0, lastAt: a.at, evidence: [] };
      entry.count += 1;
      entry.lastAt = a.at;
      entry.label = m.label;
      entry.evidence = [...entry.evidence, a.id].slice(-EVIDENCE);
      misconceptions.set(key, entry);
    }
  }

  const reviewAgain = reviews.filter((r) => r.type === "review" && r.grade === "again");

  const observed: Observed = {
    derivedAt: now.toISOString(),
    eventCount: events.length,
    answers: { all: stat(answers), byKind },
    recent: stat(answers.slice(-RECENT)),
    calibration: { verdict, gap, byConfidence, evidence: calibrationEvidence },
    pace: { medianSecondsToAnswer: pace },
    sessions: {
      n: lessons.length,
      medianMinutes: median(minutes),
      perWeek: Math.round((lessons.filter((s) => new Date(s.at).getTime() >= fourWeeksAgo).length / 4) * 10) / 10,
      lastAt: lessons.at(-1)?.at,
      accuracyByTimeOfDay,
      evidence: lessons.slice(-EVIDENCE).map((s) => s.id),
    },
    presentation,
    baseline,
    misconceptions: [...misconceptions.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)),
    reviews: {
      n: reviews.length,
      againRate: reviews.length ? Math.round((reviewAgain.length / reviews.length) * 100) / 100 : 0,
      evidence: reviewAgain.slice(-EVIDENCE).map((r) => r.id),
    },
    findings: [],
  };
  observed.findings = findings(observed);
  return observed;
}

/** Plain-language statements the prompts can use. Each has a stable key and the events behind it. */
function findings(o: Observed): Finding[] {
  const out: Finding[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  for (const kind of answerKinds) {
    const s = o.answers.byKind[kind];
    if (!s || s.n < MIN_SAMPLE || ungraded.has(kind)) continue;
    if (s.accuracy >= SUCCESS && s.hintRate < 0.2) {
      out.push({ key: `kind:${kind}:strong`, kind: "strength", text: `Answers ${kindLabel[kind]} questions well without hints (${pct(s.accuracy)} of ${s.n}).`, evidence: s.evidence });
    } else if (s.accuracy < 0.5) {
      out.push({ key: `kind:${kind}:weak`, kind: "struggle", text: `Finds ${kindLabel[kind]} questions hard (${pct(s.accuracy)} right of ${s.n}).`, evidence: s.evidence });
    }
  }

  const c = o.calibration;
  if (c.verdict === "overconfident") {
    out.push({ key: "calibration:over", kind: "pattern", text: `Often more sure than right: stated confidence runs ${pct(c.gap ?? 0)} above accuracy. Ask for reasons before accepting a confident answer.`, evidence: c.evidence });
  } else if (c.verdict === "underconfident") {
    out.push({ key: "calibration:under", kind: "pattern", text: `Usually right when unsure: accuracy runs ${pct(-(c.gap ?? 0))} above stated confidence. Point out when they knew more than they thought.`, evidence: c.evidence });
  }

  const best = (Object.entries(o.presentation) as [BlockIntent, Stat][])
    .filter(([, s]) => s.n >= MIN_SAMPLE && s.accuracy - (o.baseline.n >= MIN_SAMPLE ? o.baseline.accuracy : o.answers.all.accuracy) >= 0.15)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);
  for (const [intent, s] of best.slice(0, 3)) {
    out.push({ key: `presentation:${intent}:works`, kind: "pattern", text: `Does better after ${intent} material (${pct(s.accuracy)} right over ${s.n} answers).`, evidence: s.evidence });
  }

  const times = (Object.entries(o.sessions.accuracyByTimeOfDay) as [TimeOfDay, Stat][]).filter(([, s]) => s.n >= MIN_SAMPLE * 2);
  if (times.length >= 2) {
    const [topTime, top] = times.sort((a, b) => b[1].accuracy - a[1].accuracy)[0]!;
    const [lowTime, low] = times.at(-1)!;
    if (top.accuracy - low.accuracy >= 0.2) {
      out.push({ key: `time:${topTime}:best`, kind: "pattern", text: `Answers better in the ${topTime} (${pct(top.accuracy)}) than in the ${lowTime} (${pct(low.accuracy)}).`, evidence: [...top.evidence, ...low.evidence] });
    }
  }

  for (const m of o.misconceptions.filter((x) => x.count >= 2).slice(0, 5)) {
    out.push({ key: m.key, kind: "struggle", text: `Recurring misconception (${m.count} times): ${m.label}`, evidence: m.evidence });
  }

  if (o.reviews.n >= MIN_SAMPLE * 2 && o.reviews.againRate >= 0.4) {
    out.push({ key: "reviews:forgetting", kind: "struggle", text: `Forgets a lot between reviews (${pct(o.reviews.againRate)} marked again).`, evidence: o.reviews.evidence });
  }
  return out;
}
