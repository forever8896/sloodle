import { expect, test } from "bun:test";
import type { ActivityEvent } from "./formats";
import { deriveObserved } from "./observe";
import { answer, many } from "./testdata";

const now = new Date("2026-11-16T12:00:00");

test("the same events always give the same profile", () => {
  const events = many(10, (i) => answer({ score: i % 2 ? 1 : 0.2, kind: i % 3 ? "short" : "explain" }));
  expect(deriveObserved(events, now)).toEqual(deriveObserved([...events].reverse(), now));
});

test("accuracy and hint use by question kind, with the events behind them", () => {
  const events = [
    ...many(6, () => answer({ kind: "explain", score: 1 })),
    ...many(5, () => answer({ kind: "numeric", score: 0, hintsUsed: 1 })),
  ];
  const o = deriveObserved(events, now);
  expect(o.answers.byKind.explain).toMatchObject({ n: 6, accuracy: 1, hintRate: 0 });
  expect(o.answers.byKind.numeric).toMatchObject({ n: 5, accuracy: 0, hintRate: 1 });
  expect(o.answers.byKind.numeric!.evidence).toHaveLength(5);
  expect(o.findings.map((f) => f.key)).toEqual(expect.arrayContaining(["kind:explain:strong", "kind:numeric:weak"]));
});

test("calibration: certain and wrong is overconfident; unsure and right is underconfident", () => {
  const over = deriveObserved(many(6, () => answer({ confidence: 3, score: 0 })), now);
  expect(over.calibration.verdict).toBe("overconfident");
  expect(over.calibration.evidence.length).toBeGreaterThan(0);
  const under = deriveObserved(many(6, () => answer({ confidence: 1, score: 1 })), now);
  expect(under.calibration.verdict).toBe("underconfident");
  const few = deriveObserved(many(3, () => answer({ confidence: 3, score: 0 })), now);
  expect(few.calibration.verdict).toBe("unknown");
});

test("which presentation forms were followed by success", () => {
  const events = [
    ...many(5, () => answer({ presented: ["example"], score: 1 })),
    ...many(5, () => answer({ presented: [], score: 0 })),
  ];
  const o = deriveObserved(events, now);
  expect(o.presentation.example).toMatchObject({ n: 5, accuracy: 1 });
  expect(o.baseline).toMatchObject({ n: 5, accuracy: 0 });
  expect(o.findings.some((f) => f.key === "presentation:example:works")).toBe(true);
});

test("misconceptions are counted per course and recurring ones become findings", () => {
  const m = { id: "x1", label: "Bigger bottom means bigger" };
  const events = [answer({ misconceptions: [m], score: 0 }), answer({ misconceptions: [m], score: 0 }), answer({ courseId: "c2", misconceptions: [m], score: 0 })];
  const o = deriveObserved(events, now);
  expect(o.misconceptions.find((x) => x.courseId === "c1")?.count).toBe(2);
  expect(o.misconceptions.find((x) => x.courseId === "c2")?.count).toBe(1);
  expect(o.findings.filter((f) => f.key.startsWith("misconception:"))).toHaveLength(1);
});

test("sessions, pace, time of day and reviews", () => {
  const sessions: ActivityEvent[] = [5, 12, 20].map((minutes, i) => ({ id: `s${i}`, at: `2026-11-1${i}T19:00:00`, courseId: "c1", source: "live", type: "session_end", sessionId: `l${i}`, kind: "lesson", minutes }));
  const reviews: ActivityEvent[] = ["again", "good"].map((grade, i) => ({ id: `r${i}`, at: "2026-11-12T08:00:00", courseId: "c1", source: "live", type: "review", itemId: "i", grade: grade as "again" }));
  const answers = many(3, (i) => answer({ secondsToAnswer: [10, 20, 60][i], at: "2026-11-12T08:30:00" }));
  const o = deriveObserved([...sessions, ...reviews, ...answers], now);
  expect(o.sessions).toMatchObject({ n: 3, medianMinutes: 12 });
  expect(o.sessions.perWeek).toBe(0.8);
  expect(o.pace.medianSecondsToAnswer.short).toBe(20);
  expect(o.sessions.accuracyByTimeOfDay.morning?.n).toBe(3);
  expect(o.reviews).toMatchObject({ n: 2, againRate: 0.5, evidence: ["r0"] });
});
