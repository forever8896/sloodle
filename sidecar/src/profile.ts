// What the person can see and change about what is remembered of them. Pure edits over the two documents; the RPC
// layer validates input with the schemas below and saves the result.

import { z } from "zod";
import { dialLevels, dialNames, noteCategories, type DialName, type LearnerDoc, type SlooDoc } from "./formats";

const newId = (): string => crypto.randomUUID().slice(0, 8);
const entryText = z.string().trim().min(1).max(2000);

export const learnerLists = ["preferences", "goals", "interests"] as const;
export const slooLists = ["toldMe", "workingToward", "episodes"] as const;

export const learnerEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), name: z.string().max(200).optional(), about: z.string().max(2000).optional() }),
  z.object({ op: z.literal("add"), list: z.enum(learnerLists), text: entryText }),
  z.object({ op: z.literal("addNote"), category: z.enum(noteCategories), text: entryText }),
  z.object({ op: z.literal("update"), list: z.enum([...learnerLists, "notes"]), id: z.string(), text: entryText }),
  z.object({ op: z.literal("delete"), list: z.enum([...learnerLists, "notes"]), id: z.string() }),
  z.object({ op: z.literal("dismiss"), key: z.string().max(200) }),
  z.object({ op: z.literal("restore"), key: z.string().max(200) }),
]);

export type LearnerEdit = z.infer<typeof learnerEdit>;

export function editLearner(doc: LearnerDoc, edit: LearnerEdit, now = new Date()): LearnerDoc {
  const at = now.toISOString();
  const next = structuredClone(doc);
  next.updatedAt = at;
  switch (edit.op) {
    case "set":
      if (edit.name !== undefined) next.stated.name = edit.name.trim() || undefined;
      if (edit.about !== undefined) next.stated.about = edit.about.trim() || undefined;
      break;
    case "add":
      next.stated[edit.list].push({ id: newId(), text: edit.text, at, source: "user" });
      break;
    case "addNote":
      next.notes.push({ id: newId(), text: edit.text, at, source: "user", category: edit.category });
      break;
    case "update": {
      const list = edit.list === "notes" ? next.notes : next.stated[edit.list];
      const entry = list.find((e) => e.id === edit.id);
      if (!entry) throw new Error("That entry no longer exists.");
      Object.assign(entry, { text: edit.text, at, source: "user" });
      break;
    }
    case "delete":
      if (edit.list === "notes") next.notes = next.notes.filter((e) => e.id !== edit.id);
      else next.stated[edit.list] = next.stated[edit.list].filter((e) => e.id !== edit.id);
      break;
    case "dismiss":
      if (!next.dismissed.includes(edit.key)) next.dismissed.push(edit.key);
      break;
    case "restore":
      next.dismissed = next.dismissed.filter((k) => k !== edit.key);
      break;
  }
  return next;
}

export const slooEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("persona"), name: z.string().trim().min(1).max(60).optional(), voice: z.string().max(2000).optional(), tone: z.string().max(2000).optional() }),
  z.object({
    op: z.literal("dial"),
    dial: z.enum(dialNames as [DialName, ...DialName[]]),
    value: z.string().optional(),
    locked: z.boolean().optional(),
  }),
  z.object({ op: z.literal("add"), list: z.enum(slooLists), text: entryText }),
  z.object({ op: z.literal("update"), list: z.enum(slooLists), id: z.string(), text: entryText }),
  z.object({ op: z.literal("delete"), list: z.enum([...slooLists, "tactics"]), id: z.string() }),
]);

export type SlooEdit = z.infer<typeof slooEdit>;

export function editSloo(doc: SlooDoc, edit: SlooEdit, now = new Date()): SlooDoc {
  const at = now.toISOString();
  const next = structuredClone(doc);
  next.updatedAt = at;
  const record = (change: string) => next.log.push({ at, source: "user", change, reason: "Changed by the learner.", evidence: [] });
  switch (edit.op) {
    case "persona":
      for (const key of ["name", "voice", "tone"] as const) {
        if (edit[key] !== undefined) {
          next.persona[key] = edit[key]!;
          record(`persona ${key}`);
        }
      }
      break;
    case "dial": {
      const dial = next.approach[edit.dial];
      if (edit.value !== undefined) {
        if (!(dialLevels[edit.dial] as readonly string[]).includes(edit.value)) throw new Error(`Unknown setting "${edit.value}".`);
        Object.assign(dial, { value: edit.value, setBy: "user", reason: "Set by the learner.", at, evidence: [], locked: edit.locked ?? true });
        record(`${edit.dial} → ${edit.value}${dial.locked ? " (locked)" : ""}`);
      } else if (edit.locked !== undefined) {
        dial.locked = edit.locked;
        record(`${edit.dial} ${edit.locked ? "locked" : "unlocked"}`);
      }
      break;
    }
    case "add":
      next.memory[edit.list].push({ id: newId(), text: edit.text, at, source: "user" });
      break;
    case "update": {
      const entry = next.memory[edit.list].find((e) => e.id === edit.id);
      if (!entry) throw new Error("That entry no longer exists.");
      Object.assign(entry, { text: edit.text, at, source: "user" });
      break;
    }
    case "delete":
      if (edit.list === "tactics") next.approach.tactics = next.approach.tactics.filter((t) => t.id !== edit.id);
      else next.memory[edit.list] = next.memory[edit.list].filter((e) => e.id !== edit.id);
      record(`forgot ${edit.list} ${edit.id}`);
      break;
  }
  next.log = next.log.slice(-200);
  return next;
}
