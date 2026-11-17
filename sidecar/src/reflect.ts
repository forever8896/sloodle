// The end-of-session reflection: one cheap model call reads what happened and returns structured updates for Sloo's
// memory and approach. The schema check, the bounds and the logging live in teacher.ts (applyReflection).

import { structuredCall } from "./agent";
import { reflectionContext, reflectionPrompt } from "./prompts";
import { courseDir, store } from "./store";
import { applyReflection, reflectionSchema } from "./teacher";
import type { SessionEvent } from "./types";

const TRANSCRIPT_LIMIT = 16_000;

export function transcript(history: SessionEvent[]): string {
  const lines = history.flatMap((e): string[] => {
    switch (e.t) {
      case "user":
        return [`Learner: ${e.text}`];
      case "message":
        return [`Tutor: ${e.text}`];
      case "content":
        return [`[Tutor showed${e.intent ? ` ${e.intent}` : ""} material: ${e.title}]`];
      case "question":
        return [`[Question (${e.question.kind}): ${e.question.prompt}]`];
      case "hint":
        return [`[Learner took hint ${e.index + 1}]`];
      case "graded":
        return [`[Learner answered "${e.result.learnerAnswer}": ${e.result.verdict}]`];
      case "ended":
        return e.summary ? [`[Session summary: ${e.summary}]`] : [];
      default:
        return [];
    }
  });
  const text = lines.join("\n");
  return text.length > TRANSCRIPT_LIMIT ? `…${text.slice(-TRANSCRIPT_LIMIT)}` : text;
}

export async function reflectOnSession(courseId: string, sessionId: string, history: SessionEvent[]): Promise<string[]> {
  const text = transcript(history);
  if (!history.some((e) => e.t === "user")) return [];
  const settings = store.settings();
  const before = { learner: store.learner(), sloo: store.sloo() };
  const raw = await structuredCall(settings, courseDir(courseId), {
    model: settings.models.grader,
    system: reflectionPrompt(),
    prompt: `${reflectionContext(before.learner, before.sloo)}\n<transcript>\n${text}\n</transcript>`,
    schema: reflectionSchema,
    label: "Reflection",
  });
  // Re-read so that activity recorded while the model was thinking is not overwritten.
  const learner = store.learner();
  const sloo = store.sloo();
  const changes = applyReflection(sloo, learner, raw, { at: new Date().toISOString(), courseId, sessionId });
  store.saveSloo(sloo);
  store.saveLearner(learner);
  return changes;
}
