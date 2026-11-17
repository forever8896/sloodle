import { expect, test } from "bun:test";
import { applyEvidence, dueItems, frontier, newReviewItem, reviewItem } from "./learner";
import type { CourseDoc, Evidence, ObjectiveState, ReviewItem } from "./formats";

function evidence(at: string, score: number, hintsUsed = 0): Evidence {
  return { at, score, hintsUsed, kind: "short" };
}

test("one good day is practiced, a second day is mastered", () => {
  let state = applyEvidence(undefined, evidence("2026-11-16T10:00:00", 1));
  expect(state.status).toBe("practiced");
  state = applyEvidence(state, evidence("2026-11-16T10:05:00", 1));
  expect(state.status).toBe("practiced");
  state = applyEvidence(state, evidence("2026-11-18T09:00:00", 1));
  expect(state.status).toBe("mastered");
});

test("success with hints does not count, and a failure resets the first success", () => {
  let state = applyEvidence(undefined, evidence("2026-11-16T10:00:00", 1, 1));
  expect(state.status).toBe("learning");
  state = applyEvidence(state, evidence("2026-11-16T10:05:00", 1));
  expect(state.status).toBe("practiced");
  state = applyEvidence(state, evidence("2026-11-17T10:00:00", 0));
  expect(state.status).toBe("learning");
  state = applyEvidence(state, evidence("2026-11-18T10:00:00", 1));
  expect(state.status).toBe("practiced");
});

test("a right multiple-choice pick never counts as proof on its own", () => {
  const pick = (at: string): Evidence => ({ at, score: 1, hintsUsed: 0, kind: "choice" });
  let state = applyEvidence(undefined, pick("2026-11-16T10:00:00"));
  expect(state.status).toBe("learning");
  state = applyEvidence(state, pick("2026-11-18T10:00:00"));
  expect(state.status).toBe("learning");
  state = applyEvidence(state, evidence("2026-11-18T10:05:00", 1));
  expect(state.status).toBe("practiced");
  state = applyEvidence(state, pick("2026-11-19T10:00:00"));
  expect(state.status).toBe("practiced");
});

test("frontier holds back objectives whose prerequisites have no unaided success", () => {
  const content = {
    modules: [
      {
        objectives: [
          { id: "a", statement: "A", level: "remember", prerequisites: [] },
          { id: "b", statement: "B", level: "apply", prerequisites: ["a"] },
        ],
      },
    ],
  } as unknown as Pick<CourseDoc, "modules">;
  const states: Record<string, ObjectiveState> = {};
  expect(frontier(content, states).map((o) => o.id)).toEqual(["a"]);
  states.a = applyEvidence(undefined, evidence("2026-11-16T10:00:00", 1));
  expect(frontier(content, states).map((o) => o.id)).toEqual(["a", "b"]);
});

test("review items survive a JSON round trip and move further out when recalled", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  let item = newReviewItem("i1", "front", "back", undefined, now);
  expect(dueItems([item], now)).toHaveLength(1);

  item = JSON.parse(JSON.stringify(reviewItem(item, "good", 0.9, now))) as ReviewItem;
  const firstDue = new Date(item.card.due as string).getTime();
  expect(firstDue).toBeGreaterThan(now.getTime());
  expect(dueItems([item], now)).toHaveLength(0);

  const later = new Date(firstDue + 60_000);
  item = JSON.parse(JSON.stringify(reviewItem(item, "good", 0.9, later))) as ReviewItem;
  const secondGap = new Date(item.card.due as string).getTime() - later.getTime();
  expect(secondGap).toBeGreaterThan(firstDue - now.getTime());
});
