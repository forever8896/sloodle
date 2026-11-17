// Sample data shared by the tests.
import type { ActivityEvent, AnswerEvent, CourseDoc, ImageCredit, LessonBlock } from "./formats";

export function sampleCourse(): CourseDoc {
  return {
    format: "sloodle.course",
    version: 1,
    id: "fractions-abc123",
    title: "Fractions for Cooking",
    subject: "fractions",
    summary: "Add and scale fractions confidently in recipes.",
    audience: "Adults who can add whole numbers and want to scale recipes.",
    language: "en",
    tags: ["math"],
    createdAt: "2026-11-01T10:00:00.000Z",
    modules: [
      {
        id: "m1",
        title: "What a fraction is",
        why: "Scaling a recipe starts with reading its fractions.",
        objectives: [
          {
            id: "m1-read",
            statement: "Can say what the top and bottom number of a fraction mean, given a recipe amount.",
            level: "understand",
            prerequisites: [],
            lesson: {
              keyIdeas: ["The bottom number says how many equal parts make a whole.", "The top number counts the parts you have."],
              misconceptions: [{ id: "m1-read-x1", belief: "A bigger bottom number means a bigger fraction.", correction: "More parts means smaller parts." }],
              blocks: [
                { id: "m1-read-b1", intent: "activate", body: "Which is more flour: 1/3 cup or 1/4 cup? Guess first." },
                { id: "m1-read-b2", intent: "explain", title: "Parts of a whole", body: "The bottom number splits a whole into equal parts." },
                { id: "m1-read-b3", intent: "practice", body: "Try this one.", checkId: "m1-read-c1" },
              ],
              checks: [
                {
                  id: "m1-read-c1",
                  kind: "choice",
                  prompt: "Which is more: 1/3 cup or 1/4 cup?",
                  options: ["1/3 cup", "1/4 cup"],
                  correctOption: 0,
                  optionMisconceptions: [null, "m1-read-x1"],
                  answerKey: "1/3 cup, because thirds are bigger parts than quarters.",
                  hints: ["Picture one cup cut into three, and another cut into four."],
                  misconceptionIds: ["m1-read-x1"],
                },
                { id: "m1-read-c2", kind: "explain", prompt: "Explain what the 4 in 3/4 means.", answerKey: "The whole is split into 4 equal parts.", hints: [], misconceptionIds: [] },
              ],
              review: [{ front: "What does the bottom number of a fraction count?", back: "How many equal parts make a whole." }],
            },
          },
          {
            id: "m1-scale",
            statement: "Can double a recipe amount given as a fraction.",
            level: "apply",
            prerequisites: ["m1-read"],
            lesson: { keyIdeas: [], misconceptions: [], blocks: [], checks: [], review: [] },
          },
        ],
      },
    ],
    sources: [{ title: "Khan Academy: Fractions", url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic", kind: "course", why: "Clear visuals." }],
  };
}

let n = 0;
export function answer(over: Partial<AnswerEvent> = {}): AnswerEvent {
  n += 1;
  return {
    id: `a${n}`,
    at: "2026-11-10T19:00:00",
    courseId: "c1",
    source: "live",
    type: "answer",
    sessionId: "s1",
    questionId: `q${n}`,
    kind: "short",
    score: 1,
    hintsUsed: 0,
    hintsAvailable: 2,
    presented: [],
    misconceptions: [],
    ...over,
  };
}

export function many(count: number, make: (i: number) => ActivityEvent): ActivityEvent[] {
  return Array.from({ length: count }, (_, i) => make(i));
}

/** One block of every catalogue type, valid as written. */
export function everyBlock(prefix = "m1-scale"): LessonBlock[] {
  return [
    { id: `${prefix}-b1`, intent: "explain", body: "To double a fraction, double the top number." },
    { id: `${prefix}-b2`, intent: "visual", type: "diagram", kind: "flowchart", source: "flowchart LR\n  A[Read the amount] --> B[Double the top] --> C[Simplify]", description: "Read the amount, double the top number, then simplify." },
    { id: `${prefix}-b3`, intent: "example", type: "code", language: "javascript", code: "const double = (n, d) => [2 * n, d];\nconsole.log(double(3, 4));", runnable: true },
    { id: `${prefix}-b4`, intent: "practice", type: "ordering", prompt: "Put the steps in order.", items: ["Read the amount", "Double the top number", "Simplify"], explanation: "You cannot simplify before you have the new amount.", hints: ["What do you need first?"] },
    { id: `${prefix}-b5`, intent: "practice", type: "matching", prompt: "Match each amount with its double.", pairs: [{ left: "1/4", right: "1/2" }, { left: "1/3", right: "2/3" }, { left: "3/4", right: "1 1/2" }], distractors: ["2/8"], hints: [] },
    { id: `${prefix}-b6`, intent: "recall", type: "blanks", mode: "prose", text: "Doubling 3/4 gives {{1}}, which is {{2}} cups.", blanks: [{ accept: ["6/4", "3/2"] }, { accept: ["1.5", "one and a half"] }], hints: [] },
    { id: `${prefix}-b7`, intent: "example", type: "steps", prompt: "Double 2/3 cup.", steps: [{ text: "Double the top: 4/3." }, { text: "Rewrite as 1 1/3 cups.", predict: "What would you do with 4/3?" }] },
    { id: `${prefix}-b8`, intent: "recall", type: "flashcard", front: "What changes when you double a fraction?", back: "Only the top number." },
    { id: `${prefix}-b9`, intent: "visual", type: "table", columns: ["Amount", "Doubled", "As a mixed number"], rows: [{ label: "1/4", cells: ["2/4", "1/2"] }, { label: "5/8", cells: ["10/8", "1 1/4"] }] },
    { id: `${prefix}-b10`, intent: "explain", type: "callout", tone: "common-mistake", body: "Doubling the bottom number halves the amount." },
    {
      id: `${prefix}-b11`,
      intent: "visual",
      type: "image",
      caption: "Measuring cups marked in fractions.",
      images: [{ image: SAMPLE_IMAGE_ID, alt: "A set of four measuring cups, labelled 1, 1/2, 1/3 and 1/4 cup.", credit: sampleCredit() }],
    },
  ];
}

export const SAMPLE_IMAGE_ID = "img-0123456789abcdef";

export function sampleCredit(): ImageCredit {
  return { provider: "commons", title: "Measuring cups.jpg", author: "A. Photographer", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Measuring_cups.jpg" };
}

/** The smallest valid PNG: one transparent pixel. */
export function tinyPng(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
}

/** The sample course with one block of every type in its second objective. */
export function courseWithEveryBlock(): CourseDoc {
  const course = sampleCourse();
  course.modules[0]!.objectives[1]!.lesson.blocks = everyBlock();
  return course;
}
