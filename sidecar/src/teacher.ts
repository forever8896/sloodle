// How Sloo's teaching approach and memory change. Two paths, both applied by code, bounded and logged:
// - applyStats: deterministic rules over the learner's observed profile.
// - applyReflection: structured, schema-checked suggestions from a cheap model call at the end of a session.

import { z } from "zod";
import { MIN_SAMPLE } from "./observe";
import {
  blockIntents,
  dialLevels,
  dialNames,
  noteCategories,
  type BlockIntent,
  type DialName,
  type Entry,
  type LearnerDoc,
  type Observed,
  type SlooChange,
  type SlooDoc,
  type Stat,
} from "./formats";

const LOG_LIMIT = 200;
export const MEMORY_LIMITS = { toldMe: 60, workingToward: 20, episodes: 40, notes: 150 } as const;
const STATS_MIN_ANSWERS = 8;

const newId = (): string => crypto.randomUUID().slice(0, 8);

function log(sloo: SlooDoc, change: Omit<SlooChange, "evidence"> & { evidence?: string[] }): void {
  sloo.log = [...sloo.log, { evidence: [], ...change }].slice(-LOG_LIMIT);
  sloo.updatedAt = change.at;
}

/** Moves a dial one step toward `target`. Locked dials and dials already there are left alone. */
function stepDial(sloo: SlooDoc, name: DialName, target: string, source: "stats" | "reflection", reason: string, evidence: string[], at: string): boolean {
  const dial = sloo.approach[name];
  if (dial.locked || dial.value === target) return false;
  const levels = dialLevels[name] as readonly string[];
  const from = levels.indexOf(dial.value);
  const to = levels.indexOf(target);
  if (from < 0 || to < 0) return false;
  const next = levels[from + Math.sign(to - from)]!;
  Object.assign(dial, { value: next, setBy: source, reason, at, evidence: evidence.slice(-5) });
  log(sloo, { at, source, change: `${name}: ${levels[from]} → ${next}`, reason, evidence });
  return true;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The rules, in one place. Each returns the level the numbers point to, or undefined to leave the dial as it is. */
export function statTargets(o: Observed): Partial<Record<DialName, { target: string; reason: string; evidence: string[] }>> {
  const r = o.recent;
  const out: ReturnType<typeof statTargets> = {};
  if (r.n < STATS_MIN_ANSWERS) return out;
  const summary = `last ${r.n} answers: ${pct(r.accuracy)} right, ${pct(r.hintRate)} after a hint`;

  if (r.accuracy >= 0.85 && r.hintRate <= 0.15) out.challenge = { target: "stretching", reason: `Succeeding easily (${summary}).`, evidence: r.evidence };
  else if (r.accuracy < 0.5) out.challenge = { target: "gentle", reason: `Struggling (${summary}).`, evidence: r.evidence };
  else if (r.accuracy >= 0.6 && r.accuracy <= 0.8) out.challenge = { target: "balanced", reason: `In the productive range (${summary}).`, evidence: r.evidence };

  if (r.accuracy >= 0.85 && o.calibration.verdict !== "overconfident") out.pacing = { target: "brisk", reason: `Ready to move faster (${summary}).`, evidence: r.evidence };
  else if (r.accuracy < 0.5) out.pacing = { target: "slower", reason: `Needs more practice per step (${summary}).`, evidence: r.evidence };
  else if (r.accuracy >= 0.6 && r.accuracy <= 0.8) out.pacing = { target: "steady", reason: `Steady progress (${summary}).`, evidence: r.evidence };

  if (r.hintRate >= 0.4 && r.accuracy < 0.6) out.hintGenerosity = { target: "generous", reason: `Leans on hints and still misses (${summary}).`, evidence: r.evidence };
  else if (r.hintRate <= 0.1 && r.accuracy >= 0.75) out.hintGenerosity = { target: "sparing", reason: `Rarely needs hints (${summary}).`, evidence: r.evidence };

  const taught = combine(o, ["explain", "example", "analogy", "visual"]);
  const bare = o.baseline;
  if (taught.n >= MIN_SAMPLE && bare.n >= MIN_SAMPLE) {
    if (taught.accuracy - bare.accuracy >= 0.2) {
      out.explanationDepth = { target: "thorough", reason: `Does better after explanations (${pct(taught.accuracy)} over ${taught.n}) than without (${pct(bare.accuracy)} over ${bare.n}).`, evidence: [...taught.evidence, ...bare.evidence] };
    } else if (bare.accuracy >= 0.8 && bare.accuracy >= taught.accuracy) {
      out.explanationDepth = { target: "brief", reason: `Succeeds without explanations first (${pct(bare.accuracy)} over ${bare.n}).`, evidence: bare.evidence };
    }
  }
  return out;
}

function combine(o: Observed, intents: BlockIntent[]): Stat {
  const stats = intents.flatMap((i) => (o.presentation[i] ? [o.presentation[i]!] : []));
  const n = stats.reduce((sum, s) => sum + s.n, 0);
  if (n === 0) return { n: 0, accuracy: 0, meanScore: 0, hintRate: 0, evidence: [] };
  const weighted = (key: "accuracy" | "meanScore" | "hintRate") => stats.reduce((sum, s) => sum + s[key] * s.n, 0) / n;
  return { n, accuracy: weighted("accuracy"), meanScore: weighted("meanScore"), hintRate: weighted("hintRate"), evidence: stats.flatMap((s) => s.evidence).slice(-5) };
}

/** Deterministic update from the observed profile. Returns the changes made (also appended to the log). */
export function applyStats(sloo: SlooDoc, observed: Observed, at: string): string[] {
  const changes: string[] = [];
  for (const [name, t] of Object.entries(statTargets(observed)) as [DialName, { target: string; reason: string; evidence: string[] }][]) {
    if (stepDial(sloo, name, t.target, "stats", t.reason, t.evidence, at)) changes.push(name);
  }

  // Tactics by presentation form: worked and failed counts are recomputed from the profile, not accumulated.
  for (const intent of blockIntents) {
    const s = observed.presentation[intent];
    if (!s || s.n < 3) continue;
    const id = `form-${intent}`;
    const worked = Math.round(s.accuracy * s.n);
    const failed = s.n - worked;
    const existing = sloo.approach.tactics.find((t) => t.id === id);
    if (existing && existing.worked === worked && existing.failed === failed) continue;
    const tactic = { id, text: `Showing ${intent} material before asking`, intent, source: "stats" as const, worked, failed, evidence: s.evidence, updatedAt: at };
    if (existing) Object.assign(existing, tactic);
    else sloo.approach.tactics.push(tactic);
    changes.push(id);
  }
  if (changes.length) sloo.updatedAt = at;
  return changes;
}

// ---------------------------------------------------------------- reflection

export const reflectionSchema = z.object({
  toldMe: z.array(z.string().max(300)).max(3).describe("New things the learner said about themselves, their life or their situation. Only what they actually said."),
  workingToward: z.array(z.string().max(300)).max(2).describe("Goals the learner expressed beyond this session."),
  episodes: z.array(z.string().max(300)).max(2).describe("A moment worth recalling in a later session: a breakthrough, a joke, a frustration."),
  tactics: z
    .array(
      z.object({
        tactic: z.string().max(200).describe("A teaching move, stated generally: 'a worked example before practice', 'a cooking analogy'."),
        intent: z.enum(blockIntents).optional(),
        outcome: z.enum(["worked", "failed"]),
        note: z.string().max(300).describe("What happened that shows it."),
      }),
    )
    .max(3),
  dials: z
    .array(
      z.object({
        dial: z.enum(dialNames as [DialName, ...DialName[]]),
        direction: z.enum(["down", "up"]).describe("down = toward the first level, up = toward the last."),
        reason: z.string().max(300),
      }),
    )
    .max(2)
    .describe("Only when this session clearly showed the current setting was wrong."),
  learnerNotes: z
    .array(z.object({ category: z.enum(noteCategories), text: z.string().max(300) }))
    .max(3)
    .describe("Durable facts about how this person learns, not already in the notes."),
});

export type Reflection = z.infer<typeof reflectionSchema>;

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function addEntries(list: Entry[], texts: string[], limit: number, at: string, courseId: string | undefined): Entry[] {
  const seen = new Set(list.map((e) => normalise(e.text)));
  const added = texts
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(normalise(t)))
    .map((text): Entry => ({ id: newId(), text, at, source: "reflection", courseId }));
  return [...list, ...added].slice(-limit);
}

/** Applies a validated reflection. Every change is bounded (counts, lengths, one dial step) and logged. */
export function applyReflection(sloo: SlooDoc, learner: LearnerDoc, raw: unknown, ctx: { at: string; courseId?: string; sessionId: string }): string[] {
  const parsed = reflectionSchema.safeParse(raw);
  if (!parsed.success) {
    log(sloo, { at: ctx.at, source: "reflection", change: "ignored", reason: `Reflection for ${ctx.sessionId} did not match the schema.` });
    return [];
  }
  const r = parsed.data;
  const changes: string[] = [];
  const memory = sloo.memory;
  for (const key of ["toldMe", "workingToward", "episodes"] as const) {
    const before = memory[key].length;
    const next = addEntries(memory[key], r[key], MEMORY_LIMITS[key], ctx.at, key === "episodes" ? ctx.courseId : undefined);
    const added = next.filter((e) => !memory[key].includes(e));
    memory[key] = next;
    if (added.length) {
      changes.push(`${key}+${added.length}`);
      log(sloo, { at: ctx.at, source: "reflection", change: `remembered (${key}): ${added.map((e) => e.text).join(" | ")}`, reason: `End of session ${ctx.sessionId}.`, evidence: [ctx.sessionId] });
    } else if (before !== next.length) {
      changes.push(key);
    }
  }

  for (const t of r.tactics) {
    const id = `reflect-${normalise(t.tactic).replace(/ /g, "-").slice(0, 40)}`;
    const existing = sloo.approach.tactics.find((x) => x.id === id);
    const tactic = existing ?? { id, text: t.tactic, intent: t.intent, source: "reflection" as const, worked: 0, failed: 0, evidence: [], updatedAt: ctx.at };
    if (t.outcome === "worked") tactic.worked += 1;
    else tactic.failed += 1;
    tactic.note = t.note;
    tactic.updatedAt = ctx.at;
    tactic.evidence = [...tactic.evidence, ctx.sessionId].slice(-5);
    if (!existing) sloo.approach.tactics.push(tactic);
    changes.push(id);
    log(sloo, { at: ctx.at, source: "reflection", change: `tactic ${t.outcome}: ${t.tactic}`, reason: t.note, evidence: [ctx.sessionId] });
  }
  sloo.approach.tactics = sloo.approach.tactics.slice(-40);

  for (const d of r.dials) {
    const levels = dialLevels[d.dial] as readonly string[];
    const index = levels.indexOf(sloo.approach[d.dial].value) + (d.direction === "up" ? 1 : -1);
    const target = levels[Math.max(0, Math.min(levels.length - 1, index))]!;
    if (stepDial(sloo, d.dial, target, "reflection", d.reason, [ctx.sessionId], ctx.at)) changes.push(d.dial);
  }

  const seen = new Set(learner.notes.map((n) => normalise(n.text)));
  for (const note of r.learnerNotes) {
    if (!note.text.trim() || seen.has(normalise(note.text))) continue;
    learner.notes.push({ id: newId(), at: ctx.at, source: "reflection", category: note.category, text: note.text.trim(), courseId: ctx.courseId });
    changes.push(`note:${note.category}`);
  }
  learner.notes = learner.notes.slice(-MEMORY_LIMITS.notes);
  return changes;
}
