// Sample data so every screen renders without the engine: open the app in a browser with ?demo in the address.
import { demoPush } from "./api";
import { samples } from "./components/blocks/samples";
import { Simulator } from "./components/blocks/simulate";
import type { AudioLesson, AuthStatus, ChatInfo, ComponentAction, ProposalView, SessionEvent, CourseDetail, CourseDoc, CourseExport, CourseListing, LearnerDoc, Progress, PublicSettings, ReviewItem, SessionInfo, SlooDoc } from "../sidecar/src/types";

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

const emptyLesson = { keyIdeas: [], misconceptions: [], blocks: [], checks: [], review: [] };

const course: Progress = {
  format: "sloodle.progress",
  version: 1,
  id: "demo",
  topic: "reading sheet music",
  createdAt: ago(9),
  phase: "ready",
  origin: { kind: "generated", at: ago(9) },
  brief: {
    topic: "reading sheet music",
    targetPerformance: "Sight-read a simple treble clef melody slowly on piano, well enough to play along with my daughter.",
    motivation: "My daughter just started lessons and I want to sit beside her at the piano, not watch from the couch.",
    useContext: "Playing simple songs at home with a six-year-old.",
    minutesPerSession: 15,
    sessionsPerWeek: 4,
    studyCue: "Weeknights around 8pm at the keyboard.",
    priorKnowledge: "Knows the mnemonic for the line names but cannot place notes on the staff.",
    formatPreferences: ["Short explanations, then doing"],
    diagnosticFindings: [],
  },
  objectiveStates: {
    "m1-a": { status: "mastered", evidence: [{ at: ago(3), score: 1, hintsUsed: 0, kind: "short" }, { at: ago(1), score: 1, hintsUsed: 0, kind: "short" }], firstSuccessDay: "x" },
    "m1-b": { status: "practiced", evidence: [{ at: ago(1), score: 1, hintsUsed: 0, kind: "choice" }], firstSuccessDay: "x" },
    "m1-c": { status: "learning", evidence: [{ at: ago(0), score: 0.5, hintsUsed: 1, kind: "short" }] },
    "m2-a": { status: "practiced", evidence: [{ at: ago(0), score: 1, hintsUsed: 0, kind: "choice" }], firstSuccessDay: "x" },
  },
  summaries: [{ at: ago(1), kind: "lesson", summary: "You named all five lines without the mnemonic.", nextStep: "Start with the spaces, then mix lines and spaces." }],
  projects: [],
  reviewCards: [],
  sdkSessions: {},
};

const content: CourseDoc = {
  format: "sloodle.course",
  version: 1,
  id: "demo",
  subject: "reading sheet music",
  audience: "Adult beginners who want to play simple melodies on piano.",
  language: "en",
  tags: ["music"],
  createdAt: ago(9),
  title: "Read Treble Clef and Play Along",
  summary: "You'll fix the staff basics, connect notes to keys, add a steady beat, then sight-read short melodies and play a duet part.",
  modules: [
    {
      id: "m1",
      title: "The staff and its anchors",
      why: "Every note you play with your daughter sits on one of these lines or spaces.",
      objectives: [
        { id: "m1-a", statement: "Can say how many lines and spaces a staff has and count them from the bottom", level: "remember", prerequisites: [], lesson: emptyLesson },
        {
          id: "m1-b",
          statement: "Can name any marked line of the treble staff in under five seconds.",
          level: "apply",
          prerequisites: ["m1-a"],
          lesson: {
            keyIdeas: ["The five lines, bottom to top, are E G B D F.", "Count lines from the bottom, not the top."],
            misconceptions: [{ id: "m1-b-x1", belief: "Lines are counted from the top.", correction: "Staff lines are always counted from the bottom up." }],
            blocks: [
              { id: "m1-b-b1", intent: "activate", body: "Without looking: which line do you think is the *first* line?" },
              { id: "m1-b-b2", intent: "explain", title: "Line names", body: "From the bottom up: **E G B D F**." },
              { id: "m1-b-b3", intent: "practice", body: "Name the marked line.", checkId: "m1-b-c1" },
            ],
            checks: [{ id: "m1-b-c1", kind: "short", prompt: "Which note sits on the **middle line**?", answerKey: "B", hints: ["Count up from E."], misconceptionIds: ["m1-b-x1"] }],
            review: [{ front: "Treble staff lines, bottom up?", back: "E G B D F" }],
          },
        },
        { id: "m1-c", statement: "Can name any marked space of the treble staff in under five seconds.", level: "apply", prerequisites: ["m1-a"], lesson: emptyLesson },
        { id: "m1-d", statement: "Can order three notes from lowest to highest by their height on the staff.", level: "understand", prerequisites: ["m1-b", "m1-c"], lesson: emptyLesson },
      ],
    },
    {
      id: "m2",
      title: "From the page to the keys",
      why: "Naming a note only helps once your hand knows where it lives.",
      objectives: [
        { id: "m2-a", statement: "Can find middle C on any keyboard without counting keys.", level: "apply", prerequisites: [], lesson: emptyLesson },
        { id: "m2-b", statement: "Can play any written note from middle C up to G on the right key.", level: "apply", prerequisites: ["m2-a", "m1-d"], lesson: emptyLesson },
      ],
      project: { title: "Name-and-play card set", brief: "Make ten note cards and play each within three seconds.", deliverables: ["Ten cards", "A timed run"] },
    },
  ],
  sources: [{ title: "musictheory.net: The Staff, Clefs, and Ledger Lines", url: "https://www.musictheory.net/lessons/10", kind: "lesson", why: "Clear first pass at the staff." }],
};

const detail: CourseDetail = { course, content, itemCount: 9, due: 3, nextUp: ["m1-b", "m1-c", "m2-a"] };

const listings: CourseListing[] = [
  { id: "demo", topic: course.topic, title: content.title, phase: "ready", createdAt: course.createdAt, mastered: 1, total: 6, due: 3 },
  { id: "demo-2", topic: "conversational Spanish", title: "Dinner-Table Spanish", phase: "ready", createdAt: ago(30), mastered: 14, total: 22, due: 0 },
  { id: "demo-3", topic: "how engines work", phase: "interview", createdAt: ago(0), mastered: 0, total: 0, due: 0 },
];

const lesson: SessionInfo = {
  sessionId: "demo-lesson",
  courseId: "demo",
  kind: "lesson",
  busy: false,
  ended: false,
  history: [
    { t: "message", text: "Welcome back. Before anything new: without looking, what are the five line names of the treble staff, bottom to top?" },
    { t: "user", text: "E G B D F" },
    { t: "message", text: "Correct, and you did it without the mnemonic this time. Today we add the spaces. Here is the one picture you need." },
    { t: "content", id: "c1", title: "Spaces of the treble staff", markdown: "The four spaces, from the bottom up, spell a word:\n\n**F  A  C  E**\n\nEach space sits between two lines, so the note in the bottom space is one step above the bottom line **E**." },
    { t: "question", question: { id: "q1", objectiveId: "m1-c", kind: "short", prompt: "A note sits in the **second space from the bottom**. What is it called?", hintCount: 2 } },
    { t: "hint", questionId: "q1", index: 0, text: "Count the spaces from the bottom and spell the word as you go." },
    { t: "graded", result: { questionId: "q1", verdict: "correct", score: 1, learnerAnswer: "A" } },
    { t: "message", text: "Yes, A. You used a hint, so let's make sure it sticks with one more." },
    { t: "question", question: { id: "q2", objectiveId: "m1-c", kind: "choice", prompt: "Which note sits in the **top space** of the treble staff?", options: ["C", "E", "F", "G"], hintCount: 2 } },
    { t: "turn_end" },
  ],
};

// Every lesson component, after the conversation above, so ?demo shows each one fresh and answerable.
const simulator = new Simulator();
const s = samples;
lesson.history.splice(
  lesson.history.length - 2,
  0,
  ...[s.keyIdea, s.diagram, s.table, s.code, s.steps, s.ordering, s.matching, s.blanks, s.codeBlanks, s.flashcard, s.mistake].map(
    (block): SessionEvent => ({ t: "component", component: simulator.show(block, "m1-c") }),
  ),
);

const reviewItems: ReviewItem[] = [
  { id: "r1", front: "How many lines and how many spaces does a staff have?", back: "Five lines and four spaces.", createdAt: ago(3), card: { due: ago(0) } },
  { id: "r2", front: "Name the treble staff lines from the bottom up.", back: "E, G, B, D, F.", createdAt: ago(3), card: { due: ago(0) } },
];

const audio: AudioLesson[] = [
  {
    id: "a1",
    moduleId: "m1",
    title: "Reading the Treble Staff: Five Lines, Bottom Up",
    createdAt: ago(1),
    status: "ready",
    recorded: 0,
    segments: [{ heading: "What this lesson is for", text: "", recallQuestion: "", recallAnswer: "" }],
  },
];

const learner: LearnerDoc = {
  format: "sloodle.learner",
  version: 1,
  updatedAt: ago(0),
  stated: {
    name: "Sam",
    preferences: [{ id: "p1", text: "Short explanations, then doing", at: ago(9), source: "interview" }],
    goals: [{ id: "g1", text: "Play duets with my daughter", at: ago(9), source: "interview" }],
    interests: [],
  },
  notes: [{ id: "n1", at: ago(3), source: "tutor", category: "struggle", text: "Mixes up lines and spaces when rushed." }],
  dismissed: [],
  observed: {
    derivedAt: ago(0),
    eventCount: 14,
    answers: { all: { n: 12, accuracy: 0.75, meanScore: 0.8, hintRate: 0.25, evidence: [] }, byKind: {} },
    recent: { n: 12, accuracy: 0.75, meanScore: 0.8, hintRate: 0.25, evidence: [] },
    calibration: { verdict: "calibrated", gap: 0.05, byConfidence: {}, evidence: [] },
    pace: { medianSecondsToAnswer: { short: 14 } },
    sessions: { n: 3, medianMinutes: 16, perWeek: 0.8, accuracyByTimeOfDay: {}, evidence: [] },
    presentation: {},
    baseline: { n: 4, accuracy: 0.5, meanScore: 0.6, hintRate: 0.5, evidence: [] },
    misconceptions: [],
    reviews: { n: 6, againRate: 0.17, evidence: [] },
    findings: [{ key: "presentation:example:works", kind: "pattern", text: "Does better after example material (90% right over 10 answers).", evidence: ["e1", "e2"] }],
  },
};

const dial = (value: string, reason = "") => ({ value, setBy: reason ? "stats" : "default", reason, evidence: [], locked: false }) as never;

const sloo: SlooDoc = {
  format: "sloodle.sloo",
  version: 1,
  updatedAt: ago(0),
  persona: { name: "Sloo", voice: "A small, friendly sprout and a personal tutor.", tone: "Warm, plain and direct." },
  memory: {
    toldMe: [{ id: "t1", text: "Their daughter is six and just started piano.", at: ago(9), source: "reflection" }],
    workingToward: [{ id: "w1", text: "Playing a duet at the holidays.", at: ago(9), source: "reflection" }],
    episodes: [{ id: "e1", text: "Named all five lines without the mnemonic for the first time.", at: ago(1), source: "reflection" }],
  },
  approach: {
    explanationDepth: dial("brief", "Succeeds without explanations first (80% over 5)."),
    pacing: dial("steady"),
    challenge: dial("balanced"),
    hintGenerosity: dial("standard"),
    tactics: [{ id: "form-example", text: "Showing example material before asking", intent: "example", source: "stats", worked: 9, failed: 1, evidence: [], updatedAt: ago(1) }],
  },
  log: [{ at: ago(1), source: "stats", change: "explanationDepth: standard → brief", reason: "Succeeds without explanations first (80% over 5).", evidence: [] }],
};

const exported: CourseExport = { fileName: "read-treble-clef-and-play-along.sloodle.json", json: JSON.stringify(content, null, 2) };

const settings: PublicSettings = {
  authMode: "subscription",
  hasApiKey: false,
  models: { tutor: "claude-sonnet-5-5", planner: "claude-opus-5-5", grader: "claude-haiku-5-5" },
  desiredRetention: 0.9,
  voice: { speakReplies: false, voice: "af_heart", speed: 1 },
  onboardedAt: ago(9),
};

const auth: AuthStatus = { mode: "subscription", ok: true, detail: "Signed in to Claude Code (demo data)." };

// The global chat: a conversation with one proposed course change and one offered button.
const states = course.objectiveStates;
const lessonView = (id: string, mark?: "added" | "removed" | "changed") => {
  const o = content.modules.flatMap((m) => m.objectives).find((x) => x.id === id)!;
  return { id, statement: o.statement, status: states[id]?.status ?? ("new" as const), mark };
};
const proposal: ProposalView = {
  id: "p-demo",
  courseId: "demo",
  courseTitle: content.title,
  reason: "You said counting lines feels too easy now and you'd rather get to the keyboard sooner, so this drops the warm-up and adds a quick hands-on lesson.",
  lines: [
    'Removes the lesson "Can say how many lines and spaces a staff has and count them from the bottom".',
    'Adds the lesson "Can play a note the moment it is named, with eyes on the page" to "From the page to the keys".',
    'Moves "Can find middle C on any keyboard without counting keys" within "From the page to the keys".',
    '"Can name any marked line of the treble staff in under five seconds" no longer waits for "Can say how many lines and spaces a staff has and count them from the bottom".',
  ],
  warnings: ["Removes \"Can say how many lines and spaces a staff has and count them from the bottom\", which you have mastered. Your record of it is kept, but it will no longer count in this course."],
  before: [
    { id: "m1", title: "The staff and its anchors", lessons: [lessonView("m1-a", "removed"), lessonView("m1-b", "changed"), lessonView("m1-c"), lessonView("m1-d")] },
    { id: "m2", title: "From the page to the keys", lessons: [lessonView("m2-a", "changed"), lessonView("m2-b")] },
  ],
  after: [
    { id: "m1", title: "The staff and its anchors", lessons: [lessonView("m1-b", "changed"), lessonView("m1-c"), lessonView("m1-d")] },
    {
      id: "m2",
      title: "From the page to the keys",
      lessons: [{ id: "m2-z", statement: "Can play a note the moment it is named, with eyes on the page.", status: "new", mark: "added" }, lessonView("m2-a", "changed"), lessonView("m2-b")],
    },
  ],
  plans: 1,
  status: "pending",
};

const chat: ChatInfo = {
  sessionId: "demo-chat",
  busy: false,
  ended: false,
  startedAt: ago(1),
  history: [
    { t: "user", text: "Honestly the staff lessons feel a bit slow. I already know how many lines there are, I want to get my hands on the keys." },
    { t: "message", text: "That makes sense: you named all five lines without the mnemonic yesterday. I'll note that you want to get to the keyboard sooner. One option is to drop the counting lesson and add a quick hands-on one. Here's what that would look like." },
    { t: "proposal", proposal },
    { t: "turn_end" },
    { t: "user", text: "What should I do tonight?" },
    { t: "message", text: "You have three review cards due, and spaces of the staff is still sprouting. A short lesson on the spaces would round off the first module nicely." },
    { t: "offer", offer: { id: "o1", kind: "start_lesson", courseId: "demo", label: "Start the next lesson" } },
    { t: "turn_end" },
  ],
};

const answers: Record<string, unknown> = {
  "chat.open": chat,
  "chat.reset": { ...chat, history: [] },
  "settings.get": settings,
  "settings.set": settings,
  "auth.status": auth,
  "courses.list": listings,
  "course.get": detail,
  "session.open": lesson,
  "review.due": reviewItems,
  "review.grade": 1,
  "audio.list": audio,
  "learner.get": learner,
  "learner.update": learner,
  "sloo.get": sloo,
  "sloo.update": sloo,
  "course.export": exported,
  "course.import": course,
};

export async function demoRpc(method: string, params?: unknown): Promise<unknown> {
  if (method === "chat.accept" || method === "chat.reject") {
    const { proposalId } = params as { proposalId: string };
    const accepted = method === "chat.accept";
    const update: SessionEvent = { t: "proposal_update", id: proposalId, status: accepted ? "accepted" : "rejected", note: accepted ? "Saved. Writing the new lesson plan now." : "Nothing was changed." };
    setTimeout(() => demoPush(chat.sessionId, update), 300);
    return null;
  }
  if (method === "chat.send") {
    const { text } = params as { text: string };
    const reply = "(Demo) In the app I'd answer here, with your whole study journey in mind.";
    setTimeout(() => demoPush(chat.sessionId, { t: "user", text }), 50);
    setTimeout(() => demoPush(chat.sessionId, { t: "message", text: reply }), 900);
    setTimeout(() => demoPush(chat.sessionId, { t: "turn_end" }), 950);
    return null;
  }
  if (method === "session.component") {
    // Lesson components answer through the engine's own graders, run here (see components/blocks/simulate.ts).
    const { componentId, action } = params as { componentId: string; action: ComponentAction };
    const updates = simulator.act(componentId, action);
    setTimeout(() => updates.forEach((update) => demoPush(lesson.sessionId, { t: "component_update", id: componentId, update })), 300);
    return null;
  }
  return structuredClone(answers[method] ?? null);
}
