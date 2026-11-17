import { createSdkMcpServer, query, tool, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { recordActivity } from "./activity";
import { AsyncQueue, baseOptions, gradeFreeResponse } from "./agent";
import { catalogue, describeResult, flashcardScore, gradeBlanks, gradeMatching, gradeOrdering, present, typeOf, verdictOf, type ComponentSecret } from "./catalogue";
import {
  blockIntents,
  blockProblems,
  blockSchema,
  componentFields,
  COURSE_FORMAT,
  COURSE_VERSION,
  courseProblems,
  idSchema,
  isMarkdownBlock,
  lessonPlanSchema,
  moduleSchema,
  objectiveSchema,
  planGaps,
  sourceSchema,
  type AnswerKind,
  type BlockIntent,
  type Check,
  type ComponentType,
  type CourseDoc,
  type LearnerNote,
  type LessonBlock,
  type Misconception,
  type Objective,
  type Progress,
} from "./formats";
import { cachedImage, describeCandidate, ImageLibrary, type CachedImage } from "./images";
import { allObjectives, applyEvidence, newReviewItem } from "./learner";
import { interviewPrompt, lessonPrompt, planningPrompt } from "./prompts";
import { reflectOnSession } from "./reflect";
import { courseDir, store } from "./store";
import type { AssignedProject, ComponentAction, ComponentResult, ComponentUpdate, GradeResult, Question, SessionEvent, SessionInfo, SessionKind, ShownComponent, Verdict } from "./types";

interface AnswerKey {
  question: Question;
  checkId?: string;
  correctOption?: number;
  optionMisconceptions?: (string | null)[];
  numericAnswer?: number;
  tolerance?: number;
  answerKey: string;
  rubric?: string;
  hints: string[];
  hintsShown: number;
  answered: boolean;
  shownAt: number;
}

/** A lesson component on screen, with everything the engine needs to grade it and nothing the learner was sent. */
interface ShownState {
  view: ShownComponent;
  block: LessonBlock;
  secret: ComponentSecret;
  hintsShown: number;
  /** Worked example: how many steps are revealed. */
  revealed: number;
  predictions: { step: number; answer: string; verdict: Verdict; score: number; note: string }[];
  flipped: boolean;
  done: boolean;
  /** An action is being graded; a second one waits. */
  pending: boolean;
  reported: boolean;
  shownAt: number;
}

/** What the window may ask of a component. It is input from outside the engine, so it is checked. */
const componentAction = z.discriminatedUnion("do", [
  z.strictObject({ do: z.literal("order"), order: z.array(z.string().max(32)).max(20) }),
  z.strictObject({ do: z.literal("match"), pairs: z.record(z.string().max(32), z.string().max(32)) }),
  z.strictObject({ do: z.literal("fill"), answers: z.array(z.string().max(400)).max(8) }),
  z.strictObject({ do: z.literal("hint") }),
  z.strictObject({ do: z.literal("reveal"), prediction: z.string().max(4000).optional() }),
  z.strictObject({ do: z.literal("flip") }),
  z.strictObject({ do: z.literal("rate"), rating: z.enum(["again", "hard", "good", "easy"]) }),
  z.strictObject({ do: z.literal("report"), problem: z.string().max(500) }),
]) satisfies z.ZodType<ComponentAction>;

const DONT_KNOW = (text: string) => text === "" || /^(i\s+)?(do\s*n[o']?t|dunno)\s+know\.?$/i.test(text) || /^(no idea|not sure|\?)\.?$/i.test(text);

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const shortId = (): string => crypto.randomUUID().slice(0, 8);

const projectShape = { title: z.string(), brief: z.string().describe("Markdown. What to build or do, and why it matters for the learner's goal."), deliverables: z.array(z.string()) };

/** The outline the planner saves first: the course without lesson plans. */
const outlineModule = moduleSchema.extend({ objectives: z.array(objectiveSchema.omit({ lesson: true })).min(1).max(40) });

function findObjective(content: CourseDoc | undefined, id: string | undefined): Objective | undefined {
  return id ? allObjectives(content).find((o) => o.id === id) : undefined;
}

function findCheck(content: CourseDoc | undefined, checkId: string): { objective: Objective; check: Check } | undefined {
  for (const objective of allObjectives(content)) {
    const check = objective.lesson.checks.find((c) => c.id === checkId);
    if (check) return { objective, check };
  }
  return undefined;
}

export class Session {
  readonly history: SessionEvent[];
  busy = false;
  ended = false;

  private input = new AsyncQueue<SDKUserMessage>();
  private keys = new Map<string, AnswerKey>();
  private components = new Map<string, ShownState>();
  private pictures?: ImageLibrary;
  private run?: Query;
  private closing: { summary?: string; nextStep?: string } | undefined;
  /** Once a question is on screen, anything the model says in the same turn would only repeat it, so it is dropped. */
  private questionShownThisTurn = false;
  /** Intents of the material shown since the last answer: recorded with the answer, so the profile can tell what helps. */
  private presented = new Set<BlockIntent>();
  private askedChecks = new Set<string>();
  private askedBlocks = new Set<string>();
  private readonly startedAt: number;

  constructor(
    readonly id: string,
    readonly courseId: string,
    readonly kind: SessionKind,
    private readonly push: (event: SessionEvent) => void,
    private readonly coursesChanged: () => void,
    history: SessionEvent[] = [],
    private readonly profileChanged: () => void = () => undefined,
  ) {
    this.history = history;
    const stamp = Number(/^lesson-(\d+)$/.exec(id)?.[1]);
    this.startedAt = Number.isFinite(stamp) ? stamp : Date.now();
  }

  /** The pictures this session has found and may show. */
  private get library(): ImageLibrary {
    this.pictures ??= new ImageLibrary(this.courseId);
    return this.pictures;
  }

  info(): SessionInfo {
    return { sessionId: this.id, courseId: this.courseId, kind: this.kind, busy: this.busy, ended: this.ended, history: this.history };
  }

  /** Starts the agent. With `resume`, picks the earlier conversation back up and waits for the learner. */
  start(resume?: string): void {
    const settings = store.settings();
    const progress = store.progress(this.courseId);
    const learner = store.learner();
    const sloo = store.sloo();
    const now = new Date();

    let systemPrompt: string;
    if (this.kind === "interview") systemPrompt = interviewPrompt(progress.topic, learner, sloo);
    else if (this.kind === "planning") systemPrompt = planningPrompt(progress, learner);
    else {
      const content = store.content(this.courseId);
      if (!content) throw new Error("This course has no content yet.");
      systemPrompt = lessonPrompt(progress, content, learner, sloo, progress.reviewCards, now);
    }

    const tools = this.tools();
    const builtins = this.kind === "planning" ? ["WebSearch", "WebFetch"] : [];

    this.run = query({
      prompt: this.input,
      options: {
        ...baseOptions(settings, courseDir(this.courseId)),
        model: this.kind === "planning" ? settings.models.planner : settings.models.tutor,
        systemPrompt,
        tools: builtins,
        mcpServers: { sloodle: createSdkMcpServer({ name: "sloodle", version: "0.2.0", tools }) },
        allowedTools: [...builtins, ...tools.map((t) => `mcp__sloodle__${t.name}`)],
        includePartialMessages: true,
        ...(resume ? { resume } : {}),
      },
    });
    void this.loop(this.run);

    if (resume) return;
    const kickoff =
      this.kind === "interview"
        ? `(The learner just opened the app and typed what they want to learn: "${progress.topic}". Greet them in one sentence and begin.)`
        : this.kind === "planning"
          ? "Research and build the course now."
          : "(The learner just started a session. Begin.)";
    this.toModel(kickoff);
  }

  send(text: string): void {
    if (this.ended) throw new Error("This session has ended.");
    this.emit({ t: "user", text });
    this.toModel(text);
  }

  hint(questionId: string): void {
    const key = this.openQuestion(questionId);
    const text = key.hints[key.hintsShown];
    if (text === undefined) throw new Error("No more hints for this question.");
    this.emit({ t: "hint", questionId, index: key.hintsShown, text });
    key.hintsShown += 1;
    if (this.kind === "lesson") recordActivity({ type: "hint", courseId: this.courseId, sessionId: this.id, questionId, index: key.hintsShown - 1 });
  }

  async answer(questionId: string, answer: string | number, confidence?: number): Promise<void> {
    const key = this.openQuestion(questionId);
    key.answered = true;
    this.busy = true;
    try {
      const content = this.kind === "lesson" ? store.content(this.courseId) : undefined;
      const objective = findObjective(content, key.question.objectiveId);
      const { result, note, misconception } = await this.grade(key, answer, objective?.lesson.misconceptions ?? []);
      this.emit({ t: "graded", result });
      const rating = confidence === 1 || confidence === 2 || confidence === 3 ? confidence : undefined;

      this.recordWork({
        questionId,
        objectiveId: objective?.id,
        checkId: key.checkId,
        kind: key.question.kind,
        score: result.score,
        hintsUsed: key.hintsShown,
        hintsAvailable: key.hints.length,
        confidence: rating,
        shownAt: key.shownAt,
        note,
        misconceptions: misconception ? [{ id: misconception.id, label: misconception.belief }] : [],
      });

      const sure = rating === 3 ? "certain" : rating === 2 ? "fairly sure" : rating === 1 ? "guessing" : undefined;
      const calibration =
        sure === "certain" && result.verdict === "incorrect"
          ? " The learner was certain and wrong: this is a firm misconception, so address it directly."
          : sure === "guessing" && result.verdict === "correct"
            ? " The learner was guessing and right: confirm they can explain why before moving on."
            : "";
      const keyLine = key.checkId ? `\nAnswer key (from the course plan; now that they have answered you may use it): ${key.answerKey}` : "";
      const misconceptionLine = misconception ? `\nThe answer shows the known misconception [${misconception.id}]: ${misconception.belief} Correction: ${misconception.correction}` : "";
      this.toModel(
        `[Answer to question ${questionId}]\nLearner's answer: ${result.learnerAnswer}\nGrade: ${result.verdict} (score ${result.score.toFixed(2)}). ${note}\nHints used: ${key.hintsShown}.${sure ? ` Learner said they were ${sure}.` : ""}${calibration}${misconceptionLine}${keyLine}`,
      );
    } catch (error) {
      key.answered = false;
      this.busy = false;
      this.emit({ t: "error", message: messageOf(error) });
    }
  }

  /** The learner's work on a lesson component: an answer, a hint, a step, a flip, or a report that it failed to show. */
  async component(componentId: string, input: unknown): Promise<void> {
    const state = this.components.get(componentId);
    if (!state) throw new Error("That is no longer open. Ask the tutor to show it again.");
    const action = componentAction.parse(input);
    const { block, view } = state;
    const name = `${catalogue[typeOf(block)].label.toLowerCase()} ${componentId}${view.blockId ? ` (plan block ${view.blockId})` : ""}`;

    if (action.do === "report") {
      if (state.reported || (block.type !== "diagram" && block.type !== "code")) return;
      state.reported = true;
      this.update_(componentId, { kind: "reported", problem: action.problem });
      this.toModel(
        `[The ${name} could not be shown: ${action.problem.slice(0, 300)}]\nThe learner sees its text description instead. If the picture matters, show a simpler one with ${catalogue[typeOf(block)].tool}; otherwise carry on. Do not mention the error unless they ask.`,
      );
      return;
    }
    if (state.done) throw new Error("That one is finished.");
    if (state.pending) throw new Error("Still checking the last answer.");

    if (action.do === "hint") {
      if (!("hints" in block)) throw new Error("This has no hints.");
      const text = block.hints[state.hintsShown];
      if (text === undefined) throw new Error("No more hints for this one.");
      this.update_(componentId, { kind: "hint", index: state.hintsShown, text });
      state.hintsShown += 1;
      if (this.kind === "lesson") recordActivity({ type: "hint", courseId: this.courseId, sessionId: this.id, questionId: componentId, index: state.hintsShown - 1 });
      return;
    }

    if (action.do === "order" || action.do === "match" || action.do === "fill") {
      let result: ComponentResult;
      if (action.do === "order" && block.type === "ordering") result = gradeOrdering(state.secret.order!, action.order, block.explanation);
      else if (action.do === "match" && block.type === "matching") result = gradeMatching({ pairs: state.secret.pairs!, texts: state.secret.texts! }, action.pairs);
      else if (action.do === "fill" && block.type === "blanks") result = gradeBlanks(block, action.answers);
      else throw new Error("That answer does not fit this component.");
      state.done = true;
      this.update_(componentId, { kind: "graded", result });
      const kind = catalogue[typeOf(block)].evidence!;
      this.recordWork({ questionId: componentId, objectiveId: view.objectiveId, blockId: view.blockId, kind, component: typeOf(block), score: result.score, hintsUsed: state.hintsShown, hintsAvailable: "hints" in block ? block.hints.length : 0, shownAt: state.shownAt, note: result.verdict });
      const weak =
        kind === "blanks"
          ? ""
          : result.verdict === "correct"
            ? "\nThis is recognition, so it does not count toward mastery on its own: before moving on, have them say why, or ask a question they answer in their own words."
            : "";
      const why = block.type === "ordering" && block.explanation ? `\nWhy this order (from the plan; the learner now sees it): ${block.explanation}` : "";
      this.toModel(`[Result of ${name}]\n${describeResult(view, result, state.secret)}\nGrade: ${result.verdict} (score ${result.score.toFixed(2)}). Hints used: ${state.hintsShown}.${weak}${why}`);
      return;
    }

    if (action.do === "reveal") {
      if (block.type !== "steps") throw new Error("Only a worked example has steps to reveal.");
      const index = state.revealed;
      const step = block.steps[index]!;
      let prediction: ShownState["predictions"][number] | undefined;
      if (step.predict) {
        const answer = (action.prediction ?? "").trim();
        if (!answer) throw new Error("Write what you predict first, or say you don't know.");
        state.pending = true;
        try {
          const graded = DONT_KNOW(answer)
            ? { score: 0, note: "The learner said they do not know." }
            : await gradeFreeResponse(store.settings(), courseDir(this.courseId), {
                prompt: `A worked example, revealed one step at a time.\nProblem: ${block.prompt}\nSteps so far:\n${block.steps.slice(0, index).map((s, i) => `${i + 1}. ${s.text}`).join("\n") || "(none yet)"}\n\nBefore seeing step ${index + 1}, the learner was asked: ${step.predict}`,
                answerKey: step.text,
                rubric: "Full credit if the prediction takes essentially this step, in any wording. Partial if it heads the right way with a real gap. A prediction is made before the step is taught, so judge the idea, not the polish.",
                answer,
              });
          prediction = { step: index, answer, score: graded.score, verdict: verdictOf(graded.score), note: graded.note };
        } finally {
          state.pending = false;
        }
        state.predictions.push(prediction);
        this.recordWork({ questionId: `${componentId}-${index + 1}`, objectiveId: view.objectiveId, blockId: view.blockId, kind: "prediction", component: "steps", score: prediction.score, hintsUsed: 0, hintsAvailable: 0, shownAt: state.shownAt, note: prediction.note });
      }
      state.revealed += 1;
      this.update_(componentId, { kind: "step", index, text: step.text, prediction: prediction && { answer: prediction.answer, verdict: prediction.verdict, score: prediction.score } });
      if (state.revealed < block.steps.length) return;
      state.done = true;
      const lines = block.steps.map((s, i) => {
        const p = state.predictions.find((x) => x.step === i);
        return `${i + 1}. ${s.text}${p ? `\n   Before it they predicted: "${p.answer}". ${p.verdict} (${p.score.toFixed(2)}): ${p.note}` : ""}`;
      });
      this.toModel(
        `[The learner has worked through ${name}]\nProblem: ${block.prompt}\n${lines.join("\n")}\nPredictions are learning moves, not tests: they never count toward mastery. Pick up on any prediction that went wrong, then give them a problem of the same shape to solve alone.`,
      );
      return;
    }

    if (block.type !== "flashcard") throw new Error("Only a flashcard can be flipped or rated.");
    if (action.do === "flip") {
      if (state.flipped) return;
      state.flipped = true;
      this.update_(componentId, { kind: "flipped", back: block.back });
      return;
    }
    if (!state.flipped) throw new Error("Flip the card before rating it.");
    state.done = true;
    const score = flashcardScore[action.rating];
    this.update_(componentId, { kind: "rated", rating: action.rating });
    this.recordWork({ questionId: componentId, objectiveId: view.objectiveId, blockId: view.blockId, kind: "flashcard", component: "flashcard", score, hintsUsed: 0, hintsAvailable: 0, shownAt: state.shownAt, note: `Self-rated ${action.rating}.` });
    this.toModel(`[Flashcard ${componentId} rated]\nFront: ${block.front}\nBack: ${block.back}\nThe learner rated their recall "${action.rating}". This is their own say-so, so it never counts toward mastery; if it matters, check it with a question.`);
  }

  async interrupt(): Promise<void> {
    await this.run?.interrupt();
  }

  dispose(): void {
    this.ended = true;
    this.input.close();
    this.run?.close();
  }

  private openQuestion(questionId: string): AnswerKey {
    const key = this.keys.get(questionId);
    if (!key) throw new Error("That question is no longer open. Ask the tutor to repeat it.");
    if (key.answered) throw new Error("That question was already answered.");
    return key;
  }

  private async grade(key: AnswerKey, answer: string | number, misconceptions: Misconception[]): Promise<{ result: GradeResult; note: string; misconception?: Misconception }> {
    const { question } = key;
    const done = (score: number, learnerAnswer: string, note: string, misconceptionId?: string | null) => ({
      result: { questionId: question.id, score, learnerAnswer, verdict: score >= 0.8 ? "correct" : score >= 0.4 ? "partial" : "incorrect" } as GradeResult,
      note,
      misconception: score < 0.8 && misconceptionId ? misconceptions.find((m) => m.id === misconceptionId) : undefined,
    });

    if (question.kind === "choice") {
      const index = Number(answer);
      const chosen = question.options?.[index] ?? String(answer);
      const right = index === key.correctOption;
      return done(
        right ? 1 : 0,
        chosen,
        right
          ? `Chose the right option. With ${question.options?.length ?? 4} options this may be a guess, and it says nothing about any idea the options did not turn on: confirm by asking why before treating it as known.`
          : `The right option was "${question.options?.[key.correctOption ?? -1]}".`,
        key.optionMisconceptions?.[index],
      );
    }

    const text = String(answer).trim();
    if (text === "" || /^(i\s+)?(do\s*n[o']?t|dunno)\s+know\.?$/i.test(text) || /^(no idea|not sure|\?)\.?$/i.test(text)) {
      return done(0, text || "(no answer)", "The learner said they do not know.");
    }

    if (question.kind === "numeric" && key.numericAnswer !== undefined) {
      const value = Number(text.replace(/,/g, "").match(/-?\d+(\.\d+)?(e-?\d+)?/i)?.[0]);
      const tolerance = key.tolerance ?? Math.abs(key.numericAnswer) * 1e-6;
      const right = Number.isFinite(value) && Math.abs(value - key.numericAnswer) <= tolerance;
      return done(right ? 1 : 0, text, right ? "Numerically correct." : `Expected ${key.numericAnswer}.`);
    }

    const verdict = await gradeFreeResponse(store.settings(), courseDir(this.courseId), {
      prompt: question.prompt,
      answerKey: key.answerKey,
      rubric: key.rubric,
      answer: text,
      misconceptions: misconceptions.map((m) => ({ id: m.id, belief: m.belief })),
    });
    return done(verdict.score, text, verdict.note, verdict.misconceptionId);
  }

  private update_(id: string, update: ComponentUpdate): void {
    this.emit({ t: "component_update", id, update });
  }

  /** Records an answer or other graded work: mastery evidence for its objective and an event in the activity log. */
  private recordWork(work: {
    questionId: string;
    objectiveId?: string;
    checkId?: string;
    blockId?: string;
    kind: AnswerKind;
    component?: ComponentType;
    score: number;
    hintsUsed: number;
    hintsAvailable: number;
    confidence?: 1 | 2 | 3;
    shownAt: number;
    note: string;
    misconceptions?: { id: string; label: string }[];
  }): void {
    if (this.kind !== "lesson") return;
    const at = new Date();
    const objective = findObjective(store.content(this.courseId), work.objectiveId);
    if (objective) {
      const progress = store.progress(this.courseId);
      progress.objectiveStates[objective.id] = applyEvidence(progress.objectiveStates[objective.id], {
        at: at.toISOString(),
        score: work.score,
        hintsUsed: work.hintsUsed,
        kind: work.kind,
        confidence: work.confidence,
        note: work.note,
      });
      store.saveProgress(progress);
      this.emit({ t: "course" });
    }
    recordActivity(
      {
        type: "answer",
        courseId: this.courseId,
        sessionId: this.id,
        questionId: work.questionId,
        objectiveId: objective?.id,
        checkId: work.checkId,
        blockId: work.blockId,
        kind: work.kind,
        component: work.component,
        score: work.score,
        hintsUsed: work.hintsUsed,
        hintsAvailable: work.hintsAvailable,
        confidence: work.confidence,
        secondsToAnswer: Math.round((at.getTime() - work.shownAt) / 1000),
        presented: [...this.presented],
        misconceptions: work.misconceptions ?? [],
      },
      at,
    );
    this.presented.clear();
    this.profileChanged();
  }

  /** Whether the learner still owes an answer: an open question, or a component the tutor is waiting on. */
  private waiting(): boolean {
    for (const open of this.keys.values()) if (!open.answered) return true;
    for (const shown of this.components.values()) if (catalogue[typeOf(shown.block)].awaits && !shown.done) return true;
    return false;
  }

  /** Puts a component on screen. The block is already validated; answers stay here. */
  private putComponent(block: LessonBlock, meta: { objectiveId?: string; blockId?: string; title?: string }): ToolResult {
    const type = typeOf(block);
    const info = catalogue[type];
    if (info.awaits && this.waiting()) return fail("Something is already waiting for the learner. End your turn and wait for it.");
    const { view, secret } = present(block, { id: shortId(), courseId: this.courseId, ...meta });
    this.components.set(view.id, { view, block, secret, hintsShown: 0, revealed: 0, predictions: [], flipped: false, done: false, pending: false, reported: false, shownAt: Date.now() });
    // Material counts toward "what was shown before an answer"; work the learner does is the answer itself.
    if (!info.evidence || type === "steps") this.presented.add(block.intent);
    this.emit({ t: "component", component: view });
    if (!info.awaits) return ok("Shown. It stays visible while you talk about it.");
    this.questionShownThisTurn = true;
    return ok(`The ${info.label.toLowerCase()} ${view.id} is on screen. Write nothing more: the learner already sees it. End your turn now; the result comes back to you as the next message.`);
  }

  private toModel(text: string): void {
    this.busy = true;
    this.input.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null } as SDKUserMessage);
  }

  private emit(event: SessionEvent): void {
    if (event.t !== "delta") {
      this.history.push(event);
      store.appendSessionEvent(this.courseId, this.id, event);
    }
    this.push(event);
  }

  private async loop(run: Query): Promise<void> {
    try {
      for await (const message of run) {
        if (message.type === "stream_event") {
          const event = message.event;
          if (!this.questionShownThisTurn && !message.parent_tool_use_id && event.type === "content_block_delta" && event.delta.type === "text_delta") {
            this.emit({ t: "delta", text: event.delta.text });
          }
        } else if (message.type === "assistant") {
          if (message.error) this.emit({ t: "error", message: describeApiError(message.error) });
          for (const block of message.message.content) {
            if (block.type === "text" && block.text.trim() && !this.questionShownThisTurn) this.emit({ t: "message", text: block.text });
            else if (block.type === "tool_use") this.announce(block.name, block.input as Record<string, unknown>);
          }
        } else if (message.type === "result") {
          this.rememberSdkSession(message.session_id);
          if (message.subtype !== "success") this.emit({ t: "error", message: `The model stopped early (${message.subtype}).` });
          this.busy = false;
          this.questionShownThisTurn = false;
          this.emit({ t: "turn_end" });
          this.afterTurn();
        }
      }
    } catch (error) {
      if (!this.ended) {
        this.busy = false;
        this.emit({ t: "error", message: messageOf(error) });
        this.emit({ t: "turn_end" });
      }
    }
  }

  private announce(name: string, input: Record<string, unknown>): void {
    if (name === "WebSearch") this.emit({ t: "activity", label: "Searching", detail: String(input.query ?? "") });
    else if (name === "WebFetch") this.emit({ t: "activity", label: "Reading", detail: String(input.url ?? "") });
    else if (name.endsWith("save_course_outline")) this.emit({ t: "activity", label: "Laying out your course" });
    else if (name.endsWith("save_lesson_plans")) this.emit({ t: "activity", label: "Writing lesson plans", detail: String(input.moduleId ?? "") });
    else if (name.endsWith("finish_course")) this.emit({ t: "activity", label: "Checking the course" });
    else if (name.endsWith("find_images") && this.kind === "planning") this.emit({ t: "activity", label: "Finding pictures", detail: String(input.query ?? "") });
  }

  private rememberSdkSession(sdkId: string): void {
    const progress = store.progress(this.courseId);
    if (progress.sdkSessions[this.id] === sdkId) return;
    progress.sdkSessions[this.id] = sdkId;
    store.saveProgress(progress);
  }

  private afterTurn(): void {
    const progress = store.progress(this.courseId);
    const finished =
      (this.kind === "interview" && progress.phase !== "interview") ||
      (this.kind === "planning" && progress.phase === "ready") ||
      (this.kind === "lesson" && this.closing !== undefined);

    if (this.kind === "planning" && !finished) {
      this.emit({ t: "error", message: "The course was not saved. Try building it again." });
    }
    if (!finished && this.kind !== "planning") return;

    if (this.kind === "lesson" && progress.activeLesson === this.id) {
      progress.activeLesson = undefined;
      store.saveProgress(progress);
    }
    this.emit({ t: "ended", ...this.closing });
    this.dispose();
    this.coursesChanged();
    if (finished && this.kind !== "planning") this.sessionEnded();
  }

  /** Records the session in the activity log, then lets the reflection step update Sloo in the background. */
  private sessionEnded(): void {
    const minutes = Math.round((Date.now() - this.startedAt) / 6000) / 10;
    recordActivity({ type: "session_end", courseId: this.courseId, sessionId: this.id, kind: this.kind, startedAt: new Date(this.startedAt).toISOString(), ...(minutes <= 240 ? { minutes } : {}) });
    this.profileChanged();
    reflectOnSession(this.courseId, this.id, this.history).then(
      (changes) => {
        if (changes.length) this.profileChanged();
      },
      (error) => console.error(`sloodle: reflection on ${this.id} failed: ${messageOf(error)}`),
    );
  }

  private update(change: (progress: Progress) => void): void {
    const progress = store.progress(this.courseId);
    change(progress);
    store.saveProgress(progress);
    this.emit({ t: "course" });
    this.coursesChanged();
  }

  private putQuestion(key: Omit<AnswerKey, "hintsShown" | "answered" | "shownAt">): ToolResult {
    if (this.waiting()) return fail("Something is already waiting for the learner's answer. End your turn and wait.");
    this.keys.set(key.question.id, { ...key, hintsShown: 0, answered: false, shownAt: Date.now() });
    this.questionShownThisTurn = true;
    this.emit({ t: "question", question: key.question });
    return ok(`Question ${key.question.id} is on screen. Write nothing more: the learner already sees it. End your turn now and wait for the graded answer.`);
  }

  private tools() {
    const recordObservation = tool(
      "record_observation",
      "Save one durable fact about the learner that should shape future teaching: a preference, a recurring misconception, a strength, a struggle, their context, or what motivates them. One fact per call, written so it makes sense on its own months later.",
      {
        category: z.enum(["preference", "misconception", "strength", "struggle", "context", "motivation"]),
        text: z.string().max(600),
        applies_to_this_course_only: z.boolean().default(false),
      },
      async (args) => {
        const learner = store.learner();
        const note: LearnerNote = {
          id: shortId(),
          at: new Date().toISOString(),
          source: this.kind === "interview" ? "interview" : "tutor",
          category: args.category,
          text: args.text,
        };
        if (args.applies_to_this_course_only) note.courseId = this.courseId;
        learner.notes.push(note);
        learner.notes = learner.notes.slice(-150);
        store.saveLearner(learner);
        this.profileChanged();
        return ok("Saved.");
      },
    );

    const askQuestion = tool(
      "ask_question",
      "Put one question you wrote yourself on the learner's screen and record their answer. Prefer ask_planned_question when the lesson plan has a fitting check. Each question tests exactly one idea. The answer is graded against your key by a separate strict grader and comes back to you as the next message. After calling this, end your turn without further text. Never put the answer in the prompt, options order, or hints.",
      {
        objective_id: z.string().optional().describe("The curriculum objective this checks. Omit during the first interview."),
        kind: z.enum(["choice", "short", "explain", "numeric"]).describe("choice = multiple choice; short = a few words or one sentence; explain = the learner explains in their own words; numeric = a number."),
        prompt: z.string().describe("Markdown shown to the learner. Only the question itself, self-contained. Feedback on an earlier answer belongs in your reply before this call, never in the prompt."),
        options: z.array(z.string()).min(2).max(6).optional().describe("For choice only. Distractors should be the answers real misconceptions produce."),
        correct_option: z.number().int().min(0).optional().describe("For choice only: zero-based index of the right option. Vary its position."),
        numeric_answer: z.number().optional().describe("For numeric only."),
        tolerance: z.number().min(0).optional().describe("For numeric only: accepted absolute error."),
        answer_key: z.string().describe("The complete correct answer, as you would want a strong learner to give it."),
        rubric: z.string().optional().describe("For short and explain: what an answer must contain for full credit, and what counts as partial."),
        hints: z.array(z.string()).max(3).default([]).describe("Up to three hints from gentle to pointed, shown one at a time if the learner asks. A hint guides thinking and never states the answer."),
      },
      async (args) => {
        if (args.kind === "choice") {
          if (!args.options || args.correct_option === undefined || args.correct_option >= args.options.length) {
            return fail("A choice question needs options and a valid correct_option index.");
          }
        }
        if (args.kind === "numeric" && args.numeric_answer === undefined) return fail("A numeric question needs numeric_answer.");
        return this.putQuestion({
          question: {
            id: shortId(),
            objectiveId: args.objective_id,
            kind: args.kind,
            prompt: args.prompt,
            options: args.kind === "choice" ? args.options : undefined,
            hintCount: args.hints.length,
          },
          correctOption: args.correct_option,
          numericAnswer: args.numeric_answer,
          tolerance: args.tolerance,
          answerKey: args.answer_key,
          rubric: args.rubric,
          hints: args.hints,
        });
      },
    );

    const findImages = tool(
      "find_images",
      "Search Wikimedia Commons for real, openly licensed pictures. Returns up to six results, each with an id, the file's title and description, its size, licence and author. You cannot see the pictures: choose by title and description, and prefer the one whose description says it shows exactly the thing. Search in English with specific names (\"Rider-Waite The Fool\", \"human heart anterior view\", \"Mona Lisa\", \"Monstera deliciosa leaf\"). Only ids from these results can be shown.",
      {
        query: z.string().min(2).max(200).describe("What the picture shows, in a few specific words."),
        limit: z.number().int().min(1).max(8).default(6),
      },
      async (args) => {
        let results;
        try {
          results = await this.library.find(args.query, args.limit);
        } catch (error) {
          return fail(`Could not search for pictures just now (${messageOf(error)}). Carry on without one, and do not describe a picture you have not shown.`);
        }
        if (results.length === 0) return ok(`No openly licensed pictures matched "${args.query}". Try fewer or more common words, or the English name. If none fits, use words or a diagram instead.`);
        const use = this.kind === "planning" ? 'put a chosen id in an image block: {"type": "image", "images": [{"image": "<id>", "alt": "..."}]}. The engine downloads it and fills in the credit when you save the plan' : "show a chosen id with show_image";
        return ok(`${results.map(describeCandidate).join("\n")}\n\nTo use one, ${use}. Write alt text from the description, not from imagination: you have not seen the picture.`);
      },
    );

    const showImage = tool(
      "show_image",
      `Put a picture from find_images on the learner's screen, or up to six side by side to compare. Worth using ${catalogue.image.when} It stays visible while you talk about it. Prefer show_block when the lesson plan has a fitting picture.`,
      {
        images: z
          .array(z.strictObject({ image: z.string().describe("An id from find_images."), alt: z.string().min(3).max(400).describe("What it shows, for someone who cannot see it, from the result's description."), caption: z.string().max(200).optional() }))
          .min(1)
          .max(6),
        caption: z.string().max(2000).optional().describe("Under the whole block: what to look at and why."),
        title: z.string().max(200).optional(),
        intent: z.enum(blockIntents).default("visual"),
        objective_id: z.string().optional(),
      },
      async (args) => {
        const parsed = blockSchema.safeParse({ id: "improvised", type: "image", intent: args.intent, title: args.title, caption: args.caption, images: args.images });
        if (!parsed.success) return fail(`Not shown. Fix these and call show_image again:\n- ${parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "image"}: ${i.message}`).join("\n- ")}`);
        const { problems, used } = await this.library.attach([parsed.data]);
        problems.push(...blockProblems(parsed.data, "This picture block"));
        if (problems.length) return fail(`Not shown:\n- ${problems.join("\n- ")}`);
        const objective = findObjective(store.content(this.courseId), args.objective_id);
        const result = this.putComponent(parsed.data, { objectiveId: objective?.id });
        if (!result.isError) result.content[0]!.text += `\n${pictureNotes(used)}`;
        return result;
      },
    );

    if (this.kind === "interview") {
      const saveGoalBrief = tool(
        "save_goal_brief",
        "Save what you learned in the interview. Call once, after the learner has confirmed your summary.",
        {
          target_performance: z.string().describe("What the learner will be able to do, in which situation, and how they will know."),
          motivation: z.string().describe("Their own reasons, in their words where possible."),
          use_context: z.string().describe("The real situation where they will use this."),
          deadline: z.string().optional(),
          minutes_per_session: z.number().int().min(5).max(180),
          sessions_per_week: z.number().min(1).max(14),
          study_cue: z.string().optional().describe("When and where they said they will study."),
          prior_knowledge: z.string().describe("Their measured starting level, from the diagnostic, not their self-rating."),
          prior_attempts: z.string().optional().describe("What they tried before and why it stalled."),
          format_preferences: z.array(z.string()),
          constraints: z.string().optional(),
          diagnostic_findings: z.array(z.string()).describe("One line per diagnostic question: what it tested and what the answer showed, including misconceptions."),
        },
        async (args) => {
          this.update((progress) => {
            progress.brief = {
              topic: progress.topic,
              targetPerformance: args.target_performance,
              motivation: args.motivation,
              useContext: args.use_context,
              deadline: args.deadline,
              minutesPerSession: args.minutes_per_session,
              sessionsPerWeek: args.sessions_per_week,
              studyCue: args.study_cue,
              priorKnowledge: args.prior_knowledge,
              priorAttempts: args.prior_attempts,
              formatPreferences: args.format_preferences,
              constraints: args.constraints,
              diagnosticFindings: args.diagnostic_findings,
            };
            progress.phase = "planning";
          });
          // Stated preferences belong to the person, not only to this course.
          const learner = store.learner();
          const known = new Set(learner.stated.preferences.map((p) => p.text.toLowerCase()));
          for (const text of args.format_preferences) {
            if (!known.has(text.toLowerCase())) learner.stated.preferences.push({ id: shortId(), text, at: new Date().toISOString(), source: "interview", courseId: this.courseId });
          }
          store.saveLearner(learner);
          return ok("Saved. Tell the learner in one short sentence that you will now research and build their course.");
        },
      );
      return [askQuestion, recordObservation, saveGoalBrief];
    }

    if (this.kind === "planning") {
      const saveOutline = tool(
        "save_course_outline",
        "Save the course outline: metadata, modules, objectives with prerequisites, and sources. Lesson plans come next with save_lesson_plans. Calling it again replaces the outline and keeps plans for objectives whose ids did not change.",
        {
          title: z.string().max(200),
          subject: z.string().max(200).describe("The subject in a few words."),
          summary: z.string().max(2000).describe("Two or three sentences to a learner: where this course takes them and how."),
          audience: z.string().max(2000).describe("Who the course is for: starting level and kind of goal. No personal details."),
          language: z.string().max(35).default("en"),
          estimatedHours: z.number().positive().max(10000).optional(),
          tags: z.array(z.string().max(60)).max(20).default([]),
          modules: z.array(outlineModule).min(1).max(40),
          sources: z.array(sourceSchema).max(100),
        },
        async (args) => {
          const previous = store.content(this.courseId);
          const plans = new Map(allObjectives(previous).map((o) => [o.id, o.lesson]));
          const doc: CourseDoc = {
            format: COURSE_FORMAT,
            version: COURSE_VERSION,
            id: this.courseId,
            createdAt: previous?.createdAt ?? new Date().toISOString(),
            title: args.title,
            subject: args.subject,
            summary: args.summary,
            audience: args.audience,
            language: args.language,
            estimatedHours: args.estimatedHours,
            tags: args.tags,
            sources: args.sources,
            modules: args.modules.map((m) => ({
              ...m,
              objectives: m.objectives.map((o) => ({ ...o, lesson: plans.get(o.id) ?? lessonPlanSchema.parse({}) })),
            })),
          };
          const problems = courseProblems(doc);
          if (problems.length) return fail(`Fix these and call save_course_outline again:\n- ${problems.join("\n- ")}`);
          store.saveContent(doc);
          return ok(`Outline saved: ${doc.modules.length} modules, ${allObjectives(doc).length} objectives. Now call save_lesson_plans once per module.`);
        },
      );

      const saveLessonPlans = tool(
        "save_lesson_plans",
        "Save the lesson plans for the objectives of one module. Replaces any earlier plans for those objectives.",
        {
          moduleId: idSchema,
          plans: z.array(lessonPlanSchema.extend({ objectiveId: idSchema })).min(1).max(40),
        },
        async (args) => {
          const doc = store.content(this.courseId);
          if (!doc) return fail("Save the outline first with save_course_outline.");
          const module = doc.modules.find((m) => m.id === args.moduleId);
          if (!module) return fail(`There is no module "${args.moduleId}". Modules: ${doc.modules.map((m) => m.id).join(", ")}.`);
          const unknown: string[] = [];
          for (const { objectiveId, ...plan } of args.plans) {
            const objective = module.objectives.find((o) => o.id === objectiveId);
            if (!objective) unknown.push(objectiveId);
            else objective.lesson = lessonPlanSchema.parse(plan);
          }
          if (unknown.length) return fail(`These objectives are not in module ${module.id}: ${unknown.join(", ")}. Its objectives are: ${module.objectives.map((o) => o.id).join(", ")}.`);
          const pictures = await this.library.attach(module.objectives.flatMap((o) => o.lesson.blocks));
          if (pictures.problems.length) return fail(`Nothing was saved. These pictures could not be used; pick other find_images results or drop the block, then call save_lesson_plans again:\n- ${pictures.problems.join("\n- ")}`);
          const problems = courseProblems(doc);
          if (problems.length) return fail(`Nothing was saved. Fix these and call save_lesson_plans again:\n- ${problems.join("\n- ")}`);
          store.saveContent(doc);
          const gaps = module.objectives.flatMap(planGaps);
          return ok(gaps.length ? `Saved, but these plans are still thin:\n- ${gaps.join("\n- ")}` : `Saved plans for module ${module.id}.`);
        },
      );

      const finishCourse = tool("finish_course", "Check the whole course and mark it ready to teach. Call once every module has its lesson plans.", {}, async () => {
        const doc = store.content(this.courseId);
        if (!doc) return fail("Save the outline first with save_course_outline.");
        const problems = [...courseProblems(doc), ...allObjectives(doc).flatMap(planGaps)];
        if (problems.length) return fail(`Not ready yet. Fix these with save_lesson_plans, then call finish_course again:\n- ${problems.slice(0, 30).join("\n- ")}`);
        this.update((progress) => {
          progress.phase = "ready";
        });
        return ok("The course is ready.");
      });
      return [saveOutline, findImages, saveLessonPlans, finishCourse];
    }

    const intentParam = z.enum(blockIntents);

    const showBlock = tool(
      "show_block",
      "Put one block of the lesson plan on the learner's screen. A text block can be shown as written or in your own adapted wording (for this learner's level, interests or goal). Diagrams, code, tables, callouts and pictures stay visible while you talk about them. Orderings, matchings, fill-in-the-blanks, worked examples and flashcards are work for the learner: the engine keeps their answers, and the result comes back to you as the next message, so end your turn after showing one.",
      {
        block_id: z.string(),
        adapted_markdown: z.string().max(6000).optional().describe("Text blocks only: your adapted version. Omit to show the block as written."),
        title: z.string().max(200).optional(),
      },
      async (args) => {
        const content = store.content(this.courseId);
        for (const objective of allObjectives(content)) {
          const block = objective.lesson.blocks.find((b) => b.id === args.block_id);
          if (!block) continue;
          if (isMarkdownBlock(block)) {
            this.presented.add(block.intent);
            this.emit({ t: "content", id: shortId(), title: args.title ?? block.title ?? objective.statement, markdown: args.adapted_markdown ?? block.body, intent: block.intent });
            return ok(block.checkId ? `Shown. This block leads into check ${block.checkId}: put it with ask_planned_question when the learner is ready.` : "Shown.");
          }
          const info = catalogue[typeOf(block)];
          if (info.evidence && this.askedBlocks.has(block.id)) return fail(`The learner already did block ${block.id} this session. Use another block, or make a fresh one with ${info.tool}.`);
          const result = this.putComponent(block, { objectiveId: objective.id, blockId: block.id, title: args.title ?? block.title });
          if (!result.isError && info.evidence) this.askedBlocks.add(block.id);
          if (!result.isError && args.adapted_markdown) result.content[0]!.text += " (adapted_markdown only applies to text blocks, so it was shown as written.)";
          if (!result.isError && block.type === "image") {
            const known = block.images.flatMap((i) => cachedImage(this.courseId, i.image) ?? []);
            if (known.length) result.content[0]!.text += `\n${pictureNotes(known)}`;
          }
          return result;
        }
        return fail(`There is no block "${args.block_id}" in this course.`);
      },
    );

    const componentTool = (type: Exclude<ComponentType, "markdown">) => {
      const info = catalogue[type];
      const { type: _type, ...fields } = componentFields[type];
      const defaultIntent: Record<typeof type, BlockIntent> = {
        diagram: "visual",
        code: "example",
        ordering: "practice",
        matching: "practice",
        blanks: "recall",
        steps: "example",
        flashcard: "recall",
        table: "visual",
        callout: "explain",
        image: "visual",
      };
      const shape = {
        ...fields,
        intent: intentParam.default(defaultIntent[type]).describe("What this is for."),
        title: z.string().max(200).optional(),
        objective_id: z.string().optional().describe(info.evidence ? "The objective this practises, so the result counts toward it." : "The objective this belongs to."),
      } as z.ZodRawShape;
      const how = info.awaits ? " The engine keeps the answer and the result comes back to you as the next message: after calling this, end your turn without further text." : " It stays visible while you talk about it.";
      return tool(info.tool, `Show the learner a ${info.label.toLowerCase()} you write now. Worth using for ${info.when}${how} Prefer show_block when the lesson plan has a fitting block.`, shape, async (args: Record<string, unknown>) => {
        const { intent, title, objective_id, ...rest } = args;
        const parsed = blockSchema.safeParse({ id: "improvised", intent, title, type, ...rest });
        if (!parsed.success) return fail(`Not shown. Fix these and call ${info.tool} again:\n- ${parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || type}: ${i.message}`).join("\n- ")}`);
        const problems = blockProblems(parsed.data, "This component");
        if (problems.length) return fail(`Not shown. Fix these and call ${info.tool} again:\n- ${problems.join("\n- ")}`);
        const objective = typeof objective_id === "string" ? findObjective(store.content(this.courseId), objective_id) : undefined;
        return this.putComponent(parsed.data, { objectiveId: objective?.id });
      });
    };
    const componentTools = (["diagram", "code", "table", "callout", "steps", "ordering", "matching", "blanks", "flashcard"] as const).map(componentTool);

    const showContent = tool(
      "show_content",
      "Put material that is not in the lesson plan on the learner's screen: a worked example, an explanation with structure, a formula, code, a table, a short text to study. Markdown, focused on one thing, under about 250 words. It stays visible while you talk about it.",
      {
        title: z.string(),
        markdown: z.string(),
        intent: intentParam.default("explain").describe("What this material is for."),
      },
      async (args) => {
        this.presented.add(args.intent);
        this.emit({ t: "content", id: shortId(), title: args.title, markdown: args.markdown, intent: args.intent });
        return ok("Shown.");
      },
    );

    const askPlannedQuestion = tool(
      "ask_planned_question",
      "Put one check from the lesson plan to the learner. The engine holds its answer key and hints, grades the answer, and sends you the result as the next message. After calling this, end your turn without further text.",
      { check_id: z.string() },
      async (args) => {
        const found = findCheck(store.content(this.courseId), args.check_id);
        if (!found) return fail(`There is no check "${args.check_id}" in this course.`);
        if (this.askedChecks.has(args.check_id)) return fail("That check was already answered this session. Use another check, or write a fresh question with ask_question.");
        const { objective, check } = found;
        const result = this.putQuestion({
          question: { id: shortId(), objectiveId: objective.id, kind: check.kind, prompt: check.prompt, options: check.kind === "choice" ? check.options : undefined, hintCount: check.hints.length },
          checkId: check.id,
          correctOption: check.correctOption,
          optionMisconceptions: check.optionMisconceptions,
          numericAnswer: check.numericAnswer,
          tolerance: check.tolerance,
          answerKey: check.answerKey,
          rubric: check.rubric,
          hints: check.hints,
        });
        if (!result.isError) this.askedChecks.add(check.id);
        return result;
      },
    );

    const addReviewItem = tool(
      "add_review_item",
      "Add one item to the learner's spaced review: a fact, term, or small step worth remembering long term. The front is a question that forces recall; the back is the short answer. One idea per item. Only add what the learner has already met and understood.",
      { objective_id: z.string().optional(), front: z.string(), back: z.string() },
      async (args) => {
        const items = store.items(this.courseId);
        items.push(newReviewItem(shortId(), args.front, args.back, args.objective_id, new Date()));
        store.saveItems(this.courseId, items);
        this.emit({ t: "course" });
        return ok("Added.");
      },
    );

    const addPlanReviewItems = tool(
      "add_plan_review_items",
      "Add the lesson plan's review cards for one objective to the learner's spaced review. Only once the learner has met and understood that objective's ideas.",
      { objective_id: z.string() },
      async (args) => {
        const objective = findObjective(store.content(this.courseId), args.objective_id);
        if (!objective) return fail(`There is no objective "${args.objective_id}".`);
        const items = store.items(this.courseId);
        const have = new Set(items.map((i) => i.front));
        const fresh = objective.lesson.review.filter((r) => !have.has(r.front));
        const now = new Date();
        for (const r of fresh) items.push(newReviewItem(shortId(), r.front, r.back, objective.id, now));
        store.saveItems(this.courseId, items);
        this.emit({ t: "course" });
        return ok(fresh.length ? `Added ${fresh.length}.` : "Those cards are already in review.");
      },
    );

    const assignProject = tool(
      "assign_project",
      "Give the learner a project to do between sessions. Only when the skills it needs are practiced.",
      { module_id: z.string().optional(), ...projectShape },
      async (args) => {
        const project: AssignedProject = {
          id: shortId(),
          moduleId: args.module_id,
          title: args.title,
          brief: args.brief,
          deliverables: args.deliverables,
          assignedAt: new Date().toISOString(),
          status: "assigned",
        };
        this.update((progress) => progress.projects.push(project));
        this.emit({ t: "project", project });
        return ok("Assigned.");
      },
    );

    const endSession = tool(
      "end_session",
      "Close the session. Call after the learner has said in their own words what they learned.",
      {
        summary: z.string().describe("Two or three honest sentences for your future self: what was covered, what the learner can now do, and what was still shaky."),
        next_step: z.string().describe("What the next session should start with."),
      },
      async (args) => {
        this.closing = { summary: args.summary, nextStep: args.next_step };
        this.update((progress) => {
          progress.summaries.push({ at: new Date().toISOString(), kind: "lesson", summary: args.summary, nextStep: args.next_step });
        });
        return ok("Saved. Say goodbye in one sentence, mentioning when they plan to study next if you know it.");
      },
    );

    return [showBlock, showContent, ...componentTools, findImages, showImage, askPlannedQuestion, askQuestion, addReviewItem, addPlanReviewItems, recordObservation, assignProject, endSession];
  }
}

/** What the tutor knows about pictures on screen: it cannot see them, so only what their source says. */
function pictureNotes(pictures: CachedImage[]): string {
  const lines = pictures.map((p) => `- "${p.title}"${p.description ? `: ${p.description}` : " (no description)"}`);
  return `What the source says about ${pictures.length === 1 ? "it" : "them"}:\n${lines.join("\n")}\nYou cannot see ${pictures.length === 1 ? "the picture" : "the pictures"}. Point the learner to what this text names, ask what they notice, and never claim a visual detail it does not give.`;
}

function describeApiError(error: string): string {
  if (error === "authentication_failed") return "Sign-in failed. Check your Claude Code login or API key in Settings.";
  if (error === "billing_error") return "The account has a billing problem.";
  if (error === "rate_limit") return "You have hit a usage limit. Try again later.";
  return `The model returned an error (${error}).`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
