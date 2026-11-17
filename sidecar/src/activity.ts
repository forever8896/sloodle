// The one path by which activity changes the learner and Sloo: append an event, re-derive the observed profile from
// the whole log, then let the deterministic rules adjust Sloo. Nothing here depends on the model.

import { deriveObserved } from "./observe";
import { store } from "./store";
import { applyStats } from "./teacher";
import type { ActivityEvent } from "./formats";

type NewEvent = ActivityEvent extends infer E ? (E extends ActivityEvent ? Omit<E, "id" | "at" | "source"> & { at?: string } : never) : never;

export function recordActivity(input: NewEvent, now = new Date()): ActivityEvent {
  const event = { id: `e-${crypto.randomUUID().slice(0, 12)}`, at: now.toISOString(), source: "live", ...input } as ActivityEvent;
  store.appendEvent(event);
  refreshProfile(now);
  return event;
}

/** Recomputes the observed profile and applies the stats rules to Sloo. Safe to call at any time. */
export function refreshProfile(now = new Date()): void {
  const observed = deriveObserved(store.events(), now);
  const learner = store.learner();
  learner.observed = observed;
  learner.updatedAt = now.toISOString();
  store.saveLearner(learner);

  const sloo = store.sloo();
  if (applyStats(sloo, observed, now.toISOString()).length) store.saveSloo(sloo);
}
