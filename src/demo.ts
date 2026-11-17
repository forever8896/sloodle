// Sample data so every screen renders without the engine: open the app in a browser with ?demo in the address.
import { demoPush } from "./api";
import { samples } from "./components/blocks/samples";
import { Simulator } from "./components/blocks/simulate";
import type { AudioLesson, AuthStatus, ChatInfo, ComponentAction, ComponentUpdate, GradeResult, ProposalView, SessionEvent, SessionKind, CourseDetail, CourseDoc, CourseExport, CourseListing, LearnerDoc, Progress, PublicSettings, ReviewItem, SessionInfo, SlooDoc } from "../sidecar/src/types";

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
  { id: "r3", front: "Where is middle C on the piano?", back: "The white key just left of the pair of black keys nearest the middle of the keyboard.", createdAt: ago(2), card: { due: ago(0) } },
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

// A second course, so the rail's "Dinner-Table Spanish" opens as itself.
const spanishModules: [string, string, string, string[]][] = [
  ["s1", "Greetings and getting seated", "Dinner starts at the door: the first minute sets the tone.", [
    "Can greet everyone at the table and introduce yourself.",
    "Can ask someone's name and where they are from.",
    "Can say please, thank you and excuse me in the right places.",
    "Can choose between usted and tú for the person in front of you.",
    "Can say goodbye and thank the host when you leave.",
  ]],
  ["s2", "Ordering food and drink", "Ordering for yourself is the first thing you'll do alone.", [
    "Can read the main sections of a menu.",
    "Can order a dish and a drink with quiero or me gustaría.",
    "Can ask what a dish has in it.",
    "Can say what you can't eat.",
    "Can ask for the bill and offer to pay.",
    "Can say prices up to 100 euros.",
  ]],
  ["s3", "Small talk at the table", "Most of dinner is the talk between courses.", [
    "Can talk about your family in a few sentences.",
    "Can say what you do for work.",
    "Can ask about someone's day and react to the answer.",
    "Can say what you like and don't like with gustar.",
    "Can follow a question about yourself asked at normal speed.",
    "Can ask someone to repeat or slow down.",
  ]],
  ["s4", "Telling a short story", "A story about your trip is what people will ask for.", [
    "Can say what you did yesterday with the past tense of common verbs.",
    "Can describe a place you have been.",
    "Can link sentences with y, pero and porque.",
    "Can tell a two-minute story about a trip.",
    "Can keep a ten-minute dinner conversation going.",
  ]],
];

const spanishContent: CourseDoc = {
  format: "sloodle.course",
  version: 1,
  id: "demo-2",
  subject: "conversational Spanish",
  audience: "Adults who want to chat with Spanish-speaking family over dinner.",
  language: "en",
  tags: ["languages"],
  createdAt: ago(30),
  title: "Dinner-Table Spanish",
  summary: "From greetings at the door to telling a story over dessert: the Spanish you need to hold your own at a family dinner.",
  modules: spanishModules.map(([id, title, why, statements]) => ({
    id,
    title,
    why,
    objectives: statements.map((statement, n) => ({ id: `${id}-${n + 1}`, statement, level: "apply" as const, prerequisites: [], lesson: emptyLesson })),
  })),
  sources: [],
};

const spanishIds = spanishContent.modules.flatMap((m) => m.objectives.map((o) => o.id));
const spanish: Progress = {
  format: "sloodle.progress",
  version: 1,
  id: "demo-2",
  topic: "conversational Spanish",
  createdAt: ago(30),
  phase: "ready",
  origin: { kind: "generated", at: ago(30) },
  brief: {
    topic: "conversational Spanish",
    targetPerformance: "Hold a ten-minute conversation over dinner with my partner's family in Spanish.",
    motivation: "My partner's grandparents only speak Spanish and I want to talk with them myself.",
    useContext: "Family dinners, about once a month.",
    minutesPerSession: 20,
    sessionsPerWeek: 3,
    priorKnowledge: "Two years of school Spanish, mostly forgotten.",
    formatPreferences: [],
    diagnosticFindings: [],
  },
  objectiveStates: Object.fromEntries(
    spanishIds.map((id, n) => [
      id,
      n < 14
        ? { status: "mastered" as const, evidence: [{ at: ago(20 - n), score: 1, hintsUsed: 0, kind: "short" }], firstSuccessDay: "x" }
        : n === 14
          ? { status: "practiced" as const, evidence: [{ at: ago(2), score: 1, hintsUsed: 0, kind: "short" }], firstSuccessDay: "x" }
          : n === 15
            ? { status: "learning" as const, evidence: [{ at: ago(2), score: 0.5, hintsUsed: 1, kind: "short" }] }
            : { status: "new" as const, evidence: [] },
    ]),
  ),
  summaries: [{ at: ago(2), kind: "lesson", summary: "You asked about someone's day and followed most of the answer.", nextStep: "Practise saying what you like with gustar." }],
  projects: [],
  reviewCards: [],
  sdkSessions: {},
};

const engines: Progress = {
  format: "sloodle.progress",
  version: 1,
  id: "demo-3",
  topic: "how engines work",
  createdAt: ago(0),
  phase: "interview",
  origin: { kind: "generated", at: ago(0) },
  objectiveStates: {},
  summaries: [],
  projects: [],
  reviewCards: [],
  sdkSessions: {},
};

// ---------------------------------------------------------------------------------------------------------------
// The demo engine: everything below lives in memory for the page's lifetime, so what the visitor changes stays
// changed until they reload. Each answer has the shape the real engine (sidecar/src/main.ts) returns.

interface DemoCourse {
  progress: Progress;
  content?: CourseDoc;
  reviews: ReviewItem[];
  audio: AudioLesson[];
  nextUp?: string[];
}

/** In rail order, newest first for courses added during the visit. */
const courses = new Map<string, DemoCourse>([
  ["demo", { progress: course, content, reviews: reviewItems, audio, nextUp: detail.nextUp }],
  ["demo-2", { progress: spanish, content: spanishContent, reviews: [], audio: [] }],
  ["demo-3", { progress: engines, reviews: [], audio: [] }],
]);
let railOrder = ["demo", "demo-2", "demo-3"];

let learnerState = learner;
let slooState = sloo;
let settingsState = settings;
const chatState = chat;

/** Tells the open screens what changed, as the engine's "courses" and "profile" pushes do (see api.ts). */
function announce(what: "courses" | "profile"): void {
  globalThis.dispatchEvent?.(new CustomEvent("sloodle-demo", { detail: what }));
}

function findCourse(courseId: unknown): DemoCourse {
  const found = courses.get(String(courseId));
  if (!found) throw new Error("That course no longer exists.");
  return found;
}

const objectivesOf = (c: DemoCourse) => c.content?.modules.flatMap((m) => m.objectives) ?? [];
const dueReviews = (c: DemoCourse) => c.reviews.filter((item) => String(item.card.due ?? "") <= new Date().toISOString());

function listingOf(c: DemoCourse): CourseListing {
  const objectives = objectivesOf(c);
  return {
    id: c.progress.id,
    topic: c.progress.topic,
    title: c.content?.title,
    phase: c.progress.phase,
    createdAt: c.progress.createdAt,
    mastered: objectives.filter((o) => c.progress.objectiveStates[o.id]?.status === "mastered").length,
    total: objectives.length,
    due: dueReviews(c).length,
  };
}

function detailOf(c: DemoCourse): CourseDetail {
  const fresh = objectivesOf(c).filter((o) => c.progress.objectiveStates[o.id]?.status !== "mastered").map((o) => o.id);
  return { course: c.progress, content: c.content, itemCount: c.reviews.length, due: dueReviews(c).length, nextUp: c.nextUp ?? fresh.slice(0, 3) };
}

const slug = (text: string) => `${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "course"}-${Math.random().toString(36).slice(2, 8)}`;
const firstUpper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "Bake bread" reads "bake bread" mid-sentence; "SQL joins" stays as it is. */
const inSentence = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const shortTitle = (text: string) => {
  const clean = firstUpper(text.trim().replace(/[.!?]+$/, ""));
  return clean.length <= 60 ? clean : `${clean.slice(0, 57).replace(/\s+\S*$/, "")}…`;
};

/** A believable first course for any goal: three parts from the core ideas to a first attempt of the learner's own. */
function plannedContent(id: string, topic: string, minutes = 15): CourseDoc {
  const parts: [string, string, string[]][] = [
    ["The core ideas", "Everything later builds on these, so they come first and come back often.", [
      "Can explain, in your own words, the few ideas everything else here builds on.",
      "Can spot those ideas at work in a real example.",
    ]],
    ["Putting it to work", "Knowing is not the same as doing: here you try it with help close by.", [
      "Can work through a short guided task on your own.",
      "Can spot and fix the mistake beginners make most often.",
    ]],
    ["Your first real attempt", "A small, real result of your own is what makes it stick.", [
      "Can plan and finish a small task of your own choosing, start to finish.",
    ]],
  ];
  topic = inSentence(topic);
  return {
    format: "sloodle.course",
    version: 1,
    id,
    subject: topic,
    audience: "An adult beginner learning in short sessions.",
    language: "en",
    tags: [],
    createdAt: new Date().toISOString(),
    title: shortTitle(topic),
    summary: `Three short parts, from the ideas everything rests on to a first real attempt of your own, in sessions of about ${minutes} minutes.`,
    modules: parts.map(([title, why, statements], m) => ({
      id: `m${m + 1}`,
      title,
      why,
      objectives: statements.map((statement, n) => ({ id: `m${m + 1}-${String.fromCharCode(97 + n)}`, statement, level: "apply" as const, prerequisites: [], lesson: emptyLesson })),
    })),
    sources: [],
  };
}

// --- Sessions ----------------------------------------------------------------------------------------------------

interface DemoQuestion {
  options?: string[];
  correct?: number;
  hints: string[];
  hintsShown: number;
  answered: boolean;
}

interface DemoSession {
  sessionId: string;
  courseId: string;
  kind: SessionKind;
  history: SessionEvent[];
  busy: boolean;
  ended: boolean;
  questions: Map<string, DemoQuestion>;
  /** How many of the learner's messages the interview has had. */
  turns: number;
  answers: string[];
}

const sessions = new Map<string, DemoSession>();

/** How long Sloo takes to "think" before a reply, long enough to read the thinking state. */
const THINK = 1600;

/** Records an event in the session's history (so reopening shows it) and delivers it after `delay` ms. */
function emit(session: DemoSession | ChatInfo, event: SessionEvent, delay = 0): void {
  setTimeout(() => {
    session.history.push(event);
    if (event.t === "turn_end" || event.t === "ended") session.busy = false;
    if (event.t === "ended") session.ended = true;
    demoPush(session.sessionId, event);
  }, delay);
}

function reply(session: DemoSession | ChatInfo, text: string, delay = THINK): void {
  session.busy = true;
  emit(session, { t: "message", text }, delay);
  emit(session, { t: "turn_end" }, delay + 50);
}

function newSession(courseId: string, kind: SessionKind, history: SessionEvent[] = []): DemoSession {
  const session: DemoSession = { sessionId: kind === "lesson" && courseId === "demo" ? lesson.sessionId : `${courseId}-${kind}`, courseId, kind, history, busy: false, ended: false, questions: new Map(), turns: 0, answers: [] };
  sessions.set(session.sessionId, session);
  return session;
}

// The demo lesson: the first question was answered in its history; the second waits for the visitor.
const demoLesson = newSession("demo", "lesson", lesson.history);
demoLesson.questions.set("q1", { hints: ["Count the spaces from the bottom and spell the word as you go."], hintsShown: 1, answered: true });
demoLesson.questions.set("q2", { options: ["C", "E", "F", "G"], correct: 1, hints: ["The four spaces spell a word from the bottom up.", "The word is FACE: the top space is its last letter."], hintsShown: 0, answered: false });

function openSession(courseId: string, kind: SessionKind): DemoSession {
  const c = findCourse(courseId);
  const id = kind === "lesson" && courseId === "demo" ? lesson.sessionId : `${courseId}-${kind}`;
  const existing = sessions.get(id);
  if (existing) return existing;
  const topic = c.progress.topic;
  if (kind === "interview") {
    return newSession(courseId, kind, [
      { t: "message", text: `Hi! Before I build anything, let's talk about ${inSentence(topic)} for a minute. What got you curious, and what would you love to be able to do with it?` },
      { t: "turn_end" },
    ]);
  }
  if (kind === "planning") return startPlanning(c);
  const first = objectivesOf(c).find((o) => c.progress.objectiveStates[o.id]?.status !== "mastered");
  return newSession(courseId, kind, [
    {
      t: "message",
      text: first
        ? `Good to see you. Today's step: "${first.statement}" I'll keep it short, then you try. To start, tell me in a sentence what you already know about it, even if it's nothing.`
        : "Every skill in this course is in bloom. Shall we review a few, or try something harder?",
    },
    { t: "turn_end" },
  ]);
}

/** Researches and builds the course over a few seconds, as the planner would over a few minutes, then makes it ready. */
function startPlanning(c: DemoCourse): DemoSession {
  const id = `${c.progress.id}-planning`;
  const existing = sessions.get(id);
  if (existing) return existing;
  const session = newSession(c.progress.id, "planning");
  session.busy = true;
  const topic = inSentence(c.progress.topic);
  const steps: [number, SessionEvent][] = [
    [600, { t: "activity", label: "Searching", detail: `learning ${topic}` }],
    [1800, { t: "activity", label: "Searching", detail: `${topic} beginner guide` }],
    [3000, { t: "activity", label: "Reading", detail: "a beginner's guide and two course outlines" }],
    [4300, { t: "activity", label: "Laying out your course" }],
    [5400, { t: "activity", label: "Writing lesson plans", detail: "m1" }],
    [6400, { t: "activity", label: "Writing lesson plans", detail: "m2" }],
    [7400, { t: "activity", label: "Writing lesson plans", detail: "m3" }],
    [8400, { t: "activity", label: "Checking the course" }],
    [9400, { t: "message", text: "Your course is ready: three short parts, from the core ideas to a first attempt of your own." }],
  ];
  for (const [delay, event] of steps) emit(session, event, delay);
  emit(session, { t: "ended", summary: "Course built." }, 9500);
  setTimeout(() => {
    if (!courses.has(c.progress.id)) return;
    c.content = plannedContent(c.progress.id, c.progress.topic, c.progress.brief?.minutesPerSession);
    c.progress.phase = "ready";
    announce("courses");
  }, 9600);
  return session;
}

function findSession(params: { sessionId?: unknown }): DemoSession {
  const session = sessions.get(String(params.sessionId));
  if (!session) throw new Error("That session is no longer open. Go back to the course and start it again.");
  if (session.ended) throw new Error("This session has ended.");
  return session;
}

function openQuestion(session: DemoSession, questionId: unknown): DemoQuestion {
  const question = session.questions.get(String(questionId));
  if (!question) throw new Error("That question is no longer open. Ask the tutor to repeat it.");
  if (question.answered) throw new Error("That question was already answered.");
  return question;
}

const interviewQuestions = [
  "That's a good reason to learn it. How much do you know already? Nothing at all is a fine answer: it tells me where to start.",
  "Thanks, that helps. Last thing: how much time could you give it? For example, 15 minutes on three evenings a week.",
];

function send(session: DemoSession, text: string): void {
  session.busy = true;
  emit(session, { t: "user", text });
  if (session.kind === "interview") {
    session.answers.push(text);
    const next = interviewQuestions[session.turns++];
    if (next) return reply(session, next);
    reply(session, "That's everything I need. I'll read up on how this is best learned and build your course now. It takes a few minutes, and you can leave it running.");
    emit(session, { t: "ended" }, THINK + 100);
    setTimeout(() => {
      const c = courses.get(session.courseId);
      if (!c) return;
      const [want = "", known = "", time = ""] = session.answers;
      c.progress.brief = {
        topic: c.progress.topic,
        targetPerformance: want,
        motivation: "",
        useContext: "",
        minutesPerSession: Number(time.match(/\d+/)?.[0]) || 15,
        sessionsPerWeek: 3,
        priorKnowledge: known,
        formatPreferences: [],
        diagnosticFindings: [],
      };
      c.progress.phase = "planning";
      startPlanning(c);
      announce("courses");
    }, THINK + 1200);
    return;
  }
  if (session.courseId !== "demo") {
    reply(
      session,
      session.turns++ === 0
        ? "Thanks, that tells me where to start. We'll go one small step at a time: I explain a little, then you try it straight away."
        : "Good. Keep going like that: short tries and honest guesses are what make it stick.",
    );
    return;
  }
  const open = [...session.questions.values()].some((q) => !q.answered);
  reply(
    session,
    text.includes("?")
      ? open
        ? "Good question. The staff is read from the bottom up: the lines are E G B D F and the spaces spell F A C E. Have another look at the question above with that in mind."
        : "Good question. Keep it in mind for next time: we'll come back to it once these notes feel easy."
      : open
        ? "Got it. When you're ready, have a go at the question above. A guess is fine: it tells me what to explain."
        : "Thanks for telling me. That's a good place to stop for today; the next session picks up from here.",
  );
}

/** Sloo's reply after a graded exercise or a recall rating, as the tutor would answer the grade it is sent. */
function afterComponent(session: DemoSession, action: ComponentAction, updates: ComponentUpdate[]): void {
  const toTutor = action.do === "order" || action.do === "match" || action.do === "fill" || action.do === "rate" || action.do === "report";
  if (!toTutor) return;
  const graded = updates.find((u): u is Extract<ComponentUpdate, { kind: "graded" }> => u.kind === "graded");
  const text =
    action.do === "report"
      ? "Thanks for telling me. I'll describe it in words instead, so you don't miss anything."
      : action.do === "rate"
        ? action.rating === "good" || action.rating === "easy"
          ? "Nice. That card will come back in review in a few days, just before you'd forget it."
          : "No problem: that card comes back sooner, so it gets another chance to stick."
        : graded?.result.verdict === "correct"
          ? "That's right, and without a hint. Let's keep that going."
          : graded?.result.verdict === "partial"
            ? "Close. Look at the ones marked wrong and say to yourself why they go where they do."
            : "Not yet, and that's fine. Look at the right answer shown, and we'll come back to this one later.";
  reply(session, text);
}

function answer(session: DemoSession, questionId: string, value: unknown, confidence: unknown): void {
  const question = openQuestion(session, questionId);
  question.answered = true;
  session.busy = true;
  const index = typeof value === "number" ? value : Number.NaN;
  const chosen = question.options?.[index] ?? String(value);
  const right = question.correct !== undefined && index === question.correct;
  const result: GradeResult = { questionId, verdict: right ? "correct" : "incorrect", score: right ? 1 : 0, learnerAnswer: chosen };
  emit(session, { t: "graded", result }, 500);
  const sure = confidence === 3 ? "certain" : confidence === 1 ? "guessing" : undefined;
  const correct = question.options?.[question.correct ?? -1] ?? "";
  reply(
    session,
    right
      ? sure === "guessing"
        ? `Yes, ${correct}! You said you were guessing, though: can you tell me why it's ${correct}?`
        : `Yes, ${correct}. The spaces spell F A C E from the bottom up, so the top space is the last letter. That's the spaces done for today.`
      : /know/i.test(chosen)
        ? `That's fine. Spell the spaces from the bottom up, F A C E: the top space is the last letter, ${correct}.`
        : sure === "certain"
          ? `You were sure of ${chosen}, so let's look closely: the spaces spell F A C E from the bottom up, and the top space is the last letter, ${correct}. ${chosen === "F" ? "F is the bottom space." : `${chosen} sits elsewhere on the staff.`}`
          : `Not quite: it's ${correct}. Spell the spaces from the bottom up, F A C E, and the top space is the last letter.`,
    THINK + 500,
  );
}

// --- Profile and settings edits, with the engine's rules (sidecar/src/profile.ts) ------------------------------------

const newId = () => Math.random().toString(36).slice(2, 10);
type Edit = Record<string, unknown> & { op?: string; list?: string; id?: string; text?: string };
type LearnerList = "preferences" | "goals" | "interests";
type SlooList = "toldMe" | "workingToward" | "episodes";
type Dials = Pick<SlooDoc["approach"], "explanationDepth" | "pacing" | "challenge" | "hintGenerosity">;

function editLearner(doc: LearnerDoc, edit: Edit): LearnerDoc {
  const next = structuredClone(doc);
  const at = new Date().toISOString();
  next.updatedAt = at;
  const text = String(edit.text ?? "").trim();
  if (edit.op === "set") {
    if (typeof edit.name === "string") next.stated.name = edit.name.trim() || undefined;
    if (typeof edit.about === "string") next.stated.about = edit.about.trim() || undefined;
  } else if (edit.op === "add") {
    if (!text) throw new Error("Write something to add first.");
    next.stated[edit.list as LearnerList].push({ id: newId(), text, at, source: "user" });
  } else if (edit.op === "delete") {
    if (edit.list === "notes") next.notes = next.notes.filter((e) => e.id !== edit.id);
    else next.stated[edit.list as LearnerList] = next.stated[edit.list as LearnerList].filter((e) => e.id !== edit.id);
  } else if (edit.op === "dismiss") {
    if (!next.dismissed.includes(String(edit.key))) next.dismissed.push(String(edit.key));
  } else if (edit.op === "restore") {
    next.dismissed = next.dismissed.filter((key) => key !== edit.key);
  }
  return next;
}

function editSloo(doc: SlooDoc, edit: Edit): SlooDoc {
  const next = structuredClone(doc);
  const at = new Date().toISOString();
  next.updatedAt = at;
  const record = (change: string) => next.log.push({ at, source: "user", change, reason: "Changed by the learner.", evidence: [] });
  const text = String(edit.text ?? "").trim();
  if (edit.op === "persona") {
    for (const key of ["name", "voice", "tone"] as const) {
      if (typeof edit[key] === "string") {
        next.persona[key] = edit[key] as string;
        record(`persona ${key}`);
      }
    }
  } else if (edit.op === "dial") {
    const name = edit.dial as keyof Dials;
    const dial = next.approach[name];
    if (typeof edit.value === "string") {
      Object.assign(dial, { value: edit.value, setBy: "user", reason: "Set by the learner.", at, evidence: [], locked: typeof edit.locked === "boolean" ? edit.locked : true });
      record(`${name} → ${edit.value}${dial.locked ? " (locked)" : ""}`);
    } else if (typeof edit.locked === "boolean") {
      dial.locked = edit.locked;
      record(`${name} ${edit.locked ? "locked" : "unlocked"}`);
    }
  } else if (edit.op === "add") {
    if (!text) throw new Error("Write something to add first.");
    next.memory[edit.list as SlooList].push({ id: newId(), text, at, source: "user" });
  } else if (edit.op === "delete") {
    if (edit.list === "tactics") next.approach.tactics = next.approach.tactics.filter((t) => t.id !== edit.id);
    else next.memory[edit.list as SlooList] = next.memory[edit.list as SlooList].filter((e) => e.id !== edit.id);
    record(`forgot ${edit.list} ${edit.id}`);
  }
  return next;
}

function authStatus(): AuthStatus {
  if (settingsState.authMode === "apiKey") {
    return settingsState.hasApiKey ? { mode: "apiKey", ok: true, detail: "Using your Anthropic API key (demo data)." } : { mode: "apiKey", ok: false, detail: "No API key saved yet." };
  }
  return auth;
}

/** A shared course file, checked the way the engine checks one in brief. */
function importCourse(json: unknown): Progress {
  let doc: CourseDoc | undefined;
  try {
    doc = JSON.parse(String(json ?? "")) as CourseDoc;
  } catch {
    throw new Error("That file isn't a sloodle course.");
  }
  if (!doc || typeof doc !== "object" || doc.format !== "sloodle.course" || !Array.isArray(doc.modules)) throw new Error("That file isn't a sloodle course.");
  if (typeof doc.version === "number" && doc.version > 1) throw new Error(`That course was made by a newer version of sloodle (format version ${doc.version}). Update sloodle to open it.`);
  const id = slug(doc.title || doc.subject || "course");
  const now = new Date().toISOString();
  const progress: Progress = {
    format: "sloodle.progress",
    version: 1,
    id,
    topic: doc.subject || doc.title,
    createdAt: now,
    phase: "ready",
    origin: { kind: "imported", importedTitle: doc.title, importedId: doc.id, at: now },
    objectiveStates: {},
    summaries: [],
    projects: [],
    reviewCards: [],
    sdkSessions: {},
  };
  courses.set(id, { progress, content: { ...doc, id }, reviews: [], audio: [] });
  railOrder = [id, ...railOrder];
  announce("courses");
  return progress;
}

type Params = Record<string, unknown>;

const methods: Record<string, (params: Params) => unknown> = {
  "settings.get": () => settingsState,
  "settings.set": (change) => {
    const { apiKey, ...rest } = change;
    settingsState = {
      ...settingsState,
      ...(rest as Partial<PublicSettings>),
      models: { ...settingsState.models, ...(rest.models as object) },
      voice: { ...settingsState.voice, ...(rest.voice as object) },
      // The demo never keeps a key, only that one was given.
      hasApiKey: apiKey === undefined ? settingsState.hasApiKey : apiKey !== "",
    };
    return settingsState;
  },
  "auth.status": () => authStatus(),

  "courses.list": () => railOrder.flatMap((id) => (courses.has(id) ? [listingOf(courses.get(id)!)] : [])),
  "course.get": ({ courseId }) => detailOf(findCourse(courseId)),
  "course.create": ({ topic }) => {
    const text = String(topic ?? "").trim();
    if (!text) throw new Error("Say what you want to learn first.");
    const now = new Date().toISOString();
    const id = slug(text);
    const progress: Progress = {
      format: "sloodle.progress",
      version: 1,
      id,
      topic: text,
      createdAt: now,
      // The demo skips the interview: the goal as typed is the brief, and the course goes straight to being built.
      phase: "planning",
      origin: { kind: "generated", at: now },
      brief: { topic: text, targetPerformance: text, motivation: "", useContext: "", minutesPerSession: 15, sessionsPerWeek: 3, priorKnowledge: "", formatPreferences: [], diagnosticFindings: [] },
      objectiveStates: {},
      summaries: [],
      projects: [],
      reviewCards: [],
      sdkSessions: {},
    };
    const c: DemoCourse = { progress, reviews: [], audio: [] };
    courses.set(id, c);
    railOrder = [id, ...railOrder];
    startPlanning(c);
    announce("courses");
    return progress;
  },
  "course.delete": ({ courseId }) => {
    courses.delete(String(courseId));
    for (const [id, session] of sessions) if (session.courseId === courseId) sessions.delete(id);
    announce("courses");
    return null;
  },
  "course.export": ({ courseId }) => {
    const c = findCourse(courseId);
    if (!c.content) throw new Error("This course has no content to share yet.");
    if (c.content === content) return exported;
    return { fileName: `${slug(c.content.title).replace(/-[a-z0-9]+$/, "")}.sloodle.json`, json: JSON.stringify(c.content, null, 2) } satisfies CourseExport;
  },
  "course.import": ({ json }) => importCourse(json),

  "learner.get": () => learnerState,
  "learner.update": (edit) => {
    learnerState = editLearner(learnerState, edit);
    return learnerState;
  },
  "learner.clearActivity": () => {
    learnerState = { ...learnerState, observed: undefined };
    return learnerState;
  },
  "sloo.get": () => slooState,
  "sloo.update": (edit) => {
    slooState = editSloo(slooState, edit);
    return slooState;
  },

  "session.open": ({ courseId, kind }) => {
    const session = openSession(String(courseId), kind as SessionKind);
    return { sessionId: session.sessionId, courseId: session.courseId, kind: session.kind, busy: session.busy, ended: session.ended, history: session.history } satisfies SessionInfo;
  },
  "session.send": (params) => send(findSession(params), String(params.text ?? "")),
  "session.hint": (params) => {
    const session = findSession(params);
    const question = openQuestion(session, params.questionId);
    const text = question.hints[question.hintsShown];
    if (text === undefined) throw new Error("No more hints for this question.");
    emit(session, { t: "hint", questionId: String(params.questionId), index: question.hintsShown, text });
    question.hintsShown += 1;
    return null;
  },
  "session.answer": (params) => answer(findSession(params), String(params.questionId), params.answer, params.confidence),
  "session.component": (params) => {
    // Lesson components answer through the engine's own graders, run here (see components/blocks/simulate.ts).
    const session = findSession(params);
    const componentId = String(params.componentId);
    const action = params.action as ComponentAction;
    const updates = simulator.act(componentId, action);
    updates.forEach((update) => emit(session, { t: "component_update", id: componentId, update }, 300));
    afterComponent(session, action, updates);
    return null;
  },
  "session.interrupt": () => null,

  "review.due": ({ courseId }) => dueReviews(findCourse(courseId)),
  "review.grade": ({ courseId, itemId, grade }) => {
    const c = findCourse(courseId);
    const item = c.reviews.find((r) => r.id === itemId);
    if (!item) throw new Error("That review item no longer exists.");
    const days = grade === "again" ? 0 : grade === "hard" ? 1 : grade === "good" ? 3 : 6;
    if (days > 0) item.card = { ...item.card, due: new Date(Date.now() + days * day).toISOString() };
    announce("courses");
    return dueReviews(c).length;
  },

  "audio.list": ({ courseId }) => findCourse(courseId).audio,
  "audio.create": ({ courseId, moduleId }) => {
    const c = findCourse(courseId);
    const module = c.content?.modules.find((m) => m.id === moduleId);
    if (!module) throw new Error("That part of the course no longer exists.");
    const made: AudioLesson = { id: `a${newId()}`, moduleId: module.id, title: module.title, createdAt: new Date().toISOString(), status: "writing", recorded: 0, segments: [] };
    c.audio = [...c.audio, made];
    announce("courses");
    setTimeout(() => {
      // Recording needs the engine's voice, which a page without the app doesn't have.
      Object.assign(made, { status: "failed", error: "Audio lessons are recorded by the app's own voice, so this demo can't make one. In the app it would be ready to play in a few minutes." });
      c.audio = [...c.audio];
      announce("courses");
    }, 2500);
    return made;
  },

  "voice.transcribe": () => {
    throw new Error("Sloo hears you through the app's engine, so the demo can't. Type your reply instead.");
  },
  "voice.warm": () => null,

  "chat.open": () => chatState,
  "chat.reset": () => {
    chatState.history = [];
    chatState.busy = false;
    chatState.startedAt = new Date().toISOString();
    return chatState;
  },
  "chat.send": ({ text }) => {
    emit(chatState, { t: "user", text: String(text ?? "") }, 50);
    reply(chatState, "(Demo) In the app I'd answer here, with your whole study journey in mind.", 900);
    return null;
  },
  "chat.accept": ({ proposalId }) => {
    emit(chatState, { t: "proposal_update", id: String(proposalId), status: "accepted", note: "Saved. Writing the new lesson plan now." }, 300);
    return null;
  },
  "chat.reject": ({ proposalId }) => {
    emit(chatState, { t: "proposal_update", id: String(proposalId), status: "rejected", note: "Nothing was changed." }, 300);
    return null;
  },
  "chat.interrupt": () => null,
};

export async function demoRpc(method: string, params?: unknown): Promise<unknown> {
  const handler = methods[method];
  if (!handler) throw new Error(`The demo has no answer for "${method}". This works in the app.`);
  // A copy, so what the screens hold never changes under them when the demo's state does.
  return structuredClone(handler((params ?? {}) as Params) ?? null);
}
