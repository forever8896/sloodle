import { beforeEach, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { z } from "zod";
import { imageId, ImageLibrary, sniffImage, type ImageCandidate, type ImageSource } from "./images";
import { Session } from "./session";
import { dataDir, store } from "./store";
import type { SessionEvent, SessionKind } from "./types";
import { everyBlock, SAMPLE_IMAGE_ID, sampleCourse, sampleCredit, tinyPng } from "./testdata";

if (!dataDir.startsWith(tmpdir())) throw new Error(`Tests must not use the real data folder (${dataDir}).`);

const COURSE = "pictures-abc123";

const candidate: ImageCandidate = {
  id: imageId("commons", "File:RWS Tarot 00 Fool.jpg"),
  title: "RWS Tarot 00 Fool",
  description: "The Fool card from the 1909 Rider-Waite deck.",
  width: 1144,
  height: 1919,
  credit: { ...sampleCredit(), title: "RWS Tarot 00 Fool.jpg", licence: "Public domain" },
  fetchUrl: "https://upload.wikimedia.org/x.jpg",
};

const offline: ImageSource = {
  provider: "commons",
  search: async () => [candidate],
  download: async () => ({ bytes: tinyPng(), type: sniffImage(tinyPng())! }),
};

/** A session whose tools run for real, without a model, and whose picture search never leaves the machine. */
function open(kind: SessionKind) {
  const events: SessionEvent[] = [];
  const session = new Session(kind === "lesson" ? "lesson-1" : kind, COURSE, kind, (e) => events.push(e), () => undefined);
  (session as any).input = { push: () => undefined, close: () => undefined };
  (session as any).pictures = new ImageLibrary(COURSE, [offline]);
  const tools = (session as any).tools() as { name: string; inputSchema: z.ZodRawShape; handler: (args: any, extra: unknown) => Promise<any> }[];
  const call = (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`No tool ${name}`);
    return tool.handler(z.object(tool.inputSchema).parse(args), {});
  };
  const text = (result: { content: { text: string }[] }) => result.content[0]!.text;
  return { events, call, text, names: tools.map((t) => t.name) };
}

beforeEach(() => {
  const course = sampleCourse();
  course.id = COURSE;
  course.modules[0]!.objectives[1]!.lesson.blocks = everyBlock().filter((b) => b.type !== "image");
  store.saveContent(course);
  store.saveProgress({ format: "sloodle.progress", version: 1, id: COURSE, topic: "tarot", createdAt: new Date().toISOString(), phase: "ready", origin: { kind: "generated", at: new Date().toISOString() }, objectiveStates: {}, summaries: [], projects: [], reviewCards: [], sdkSessions: {} });
});

test("the tutor can only show pictures it found, and is told what it cannot see", async () => {
  const { events, call, text, names } = open("lesson");
  expect(names).toEqual(expect.arrayContaining(["find_images", "show_image"]));

  const invented = await call("show_image", { images: [{ image: imageId("commons", "File:Invented.jpg"), alt: "Something." }] });
  expect(invented.isError).toBe(true);
  expect(text(invented)).toContain("find_images");
  const url = await call("show_image", { images: [{ image: "https://example.com/fool.jpg", alt: "The Fool." }] });
  expect(url.isError).toBe(true);
  expect(events.some((e) => e.t === "component")).toBe(false);

  const found = await call("find_images", { query: "Rider-Waite The Fool" });
  expect(text(found)).toContain(candidate.id);
  expect(text(found)).toContain("Public domain");
  expect(text(found)).not.toContain("upload.wikimedia.org");

  const shown = await call("show_image", { images: [{ image: candidate.id, alt: "The Fool card: a young man at a cliff edge." }], caption: "Where is he looking?" });
  expect(shown.isError).toBeFalsy();
  expect(text(shown)).toContain(candidate.description);
  expect(text(shown)).toContain("cannot see");
  const component = events.find((e): e is Extract<SessionEvent, { t: "component" }> => e.t === "component")!.component;
  expect(component).toMatchObject({ type: "image", intent: "visual", caption: "Where is he looking?", images: [{ src: `/images/${COURSE}/${candidate.id}`, credit: candidate.credit }] });
});

test("the planner's image blocks are downloaded and credited when the plan is saved", async () => {
  const progress = store.progress(COURSE);
  progress.phase = "planning";
  store.saveProgress(progress);
  const { call, text, names } = open("planning");
  expect(names).toContain("find_images");
  expect(names).not.toContain("show_image");
  const course = store.content(COURSE)!;
  const plan = (pictureId: string) => ({
    moduleId: "m1",
    plans: course.modules[0]!.objectives.map((o, i) => ({
      objectiveId: o.id,
      ...o.lesson,
      blocks: i === 0 ? [...o.lesson.blocks, { id: "m1-pic", intent: "visual", type: "image", images: [{ image: pictureId, alt: "The Fool card." }] }] : o.lesson.blocks,
    })),
  });

  const refused = await call("save_lesson_plans", plan(SAMPLE_IMAGE_ID));
  expect(refused.isError).toBe(true);
  expect(text(refused)).toContain("Nothing was saved");

  await call("find_images", { query: "the fool" });
  const saved = await call("save_lesson_plans", plan(candidate.id));
  expect(saved.isError).toBeFalsy();
  const block = store.content(COURSE)!.modules[0]!.objectives[0]!.lesson.blocks.find((b) => b.id === "m1-pic");
  expect(block).toMatchObject({ type: "image", images: [{ image: candidate.id, credit: candidate.credit }] });
});
