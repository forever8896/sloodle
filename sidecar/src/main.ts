import type { ServerWebSocket } from "bun";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { authStatus } from "./agent";
import { createAudioLesson } from "./audiobook";
import { recordActivity, refreshProfile } from "./activity";
import { chatMethods } from "./chat";
import { courseSlug, exportCourse, importCourse } from "./courseio";
import type { Progress } from "./formats";
import { saveSharedImages, serveImage, sharedImage } from "./images";
import { dueItems, frontier, masteryCounts, reviewItem } from "./learner";
import { editLearner, editSloo, learnerEdit, slooEdit } from "./profile";
import { Session } from "./session";
import { dataDir, store } from "./store";
import { SAMPLE_RATE, synthesize, synthesizePcm, transcribe, voices, warmSpeaker } from "./voice";
import type { CourseDetail, CourseExport, CourseListing, PublicSettings, ReviewGrade, RpcRequest, RpcResponse, ServerPush, SessionKind, Settings } from "./types";

store.init();
refreshProfile();

const token = process.env.SLOODLE_TOKEN ?? crypto.randomUUID();
const sockets = new Set<ServerWebSocket<unknown>>();
const sessions = new Map<string, Session>();

function broadcast(message: ServerPush): void {
  const text = JSON.stringify(message);
  for (const socket of sockets) socket.send(text);
}

function publicSettings(settings: Settings): PublicSettings {
  const { apiKey, ...rest } = settings;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

function listing(course: Progress): CourseListing {
  const content = store.content(course.id);
  return {
    id: course.id,
    topic: course.topic,
    title: content?.title,
    phase: course.phase,
    createdAt: course.createdAt,
    ...masteryCounts(content, course.objectiveStates),
    due: dueItems(course.reviewCards, new Date()).length,
  };
}

/** Writes an exported course to the Downloads folder when there is one, else to exports/ in the data folder. */
function saveExport(fileName: string, json: string): string | undefined {
  const downloads = join(homedir(), "Downloads");
  const dir = existsSync(downloads) ? downloads : join(dataDir, "exports");
  try {
    mkdirSync(dir, { recursive: true });
    let path = join(dir, fileName);
    for (let n = 2; existsSync(path); n++) path = join(dir, fileName.replace(/\.sloodle\.json$/, `-${n}.sloodle.json`));
    writeFileSync(path, json);
    return path;
  } catch {
    return undefined;
  }
}

function sessionKey(courseId: string, sessionId: string): string {
  return `${courseId}/${sessionId}`;
}

function getSession(courseId: string, sessionId: string): Session {
  const session = sessions.get(sessionKey(courseId, sessionId));
  if (!session) throw new Error("That session is not running any more. Reopen the course.");
  return session;
}

/** Returns the live session of this kind, resumes an unfinished one, or starts a new one. */
function openSession(courseId: string, kind: SessionKind): Session {
  const course = store.progress(courseId);
  const expected: Record<SessionKind, Progress["phase"]> = { interview: "interview", planning: "planning", lesson: "ready" };
  if (course.phase !== expected[kind]) throw new Error(`This course is not ready for a ${kind} session.`);

  const existingId = kind === "lesson" ? course.activeLesson : kind;
  if (existingId) {
    const live = sessions.get(sessionKey(courseId, existingId));
    if (live && !live.ended) return live;
  }

  const create = (id: string, history = store.sessionEvents(courseId, id)): Session => {
    const session = new Session(
      id,
      courseId,
      kind,
      (event) => broadcast({ push: "session", sessionId: id, event }),
      () => broadcast({ push: "courses" }),
      history,
      () => broadcast({ push: "profile" }),
    );
    sessions.set(sessionKey(courseId, id), session);
    return session;
  };

  const resumable = existingId && kind !== "planning" ? course.sdkSessions[existingId] : undefined;
  if (existingId && resumable) {
    const session = create(existingId);
    session.start(resumable);
    return session;
  }

  const id = kind === "lesson" ? `lesson-${Date.now()}` : kind;
  store.clearSessionEvents(courseId, id);
  if (kind === "lesson") {
    course.activeLesson = id;
    store.saveProgress(course);
  }
  const session = create(id, []);
  session.start();
  return session;
}

type Params = Record<string, any>;

const methods: Record<string, (params: Params) => unknown> = {
  "settings.get": () => publicSettings(store.settings()),

  "settings.set": (params) => {
    const current = store.settings();
    const next: Settings = {
      ...current,
      ...params,
      models: { ...current.models, ...params.models },
      voice: { ...current.voice, ...params.voice },
    };
    if (params.apiKey === "") delete next.apiKey;
    store.saveSettings(next);
    return publicSettings(next);
  },

  "auth.status": () => authStatus(store.settings()),

  "courses.list": () =>
    store
      .courseIds()
      .map((id) => listing(store.progress(id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

  "course.create": ({ topic }) => {
    const text = String(topic ?? "").trim();
    if (!text) throw new Error("Say what you want to learn first.");
    const now = new Date().toISOString();
    const course: Progress = {
      format: "sloodle.progress",
      version: 1,
      id: courseSlug(text),
      topic: text,
      createdAt: now,
      phase: "interview",
      origin: { kind: "generated", at: now },
      objectiveStates: {},
      summaries: [],
      projects: [],
      reviewCards: [],
      sdkSessions: {},
    };
    store.saveProgress(course);
    broadcast({ push: "courses" });
    return course;
  },

  "course.get": ({ courseId }): CourseDetail => {
    const course = store.progress(courseId);
    const content = store.content(courseId);
    const items = course.reviewCards;
    return { course, content, itemCount: items.length, due: dueItems(items, new Date()).length, nextUp: frontier(content, course.objectiveStates).map((o) => o.id) };
  },

  /** The shareable course file: content and lesson plans only, never progress or anything about the learner. */
  "course.export": ({ courseId }): CourseExport => {
    const content = store.content(String(courseId));
    if (!content) throw new Error("This course has no content to share yet.");
    const { fileName, json } = exportCourse(content, (id) => sharedImage(content.id, id));
    return { fileName, json, savedTo: saveExport(fileName, json) };
  },

  /** Imports a shared course file as a new course with fresh progress. */
  "course.import": ({ json }) => {
    const { doc, progress, images } = importCourse(String(json ?? ""), new Date());
    store.saveContent(doc);
    saveSharedImages(doc, images);
    store.saveProgress(progress);
    broadcast({ push: "courses" });
    return progress;
  },

  "learner.get": () => store.learner(),
  /** One edit: set name/about, add/update/delete a stated entry or note, dismiss/restore an observed finding. */
  "learner.update": (params) => {
    const next = editLearner(store.learner(), learnerEdit.parse(params));
    store.saveLearner(next);
    broadcast({ push: "profile" });
    return next;
  },
  /** Deletes the activity log the observed profile is computed from. Mastery in each course is kept. */
  "learner.clearActivity": () => {
    store.replaceEvents([]);
    refreshProfile();
    broadcast({ push: "profile" });
    return store.learner();
  },

  "sloo.get": () => store.sloo(),
  /** One edit: persona, a dial (value and lock), or add/update/delete a memory or tactic. */
  "sloo.update": (params) => {
    const next = editSloo(store.sloo(), slooEdit.parse(params));
    store.saveSloo(next);
    broadcast({ push: "profile" });
    return next;
  },

  "course.delete": ({ courseId }) => {
    for (const [key, session] of sessions) {
      if (session.courseId === courseId) {
        session.dispose();
        sessions.delete(key);
      }
    }
    store.deleteCourse(courseId);
    broadcast({ push: "courses" });
  },

  "session.open": ({ courseId, kind }) => openSession(courseId, kind).info(),
  "session.send": ({ courseId, sessionId, text }) => getSession(courseId, sessionId).send(String(text)),
  "session.hint": ({ courseId, sessionId, questionId }) => getSession(courseId, sessionId).hint(questionId),
  "session.answer": ({ courseId, sessionId, questionId, answer, confidence }) =>
    getSession(courseId, sessionId).answer(questionId, answer, confidence),
  /** The learner's work on a lesson component (see ComponentAction in types.ts). */
  "session.component": ({ courseId, sessionId, componentId, action }) => getSession(courseId, sessionId).component(String(componentId), action),
  "session.interrupt": ({ courseId, sessionId }) => getSession(courseId, sessionId).interrupt(),

  "audio.list": ({ courseId }) => store.audioLessons(courseId),
  "audio.create": ({ courseId, moduleId }) => createAudioLesson(courseId, moduleId, () => broadcast({ push: "courses" })),

  "voice.list": () => voices,
  "voice.transcribe": ({ pcm }) => transcribe(String(pcm)),
  /** Loads the voice model ahead of the first reply. Resolves once it has spoken a test word. */
  "voice.warm": () => warmSpeaker(store.settings().voice.voice),
  /** Kept for older callers; the interface streams speech from POST /speech instead. */
  "voice.speak": async ({ text }) => {
    const { voice } = store.settings();
    const wav = await synthesize(String(text), voice.voice, voice.speed);
    return Buffer.from(wav).toString("base64");
  },

  "review.due": ({ courseId }) => dueItems(store.items(courseId), new Date()),

  "review.grade": ({ courseId, itemId, grade }) => {
    const items = store.items(courseId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error("That review item no longer exists.");
    items[index] = reviewItem(items[index]!, grade as ReviewGrade, store.settings().desiredRetention, new Date());
    store.saveItems(courseId, items);
    recordActivity({ type: "review", courseId, itemId: String(itemId), objectiveId: items[index]!.objectiveId, grade: grade as ReviewGrade });
    broadcast({ push: "courses" });
    return dueItems(items, new Date()).length;
  },
};

// The global chat with Sloo (chat.ts): chat.open, chat.send, chat.interrupt, chat.accept, chat.reject, chat.reset.
Object.assign(
  methods,
  chatMethods({
    push: (sessionId, event) => broadcast({ push: "session", sessionId, event }),
    courses: () => broadcast({ push: "courses" }),
    profile: () => broadcast({ push: "profile" }),
  }),
);

async function handle(socket: ServerWebSocket<unknown>, raw: string): Promise<void> {
  const request = JSON.parse(raw) as RpcRequest;
  const response: RpcResponse = { id: request.id };
  try {
    const method = methods[request.method];
    if (!method) throw new Error(`Unknown method: ${request.method}`);
    response.result = (await method((request.params ?? {}) as Params)) ?? null;
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }
  socket.send(JSON.stringify(response));
}

const speechHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "X-Sample-Rate",
  "Cache-Control": "no-store",
};

/**
 * POST /speech?token=… with a JSON body {text, voice?, speed?} (sent as text/plain so the browser needs no
 * preflight). Answers with raw 32-bit float little-endian mono samples; the rate is in X-Sample-Rate. Closing the
 * request cancels it if synthesis has not started.
 */
async function speech(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Use POST", { status: 405, headers: speechHeaders });
  try {
    const body = (await request.json()) as { text?: unknown; voice?: unknown; speed?: unknown };
    const settings = store.settings().voice;
    const speed = Number(body.speed);
    const pcm = await synthesizePcm(String(body.text ?? ""), {
      voice: typeof body.voice === "string" && voices.some((v) => v.id === body.voice) ? body.voice : settings.voice,
      speed: Number.isFinite(speed) && speed >= 0.5 && speed <= 2 ? speed : settings.speed,
      signal: request.signal,
    });
    return new Response(pcm as Float32Array<ArrayBuffer>, { headers: { ...speechHeaders, "Content-Type": "application/octet-stream", "X-Sample-Rate": String(SAMPLE_RATE) } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499, headers: speechHeaders });
    return new Response(error instanceof Error ? error.message : String(error), { status: 500, headers: speechHeaders });
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.SLOODLE_PORT ?? 0),
  fetch(request, bunServer) {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== token) return new Response("Not found", { status: 404 });
    if (url.pathname === "/ws" && bunServer.upgrade(request)) return undefined;

    if (url.pathname === "/speech") return speech(request);

    const image = url.pathname.match(/^\/images\/([a-z0-9-]+)\/(img-[0-9a-f]{16})$/);
    if (image && request.method === "GET") return serveImage(image[1]!, image[2]!);

    const audio = url.pathname.match(/^\/audio\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d+(?:-[qa])?\.wav)$/);
    if (audio) {
      const path = join(store.audioDir(audio[1]!, audio[2]!), audio[3]!);
      if (existsSync(path)) {
        return new Response(Bun.file(path), { headers: { "Content-Type": "audio/wav", "Access-Control-Allow-Origin": "*" } });
      }
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    // A shared course with its pictures travels in one message (courseio.ts MAX_IMPORT_BYTES).
    maxPayloadLength: 16 * 1024 * 1024,
    open: (socket) => void sockets.add(socket),
    close: (socket) => void sockets.delete(socket),
    message: (socket, message) => void handle(socket, String(message)),
  },
});

// Load the voice now when replies are read aloud, so the first reply does not wait for it.
if (store.settings().voice.speakReplies) void warmSpeaker(store.settings().voice.voice).catch(() => undefined);

console.log(`SLOODLE_READY ${JSON.stringify({ port: server.port, token })}`);

// The desktop shell owns this process: when its pipe closes, stop.
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
