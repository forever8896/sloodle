// The learner's study journey, as the global chat sees it: a compact, deterministic summary built by code from the
// documents (learner.json, sloo.json, each course's course.json and progress.json, events.jsonl). The same data and
// the same day always give the same text, and it never grows past JOURNEY_LIMIT; detail is behind the chat's read
// tools (get_course, get_recent_activity).

import { dialNames, type ActivityEvent, type CourseDoc, type LearnerDoc, type Progress, type SlooDoc } from "./formats";
import { allObjectives, dueItems, frontier, masteryCounts, statusOf } from "./learner";
import { store } from "./store";

export const JOURNEY_LIMIT = 12_000;

export interface JourneyInput {
  learner: LearnerDoc;
  sloo: SlooDoc;
  courses: { progress: Progress; content?: CourseDoc }[];
  events: ActivityEvent[];
}

export function readJourney(): JourneyInput {
  const courses = store
    .courseIds()
    .flatMap((id) => {
      try {
        return [{ progress: store.progress(id), content: store.content(id) }];
      } catch {
        return [];
      }
    });
  return { learner: store.learner(), sloo: store.sloo(), courses, events: store.events() };
}

const cut = (text: string, n: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (iso: string) => iso.slice(0, 10);

function learnerSection(learner: LearnerDoc): string {
  const s = learner.stated;
  const lines = [
    s.name ? `Name: ${cut(s.name, 80)}` : "",
    s.about ? `About: ${cut(s.about, 300)}` : "",
    ...s.goals.slice(-4).map((e) => `Goal: ${cut(e.text, 160)}`),
    ...s.preferences.slice(-6).map((e) => `Prefers: ${cut(e.text, 160)}${e.courseId ? ` (${e.courseId})` : ""}`),
    ...s.interests.slice(-4).map((e) => `Interested in: ${cut(e.text, 120)}`),
    ...learner.notes.slice(-10).map((n) => `Note [${n.category}${n.courseId ? `, ${n.courseId}` : ""}, ${day(n.at)}]: ${cut(n.text, 180)}`),
  ].filter(Boolean);
  const o = learner.observed;
  if (o && o.answers.all.n > 0) {
    lines.push(`Answers overall: ${pct(o.answers.all.accuracy)} right over ${o.answers.all.n}; last ${o.recent.n}: ${pct(o.recent.accuracy)}, hints on ${pct(o.recent.hintRate)}.`);
    if (o.calibration.verdict !== "unknown") lines.push(`Confidence: ${o.calibration.verdict}.`);
    if (o.sessions.n) lines.push(`Lessons: ${o.sessions.n}, about ${o.sessions.perWeek}/week lately${o.sessions.medianMinutes !== null ? `, ~${o.sessions.medianMinutes} min each` : ""}${o.sessions.lastAt ? `, last ${day(o.sessions.lastAt)}` : ""}.`);
    for (const f of o.findings.filter((f) => !learner.dismissed.includes(f.key)).slice(0, 5)) lines.push(`Observed: ${cut(f.text, 180)}`);
  }
  return `## The learner\n${lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- Nothing known yet."}`;
}

function slooSection(sloo: SlooDoc): string {
  const dials = dialNames.map((name) => {
    const d = sloo.approach[name];
    return `${name} ${d.value}${d.setBy !== "default" ? ` (${d.setBy}${d.locked ? ", locked" : ""})` : ""}`;
  });
  const memory = [
    ...sloo.memory.toldMe.slice(-6).map((e) => `They told you: ${cut(e.text, 160)}`),
    ...sloo.memory.workingToward.slice(-4).map((e) => `Working toward: ${cut(e.text, 160)}`),
    ...sloo.memory.episodes.slice(-3).map((e) => `${day(e.at)}: ${cut(e.text, 160)}`),
  ];
  const tactics = [...sloo.approach.tactics]
    .sort((a, b) => b.worked + b.failed - (a.worked + a.failed) || a.id.localeCompare(b.id))
    .slice(0, 4)
    .map((t) => `Tactic: ${cut(t.text, 120)} (worked ${t.worked}, not ${t.failed})`);
  return `## Your teaching settings and memory\n- Dials: ${dials.join("; ")}.\n${[...tactics, ...memory].map((l) => `- ${l}`).join("\n") || "- No memories yet."}`;
}

type Detail = "full" | "modules" | "brief";

function courseSection(progress: Progress, content: CourseDoc | undefined, now: Date, detail: Detail): string {
  const states = progress.objectiveStates;
  const title = content?.title ?? progress.topic;
  const head = [`### ${cut(title, 120)} (id: ${progress.id}, ${progress.phase === "ready" ? "ready" : progress.phase === "interview" ? "getting started: goal interview" : "being built"})`];
  if (progress.brief) head.push(`Goal: ${cut(progress.brief.targetPerformance, 220)}`);
  else head.push(`Topic: ${cut(progress.topic, 160)}`);
  if (!content) return head.join("\n");

  const { mastered, total } = masteryCounts(content, states);
  const objectives = allObjectives(content);
  const count = (s: string) => objectives.filter((o) => statusOf(states, o.id) === s).length;
  const due = dueItems(progress.reviewCards, now).length;
  head.push(`Progress: ${mastered}/${total} mastered, ${count("practiced")} practiced, ${count("learning")} learning; ${due} review card${due === 1 ? "" : "s"} due of ${progress.reviewCards.length}.`);
  const next = frontier(content, states).slice(0, 3);
  if (next.length) head.push(`Next up: ${next.map((o) => o.id).join(", ")}.`);
  const last = progress.summaries.filter((s) => s.kind === "lesson").at(-1);
  if (last) head.push(`Last lesson ${day(last.at)}: ${cut(last.summary, 200)} Next step: ${cut(last.nextStep, 120)}`);
  const open = progress.projects.filter((p) => p.status === "assigned");
  if (open.length) head.push(`Open project: ${open.map((p) => cut(p.title, 60)).join(", ")}.`);
  if (detail === "brief") return head.join("\n");

  const outline = content.modules.map((m) => {
    const statuses = m.objectives.map((o) => statusOf(states, o.id));
    const line = `- Module ${m.id} "${cut(m.title, 80)}": ${statuses.filter((s) => s === "mastered").length}/${m.objectives.length} mastered`;
    if (detail === "modules") return line;
    const lessons = m.objectives.map((o) => `  - ${o.id} [${statusOf(states, o.id)}]${o.lesson.blocks.length === 0 && o.lesson.checks.length === 0 ? " [no plan yet]" : ""} ${cut(o.statement, 110)}`);
    return [line, ...lessons].join("\n");
  });
  return `${head.join("\n")}\nOutline:\n${outline.join("\n")}`;
}

function activitySection(input: JourneyInput, now: Date): string {
  const since = now.getTime() - 14 * 86_400_000;
  const recent = input.events.filter((e) => new Date(e.at).getTime() >= since);
  const byCourse = new Map<string, { answers: number; right: number; lessons: number; reviews: number }>();
  for (const e of recent) {
    const c = byCourse.get(e.courseId) ?? { answers: 0, right: 0, lessons: 0, reviews: 0 };
    if (e.type === "answer") {
      c.answers += 1;
      if (e.score >= 0.8) c.right += 1;
    } else if (e.type === "session_end" && e.kind === "lesson") c.lessons += 1;
    else if (e.type === "review") c.reviews += 1;
    byCourse.set(e.courseId, c);
  }
  const lines = [...byCourse.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, c]) => c.answers || c.lessons || c.reviews)
    .map(([id, c]) => `- ${id}: ${c.lessons} lesson${c.lessons === 1 ? "" : "s"}, ${c.answers} answers (${c.answers ? pct(c.right / c.answers) : "n/a"} right), ${c.reviews} reviews`);
  const revisions = input.events.filter((e) => e.type === "course_revised").slice(-3).map((e) => `- ${day(e.at)} course change in ${e.courseId}: ${e.type === "course_revised" ? cut(e.summary, 160) : ""}`);
  const lastAt = input.events.reduce<string | undefined>((latest, e) => (!latest || e.at > latest ? e.at : latest), undefined);
  return `## The last 14 days\n${lines.join("\n") || "- No study activity."}${lastAt ? `\n- Last activity of any kind: ${day(lastAt)}.` : ""}${revisions.length ? `\nRecent course changes made from this chat:\n${revisions.join("\n")}` : ""}`;
}

/** The journey summary for the chat's model. Deterministic for the same input and day, and at most JOURNEY_LIMIT long. */
export function buildJourney(input: JourneyInput, now: Date): string {
  const courses = [...input.courses].sort((a, b) => b.progress.createdAt.localeCompare(a.progress.createdAt) || a.progress.id.localeCompare(b.progress.id));
  const render = (detail: Detail) =>
    [
      `# The learner's study journey (as of ${day(now.toISOString())})`,
      learnerSection(input.learner),
      slooSection(input.sloo),
      `## Courses (${courses.length})\n${courses.map((c) => courseSection(c.progress, c.content, now, detail)).join("\n\n") || "None yet."}`,
      activitySection(input, now),
    ].join("\n\n");
  for (const detail of ["full", "modules", "brief"] as const) {
    const text = render(detail);
    if (text.length <= JOURNEY_LIMIT) return text;
  }
  const text = render("brief");
  return `${text.slice(0, JOURNEY_LIMIT - 60)}\n… (cut to fit; use get_course for any course)`;
}

export function journeySummary(now = new Date()): string {
  return buildJourney(readJourney(), now);
}

const DETAIL_LIMIT = 16_000;

/** One course in detail for the chat's get_course tool: brief, outline with each lesson's plan and mastery. */
export function courseDetail(courseId: string, now = new Date()): string {
  const progress = store.progress(courseId);
  const content = store.content(courseId);
  const states = progress.objectiveStates;
  const b = progress.brief;
  const lines = [
    `# ${content?.title ?? progress.topic} (id: ${courseId}, phase: ${progress.phase})`,
    b
      ? `Goal: ${b.targetPerformance}\nWhy: ${b.motivation}\nWhere they will use it: ${b.useContext}\nTime: ${b.minutesPerSession} min x ${b.sessionsPerWeek}/week${b.deadline ? `, deadline ${b.deadline}` : ""}\nStarting level: ${cut(b.priorKnowledge, 400)}\nFormat preferences: ${b.formatPreferences.join(", ") || "none"}`
      : `Topic: ${progress.topic}`,
  ];
  if (content) {
    lines.push(`Summary: ${content.summary}${content.estimatedHours ? ` (about ${content.estimatedHours} hours)` : ""}`);
    for (const m of content.modules) {
      lines.push(`\n## Module ${m.id}: ${m.title}\nWhy: ${cut(m.why, 200)}${m.project ? `\nProject: ${m.project.title}` : ""}`);
      for (const o of m.objectives) {
        const state = states[o.id];
        const last = state?.evidence.at(-1);
        const plan = o.lesson;
        const types = [...new Set(plan.blocks.map((block) => block.type ?? "markdown"))];
        lines.push(
          `- ${o.id} [${statusOf(states, o.id)}${last ? `, last ${day(last.at)} score ${last.score.toFixed(1)}` : ""}] (${o.level}) ${o.statement}${o.prerequisites.length ? `\n  builds on: ${o.prerequisites.join(", ")}` : ""}\n  plan: ${plan.blocks.length || plan.checks.length ? `${plan.blocks.length} blocks (${types.join(", ")}), ${plan.checks.length} checks (${plan.checks.map((c) => c.kind).join(", ")})${plan.keyIdeas.length ? `; key ideas: ${plan.keyIdeas.map((k) => cut(k, 100)).join(" | ")}` : ""}` : "none yet (taught from the statement)"}`,
        );
      }
    }
  }
  const summaries = progress.summaries.slice(-5).map((s) => `- ${day(s.at)} ${s.kind}: ${cut(s.summary, 300)} Next: ${cut(s.nextStep, 150)}`);
  if (summaries.length) lines.push(`\n## Recent session summaries\n${summaries.join("\n")}`);
  if (progress.projects.length) lines.push(`\n## Projects\n${progress.projects.map((p) => `- ${p.title}: ${p.status}`).join("\n")}`);
  const due = dueItems(progress.reviewCards, now).length;
  lines.push(`\nReview cards: ${progress.reviewCards.length}, ${due} due now.`);
  const text = lines.join("\n");
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}\n… (cut to fit)` : text;
}

/** Recent activity for the chat's get_recent_activity tool: lessons, answers, reviews and course changes, newest first. */
export function recentActivity(days: number, courseId?: string, now = new Date()): string {
  const since = now.getTime() - days * 86_400_000;
  const titles = new Map(store.courseIds().map((id) => [id, store.content(id)?.title ?? store.progress(id).topic]));
  const events = store
    .events()
    .filter((e) => new Date(e.at).getTime() >= since && (!courseId || e.courseId === courseId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 120);
  const describe = (e: ActivityEvent): string => {
    const where = titles.get(e.courseId) ?? e.courseId;
    switch (e.type) {
      case "answer":
        return `${e.at.slice(0, 16)} ${where}: ${e.kind} answer${e.objectiveId ? ` on ${e.objectiveId}` : ""}, score ${e.score.toFixed(1)}${e.hintsUsed ? `, ${e.hintsUsed} hint(s)` : ""}${e.misconceptions.length ? `, showed: ${e.misconceptions.map((m) => cut(m.label, 80)).join("; ")}` : ""}`;
      case "hint":
        return `${e.at.slice(0, 16)} ${where}: took a hint`;
      case "review":
        return `${e.at.slice(0, 16)} ${where}: reviewed a card, "${e.grade}"`;
      case "session_end":
        return `${e.at.slice(0, 16)} ${where}: finished a ${e.kind} session${e.minutes !== undefined ? ` (${e.minutes} min)` : ""}`;
      case "course_revised":
        return `${e.at.slice(0, 16)} ${where}: course changed from the chat: ${cut(e.summary, 200)}`;
    }
  };
  const summaries = store
    .courseIds()
    .filter((id) => !courseId || id === courseId)
    .flatMap((id) => store.progress(id).summaries.filter((s) => new Date(s.at).getTime() >= since).map((s) => ({ at: s.at, text: `${s.at.slice(0, 16)} ${titles.get(id)}: ${s.kind} summary: ${cut(s.summary, 300)}` })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((s) => s.text);
  if (!events.length && !summaries.length) return `Nothing in the last ${days} days.`;
  return `# Activity in the last ${days} days${courseId ? ` (${courseId})` : ""}, newest first\n${events.map(describe).join("\n")}${summaries.length ? `\n\n# Session summaries\n${summaries.join("\n")}` : ""}`;
}
