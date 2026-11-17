import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RpcResponse, ServerPush, SessionEvent } from "../sidecar/src/types";

export type * from "../sidecar/src/types";

type SessionListener = (event: SessionEvent) => void;

let socket: Promise<WebSocket> | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const sessionListeners = new Map<string, Set<SessionListener>>();
const courseListeners = new Set<() => void>();
const profileListeners = new Set<() => void>();

let engine: Promise<{ port: number; token: string }> | undefined;

function engineInfo(): Promise<{ port: number; token: string }> {
  // Plain browser during development: run the sidecar with SLOODLE_PORT=4517 SLOODLE_TOKEN=dev.
  engine ??= isTauri() ? invoke<{ port: number; token: string }>("sidecar_info") : Promise.resolve({ port: 4517, token: "dev" });
  return engine;
}

async function endpoint(): Promise<string> {
  const { port, token } = await engineInfo();
  return `ws://127.0.0.1:${port}/ws?token=${token}`;
}

/** An HTTP address on the engine, with the run's token, e.g. engineUrl("/speech"). */
export async function engineUrl(path: string): Promise<string> {
  const { port, token } = await engineInfo();
  return `http://127.0.0.1:${port}${path}?token=${token}`;
}

export async function audioUrl(courseId: string, lessonId: string, file: string): Promise<string> {
  const { port, token } = await engineInfo();
  return `http://127.0.0.1:${port}/audio/${courseId}/${lessonId}/${file}?token=${token}`;
}

function connect(): Promise<WebSocket> {
  socket ??= endpoint().then(
    (url) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error("Could not reach the sloodle engine."));
        ws.onclose = () => {
          socket = undefined;
          for (const { reject: fail } of waiting.values()) fail(new Error("Lost the connection to the sloodle engine."));
          waiting.clear();
        };
        ws.onmessage = (message) => {
          const data = JSON.parse(String(message.data)) as RpcResponse | ServerPush;
          if ("push" in data) {
            if (data.push === "courses") for (const listener of courseListeners) listener();
            else if (data.push === "profile") for (const listener of profileListeners) listener();
            else for (const listener of sessionListeners.get(data.sessionId) ?? []) listener(data.event);
            return;
          }
          const pending = waiting.get(data.id);
          waiting.delete(data.id);
          if (data.error !== undefined) pending?.reject(new Error(data.error));
          else pending?.resolve(data.result);
        };
      }),
  );
  socket.catch(() => (socket = undefined));
  return socket;
}

/** With ?demo in the address (browser only), every screen renders from sample data and no engine is needed. */
export const demo = !isTauri() && new URLSearchParams(location.search).has("demo");

export async function rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
  if (demo) return (await import("./demo")).demoRpc(method, params) as Promise<T>;
  const ws = await connect();
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** Demo only: delivers a session event as if the engine had pushed it. */
export function demoPush(sessionId: string, event: SessionEvent): void {
  if (demo) for (const listener of sessionListeners.get(sessionId) ?? []) listener(event);
}

export function onSession(sessionId: string, listener: SessionListener): () => void {
  const listeners = sessionListeners.get(sessionId) ?? new Set();
  sessionListeners.set(sessionId, listeners);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onCourses(listener: () => void): () => void {
  courseListeners.add(listener);
  return () => courseListeners.delete(listener);
}

/** Fires when the learner profile or Sloo's memory changes (after answers, sessions, reflections or edits). */
export function onProfile(listener: () => void): () => void {
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}
