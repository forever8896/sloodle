// Stands in for src/api.ts on the public page (see vite.config.ts): there is no engine, so every call is answered by
// the app's own demo data (src/demo.ts) and nothing ever opens a socket or an HTTP request to the engine.
import type { SessionEvent } from "../../../sidecar/src/types";

export type * from "../../../sidecar/src/types";

export const demo = true;

const offline = () => Promise.reject(new Error("The page has no engine; this works in the app."));

export const engineUrl = (_path: string): Promise<string> => offline();
export const audioUrl = (_courseId: string, _lessonId: string, _file: string): Promise<string> => offline();

const sessionListeners = new Map<string, Set<(event: SessionEvent) => void>>();

/** A shared course file as the import would see it: the app's own checks for format and version, in brief. */
function checkImport(params: unknown): void {
  const { json } = (params ?? {}) as { json?: string };
  let data: { format?: unknown; version?: unknown } | undefined;
  try {
    data = JSON.parse(json ?? "");
  } catch {
    throw new Error("That file isn't a sloodle course.");
  }
  if (!data || typeof data !== "object" || data.format !== "sloodle.course") throw new Error("That file isn't a sloodle course.");
  if (typeof data.version === "number" && data.version > 1) throw new Error(`That course was made by a newer version of sloodle (format version ${data.version}). Update sloodle to open it.`);
}

export async function rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
  if (method === "course.import") checkImport(params);
  const { demoRpc } = await import("../../../src/demo");
  return (await demoRpc(method, params)) as T;
}

export function demoPush(sessionId: string, event: SessionEvent): void {
  for (const listener of sessionListeners.get(sessionId) ?? []) listener(event);
}

export function onSession(sessionId: string, listener: (event: SessionEvent) => void): () => void {
  const listeners = sessionListeners.get(sessionId) ?? new Set();
  sessionListeners.set(sessionId, listeners);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const onCourses = (_listener: () => void) => () => undefined;
export const onProfile = (_listener: () => void) => () => undefined;
