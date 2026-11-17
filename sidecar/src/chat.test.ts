import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ChatSession, chatStore } from "./chat";
import type { Progress } from "./formats";
import { propose } from "./revise";
import { dataDir, store } from "./store";
import { sampleCourse } from "./testdata";
import type { SessionEvent } from "./types";

store.init();

function course(id: string): void {
  store.saveContent({ ...sampleCourse(), id });
  const progress: Progress = {
    format: "sloodle.progress",
    version: 1,
    id,
    topic: "fractions",
    createdAt: "2026-11-01T10:00:00.000Z",
    phase: "ready",
    origin: { kind: "generated", at: "2026-11-01T10:00:00.000Z" },
    objectiveStates: {},
    summaries: [],
    projects: [],
    reviewCards: [],
    sdkSessions: {},
  };
  store.saveProgress(progress);
}

test("the chat keeps proposals across a restart, and Accept and Reject resolve them in the saved thread", () => {
  course("chat-1");
  const pushed: SessionEvent[] = [];
  const first = new ChatSession((e) => pushed.push(e), () => undefined, () => undefined);
  const a = propose("chat-1", "r", [{ op: "edit_module", module_id: "m1", title: "Fractions first" }]).proposal!;
  const b = propose("chat-1", "r", [{ op: "edit_course", title: "Kitchen fractions" }]).proposal!;
  chatStore.saveState({ ...chatStore.state(), proposals: [a, b] });
  first.dispose();

  // A new engine run picks the proposals up from chat/state.json.
  const chat = new ChatSession((e) => pushed.push(e), () => undefined, () => undefined);
  expect(chat.reject(a.id).status).toBe("rejected");
  expect(store.content("chat-1")!.modules[0]!.title).toBe(sampleCourse().modules[0]!.title);
  expect(chat.accept(b.id).status).toBe("accepted");
  expect(store.content("chat-1")!.title).toBe("Kitchen fractions");
  expect(() => chat.accept(a.id)).toThrow(/already rejected/);

  const updates = chatStore.history().filter((e) => e.t === "proposal_update");
  expect(updates.map((e) => e.t === "proposal_update" && [e.id, e.status])).toEqual([
    [a.id, "rejected"],
    [b.id, "accepted"],
  ]);
  expect(chatStore.state().proposals.map((p) => p.status)).toEqual(["rejected", "accepted"]);
});

test("a second accept of a proposal made stale by the first is refused and marked stale", () => {
  course("chat-2");
  const chat = new ChatSession(() => undefined, () => undefined, () => undefined);
  const a = propose("chat-2", "r", [{ op: "edit_course", title: "One" }]).proposal!;
  const b = propose("chat-2", "r", [{ op: "edit_course", title: "Two" }]).proposal!;
  chatStore.saveState({ ...chatStore.state(), proposals: [a, b] });
  chat.accept(a.id);
  expect(chat.accept(b.id).status).toBe("stale");
  expect(store.content("chat-2")!.title).toBe("One");
});

test("a new conversation archives the old thread", () => {
  chatStore.append({ t: "user", text: "hello" });
  const before = chatStore.state().startedAt;
  chatStore.archive(new Date(Date.parse(before) + 1000));
  expect(chatStore.history()).toEqual([]);
  expect(chatStore.state().proposals).toEqual([]);
  const archive = join(dataDir, "chat", "archive");
  expect(existsSync(archive) && readdirSync(archive).some((f) => f.endsWith(".jsonl"))).toBe(true);
});
