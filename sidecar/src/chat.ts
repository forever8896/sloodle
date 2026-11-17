// The global chat with Sloo: one continuous conversation outside any course, saved in chat/ in the data folder.
// Sloo sees the learner's whole study journey (journey.ts), keeps what they say through the same documents the
// lessons use (learner notes and preferences, Sloo's memory and dials), and can propose course changes that only the
// learner's Accept writes (revise.ts). It does not grade, award mastery or run lesson blocks.

import { createSdkMcpServer, query, tool, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AsyncQueue, baseOptions } from "./agent";
import { chatPrompt } from "./chatprompts";
import { dialLevels, dialNames, noteCategories, type DialName, type LearnerNote } from "./formats";
import { courseDetail, journeySummary, recentActivity } from "./journey";
import { dueItems } from "./learner";
import { editSloo } from "./profile";
import { acceptProposal, courseChangeSchema, planLessons, ProposalError, propose, rejectProposal, type Proposal } from "./revise";
import { dataDir, store } from "./store";
import type { ChatInfo, ChatOffer, ProposalView, SessionEvent } from "./types";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const shortId = (): string => crypto.randomUUID().slice(0, 8);
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// ---------------------------------------------------------------- storage: chat/thread.jsonl and chat/state.json

interface ChatState {
  startedAt: string;
  sdkSession?: string;
  proposals: Proposal[];
}

const chatDir = () => join(dataDir, "chat");
const threadPath = () => join(chatDir(), "thread.jsonl");
const statePath = () => join(chatDir(), "state.json");

export const chatStore = {
  state(): ChatState {
    mkdirSync(chatDir(), { recursive: true });
    if (!existsSync(statePath())) {
      const fresh: ChatState = { startedAt: new Date().toISOString(), proposals: [] };
      this.saveState(fresh);
      return fresh;
    }
    return JSON.parse(readFileSync(statePath(), "utf8")) as ChatState;
  },
  saveState(state: ChatState): void {
    mkdirSync(chatDir(), { recursive: true });
    const tmp = `${statePath()}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, statePath());
  },
  history(): SessionEvent[] {
    if (!existsSync(threadPath())) return [];
    return readFileSync(threadPath(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEvent);
  },
  append(event: SessionEvent): void {
    mkdirSync(chatDir(), { recursive: true });
    appendFileSync(threadPath(), `${JSON.stringify(event)}\n`);
  },
  /** Moves the conversation to chat/archive/ and starts an empty one. Pending proposals lapse. */
  archive(now = new Date()): ChatState {
    const archive = join(chatDir(), "archive");
    mkdirSync(archive, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    if (existsSync(threadPath())) renameSync(threadPath(), join(archive, `${stamp}.jsonl`));
    const old = this.state();
    if (existsSync(statePath())) writeFileSync(join(archive, `${stamp}.state.json`), JSON.stringify(old, null, 2));
    const fresh: ChatState = { startedAt: now.toISOString(), proposals: [] };
    this.saveState(fresh);
    return fresh;
  },
};

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- the conversation

export class ChatSession {
  readonly history: SessionEvent[];
  readonly id: string;
  busy = false;
  ended = false;

  private input = new AsyncQueue<SDKUserMessage>();
  private run?: Query;
  private journeyHash?: string;
  /** Things that happened outside the conversation (accepted or rejected proposals), told to the model next turn. */
  private notes: string[] = [];

  constructor(
    private readonly push: (event: SessionEvent) => void,
    private readonly coursesChanged: () => void,
    private readonly profileChanged: () => void,
  ) {
    const state = chatStore.state();
    this.id = `chat-${new Date(state.startedAt).getTime()}`;
    this.history = chatStore.history();
  }

  info(): ChatInfo {
    return { sessionId: this.id, busy: this.busy, ended: this.ended, startedAt: chatStore.state().startedAt, history: this.history };
  }

  send(text: string): void {
    if (this.ended) throw new Error("This conversation was closed. Open the chat again.");
    if (this.busy) throw new Error("Sloo is still answering.");
    this.emit({ t: "user", text });
    if (!this.run) this.start();
    const journey = journeySummary();
    const parts: string[] = [];
    if (this.journeyHash !== hash(journey)) {
      if (this.journeyHash !== undefined) parts.push(`<journey_update>\n${journey}\n</journey_update>`);
      this.journeyHash = hash(journey);
    }
    if (this.notes.length) parts.push(...this.notes.splice(0).map((n) => `[${n}]`));
    parts.push(text);
    this.toModel(parts.join("\n\n"));
  }

  async interrupt(): Promise<void> {
    await this.run?.interrupt();
  }

  dispose(): void {
    this.ended = true;
    this.input.close();
    this.run?.close();
  }

  accept(proposalId: string): ProposalView {
    const state = chatStore.state();
    const proposal = state.proposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error("That proposal is no longer open.");
    let accepted;
    try {
      accepted = acceptProposal(proposal);
    } catch (error) {
      if (!(error instanceof ProposalError) || error.status === proposal.status) throw error;
      this.resolve(state, { ...proposal, status: error.status, resolvedAt: new Date().toISOString(), view: { ...proposal.view, status: error.status } }, error.message);
      this.notes.push(`The learner pressed Accept on proposal ${proposal.id}, but it could not be applied: ${error.message}`);
      return { ...proposal.view, status: error.status };
    }
    const plans = Object.keys(accepted.replan);
    this.resolve(state, accepted.proposal, plans.length ? `Saved. Writing ${plans.length === 1 ? "the new lesson plan" : `${plans.length} new lesson plans`} now.` : "Saved.");
    this.notes.push(
      `The learner accepted proposal ${proposal.id} for course ${proposal.courseId}; it is saved${plans.length ? `, and lesson plans are being written for ${plans.join(", ")} (until they land, those lessons are taught from their statements)` : ""}.`,
    );
    this.coursesChanged();
    this.profileChanged();
    if (plans.length) this.writePlans(proposal.courseId, accepted.replan);
    return accepted.proposal.view;
  }

  reject(proposalId: string): ProposalView {
    const state = chatStore.state();
    const proposal = state.proposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error("That proposal is no longer open.");
    const rejected = rejectProposal(proposal);
    this.resolve(state, rejected, "Nothing was changed.");
    this.notes.push(`The learner rejected proposal ${proposal.id}; nothing was changed. Ask what they would prefer if it is not clear.`);
    return rejected.view;
  }

  private resolve(state: ChatState, proposal: Proposal, note: string): void {
    state.proposals = state.proposals.map((p) => (p.id === proposal.id ? proposal : p));
    chatStore.saveState(state);
    this.emit({ t: "proposal_update", id: proposal.id, status: proposal.status, note });
  }

  private writePlans(courseId: string, replan: Record<string, string>): void {
    const count = Object.keys(replan).length;
    this.emit({ t: "activity", label: "Writing lesson plans", detail: `${count} lesson${count === 1 ? "" : "s"}` });
    planLessons(courseId, replan, () => this.coursesChanged()).then(
      (planned) => {
        const missed = count - planned.length;
        this.emit({
          t: "activity",
          label: planned.length ? "Lesson plans ready" : "Lesson plans not written",
          detail: missed ? `${missed} lesson${missed === 1 ? " is" : "s are"} taught from the lesson goal for now` : undefined,
        });
        this.coursesChanged();
      },
      (error) => {
        console.error(`sloodle: planning after a chat change failed: ${messageOf(error)}`);
        this.emit({ t: "activity", label: "Lesson plans not written", detail: "The new lessons are taught from their goals for now." });
      },
    );
  }

  private start(): void {
    const settings = store.settings();
    const state = chatStore.state();
    const journey = journeySummary();
    this.journeyHash = hash(journey);
    const tools = this.tools();
    mkdirSync(chatDir(), { recursive: true });
    this.run = query({
      prompt: this.input,
      options: {
        ...baseOptions(settings, chatDir()),
        model: settings.models.tutor,
        systemPrompt: chatPrompt(store.sloo(), journey, new Date()),
        tools: [],
        mcpServers: { sloodle: createSdkMcpServer({ name: "sloodle", version: "0.2.0", tools }) },
        allowedTools: tools.map((t) => `mcp__sloodle__${t.name}`),
        includePartialMessages: true,
        ...(state.sdkSession ? { resume: state.sdkSession } : {}),
      },
    });
    void this.loop(this.run);
  }

  private toModel(text: string): void {
    this.busy = true;
    this.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null } as SDKUserMessage);
  }

  private emit(event: SessionEvent): void {
    if (event.t !== "delta") {
      this.history.push(event);
      chatStore.append(event);
    }
    this.push(event);
  }

  private async loop(run: Query): Promise<void> {
    try {
      for await (const message of run) {
        if (message.type === "stream_event") {
          const event = message.event;
          if (!message.parent_tool_use_id && event.type === "content_block_delta" && event.delta.type === "text_delta") this.emit({ t: "delta", text: event.delta.text });
        } else if (message.type === "assistant") {
          if (message.error) this.emit({ t: "error", message: `The model returned an error (${message.error}).` });
          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim()) this.emit({ t: "message", text: block.text });
          }
        } else if (message.type === "result") {
          const state = chatStore.state();
          if (state.sdkSession !== message.session_id) chatStore.saveState({ ...state, sdkSession: message.session_id });
          if (message.subtype !== "success") this.emit({ t: "error", message: `The model stopped early (${message.subtype}).` });
          this.busy = false;
          this.emit({ t: "turn_end" });
        }
      }
    } catch (error) {
      if (!this.ended) {
        this.busy = false;
        this.run = undefined;
        this.input = new AsyncQueue<SDKUserMessage>();
        this.emit({ t: "error", message: messageOf(error) });
        this.emit({ t: "turn_end" });
      }
    }
  }

  private tools() {
    const courseIds = () => store.courseIds();
    const unknownCourse = (id: string) => fail(`There is no course "${id}". Courses: ${courseIds().join(", ") || "none"}.`);

    const getCourse = tool(
      "get_course",
      "Read one course in detail: the learner's goal for it, every module and lesson with its mastery and a sketch of its lesson plan, recent session summaries and projects.",
      { course_id: z.string() },
      async (args) => (courseIds().includes(args.course_id) ? ok(courseDetail(args.course_id)) : unknownCourse(args.course_id)),
    );

    const getRecentActivity = tool(
      "get_recent_activity",
      "Read what the learner did recently, newest first: answers with scores, lessons, reviews, course changes and session summaries.",
      { days: z.number().int().min(1).max(90).default(14), course_id: z.string().optional() },
      async (args) => (args.course_id && !courseIds().includes(args.course_id) ? unknownCourse(args.course_id) : ok(recentActivity(args.days, args.course_id))),
    );

    const recordObservation = tool(
      "record_observation",
      "Save one durable fact about the learner that should shape future teaching: a preference, a recurring misconception, a strength, a struggle, their context, or what motivates them, including what they think of a course. One fact per call, written so it makes sense on its own months later.",
      { category: z.enum(noteCategories), text: z.string().min(1).max(600), course_id: z.string().optional().describe("Set when it only applies to one course.") },
      async (args) => {
        if (args.course_id && !courseIds().includes(args.course_id)) return unknownCourse(args.course_id);
        const learner = store.learner();
        const note: LearnerNote = { id: shortId(), at: new Date().toISOString(), source: "tutor", category: args.category, text: args.text };
        if (args.course_id) note.courseId = args.course_id;
        learner.notes.push(note);
        learner.notes = learner.notes.slice(-150);
        store.saveLearner(learner);
        this.profileChanged();
        return ok("Saved.");
      },
    );

    const savePreference = tool(
      "save_preference",
      "Save a preference the learner stated about how they want to be taught (\"examples before theory\", \"shorter sessions\"). Lessons read these.",
      { text: z.string().min(1).max(300), course_id: z.string().optional().describe("Set when it only applies to one course.") },
      async (args) => {
        if (args.course_id && !courseIds().includes(args.course_id)) return unknownCourse(args.course_id);
        const learner = store.learner();
        if (learner.stated.preferences.some((p) => p.text.trim().toLowerCase() === args.text.trim().toLowerCase())) return ok("Already saved.");
        learner.stated.preferences.push({ id: shortId(), text: args.text, at: new Date().toISOString(), source: "tutor", ...(args.course_id ? { courseId: args.course_id } : {}) });
        store.saveLearner(learner);
        this.profileChanged();
        return ok("Saved.");
      },
    );

    const remember = tool(
      "remember",
      "Remember something the learner told you about themselves (told_me) or a goal beyond one course (working_toward). Lessons bring these up when they help.",
      { kind: z.enum(["told_me", "working_toward"]), text: z.string().min(1).max(600) },
      async (args) => {
        const sloo = store.sloo();
        const list = args.kind === "told_me" ? sloo.memory.toldMe : sloo.memory.workingToward;
        if (list.some((e) => e.text.trim().toLowerCase() === args.text.trim().toLowerCase())) return ok("Already remembered.");
        list.push({ id: shortId(), text: args.text, at: new Date().toISOString(), source: "tutor" });
        sloo.updatedAt = new Date().toISOString();
        store.saveSloo(sloo);
        this.profileChanged();
        return ok("Remembered.");
      },
    );

    const setDial = tool(
      "set_teaching_dial",
      `Change one of your teaching settings because the learner asked for it. Settings and values: ${dialNames.map((d) => `${d} (${dialLevels[d].join(", ")})`).join("; ")}. It applies to every lesson; the learner can change it back in their profile.`,
      { dial: z.enum(dialNames as [DialName, ...DialName[]]), value: z.string() },
      async (args) => {
        if (!(dialLevels[args.dial] as readonly string[]).includes(args.value)) return fail(`"${args.value}" is not a setting of ${args.dial}. Use one of: ${dialLevels[args.dial].join(", ")}.`);
        const current = store.sloo().approach[args.dial];
        if (current.locked && current.setBy === "user" && current.value !== args.value) {
          return fail(`The learner locked ${args.dial} at "${current.value}" in their profile. Tell them; they can change it there.`);
        }
        store.saveSloo(editSloo(store.sloo(), { op: "dial", dial: args.dial, value: args.value, locked: false }));
        this.profileChanged();
        return ok(`Set ${args.dial} to ${args.value}.`);
      },
    );

    const proposeChange = tool(
      "propose_course_change",
      "Propose a change to one course's curriculum. The engine checks it and shows the learner a before and after card with Accept and Reject; nothing is written unless they accept. Lessons are the course's objectives; each has a stable id that keeps its progress. New lessons get their lesson plans written after acceptance; use replan_lessons (with guidance) to change the depth or pacing of lessons that are not yet done. After calling this, end your turn.",
      {
        course_id: z.string(),
        reason: z.string().min(1).max(600).describe("One or two sentences to the learner: why this change, in terms of what they told you."),
        changes: z.array(courseChangeSchema).min(1).max(30),
      },
      async (args) => {
        if (!courseIds().includes(args.course_id)) return unknownCourse(args.course_id);
        const { proposal, problems } = propose(args.course_id, args.reason, args.changes);
        if (!proposal) return fail(`Nothing was proposed. Fix these and call propose_course_change again:\n- ${problems.join("\n- ")}`);
        const state = chatStore.state();
        for (const older of state.proposals.filter((p) => p.courseId === proposal.courseId && p.status === "pending")) {
          this.resolve(state, { ...older, status: "superseded", resolvedAt: proposal.createdAt, view: { ...older.view, status: "superseded" } }, "Replaced by a newer proposal.");
        }
        state.proposals = [...state.proposals, proposal].slice(-50);
        chatStore.saveState(state);
        this.emit({ t: "proposal", proposal: proposal.view });
        const warn = proposal.view.warnings.length ? ` The card warns them: ${proposal.view.warnings.join(" ")}` : "";
        return ok(`The card is on screen, showing: ${proposal.view.lines.join(" ")}${warn} Nothing has changed yet. End your turn now; you will hear whether they accepted with their next message.`);
      },
    );

    const offer = tool(
      "offer_next_step",
      "Put one button in the chat that takes the learner somewhere: open a course, start its next lesson, review its due cards, or start a new course with the goal filled in. Use it after suggesting that step.",
      {
        kind: z.enum(["open_course", "start_lesson", "review", "new_course"]),
        label: z.string().min(1).max(60).describe("The button text, a few words, e.g. 'Start the next lesson'."),
        course_id: z.string().optional().describe("For every kind except new_course."),
        topic: z.string().max(400).optional().describe("For new_course: what they want to learn, in their words."),
      },
      async (args) => {
        const id = shortId();
        let offer: ChatOffer;
        if (args.kind === "new_course") {
          if (!args.topic?.trim()) return fail("new_course needs a topic.");
          offer = { id, label: args.label, kind: "new_course", topic: args.topic.trim() };
        } else {
          if (!args.course_id || !courseIds().includes(args.course_id)) return unknownCourse(args.course_id ?? "");
          const progress = store.progress(args.course_id);
          if (args.kind !== "open_course" && progress.phase !== "ready") return fail(`That course is not ready for ${args.kind === "review" ? "review" : "lessons"} yet; offer open_course instead.`);
          if (args.kind === "review" && dueItems(progress.reviewCards, new Date()).length === 0) return fail("Nothing is due for review in that course right now.");
          offer = { id, label: args.label, kind: args.kind, courseId: args.course_id };
        }
        this.emit({ t: "offer", offer });
        return ok("The button is on screen.");
      },
    );

    return [getCourse, getRecentActivity, recordObservation, savePreference, remember, setDial, proposeChange, offer];
  }
}

// ---------------------------------------------------------------- RPC

/** The chat's RPC methods: chat.open, chat.send, chat.interrupt, chat.accept, chat.reject, chat.reset. */
export function chatMethods(hooks: { push: (sessionId: string, event: SessionEvent) => void; courses: () => void; profile: () => void }) {
  let live: ChatSession | undefined;
  const create = () => {
    const session: ChatSession = new ChatSession((event) => hooks.push(session.id, event), hooks.courses, hooks.profile);
    return session;
  };
  const current = () => (live && !live.ended ? live : (live = create()));
  return {
    "chat.open": () => current().info(),
    "chat.send": ({ text }: { text?: unknown }) => current().send(String(text ?? "").slice(0, 8000)),
    "chat.interrupt": () => current().interrupt(),
    "chat.accept": ({ proposalId }: { proposalId?: unknown }) => current().accept(String(proposalId)),
    "chat.reject": ({ proposalId }: { proposalId?: unknown }) => current().reject(String(proposalId)),
    "chat.reset": () => {
      live?.dispose();
      chatStore.archive();
      live = create();
      return live.info();
    },
  };
}
