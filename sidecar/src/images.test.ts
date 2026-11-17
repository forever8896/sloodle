import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { present } from "./catalogue";
import { exportCourse, importCourse, MAX_IMPORT_BYTES } from "./courseio";
import { blockProblems, blockSchema, type BlockOf, type LessonBlock } from "./formats";
import {
  cachedImage,
  commonsSearchUrl,
  describeCandidate,
  imageId,
  ImageLibrary,
  parseCommonsSearch,
  plainText,
  saveImage,
  saveSharedImages,
  serveImage,
  sharedImage,
  sniffImage,
  USER_AGENT,
  type ImageCandidate,
  type ImageSource,
} from "./images";
import { courseWithEveryBlock, SAMPLE_IMAGE_ID, sampleCredit, tinyPng } from "./testdata";

/** A real Commons answer for "Rider-Waite The Fool", recorded so tests never touch the network. */
const fixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "commons-search.json"), "utf8"));
const now = new Date("2026-11-17T12:00:00Z");
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

let courseCount = 0;
const freshCourse = () => `img-test-${++courseCount}`;

function imageBlock(over: Partial<BlockOf<"image">> = {}): BlockOf<"image"> {
  return { id: "m1-cards-b1", intent: "visual", type: "image", images: [{ image: SAMPLE_IMAGE_ID, alt: "The Fool card: a young man at a cliff edge with a small dog.", credit: sampleCredit() }], ...over };
}

describe("Commons search results", () => {
  test("the recorded response parses into credited candidates, best first", () => {
    const results = parseCommonsSearch(fixture);
    expect(results.length).toBe(5);
    expect(results[0]).toMatchObject({
      id: imageId("commons", "File:The Fool (Rider-Waite Smith tarot deck).png"),
      title: "The Fool (Rider-Waite Smith tarot deck)",
      width: 2100,
      height: 3600,
      credit: {
        provider: "commons",
        title: "The Fool (Rider-Waite Smith tarot deck).png",
        author: "Pamela Colman Smith",
        licence: "Public domain",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Fool_(Rider-Waite_Smith_tarot_deck).png",
      },
    });
    for (const r of results) {
      expect(r.id).toMatch(/^img-[0-9a-f]{16}$/);
      expect(new URL(r.fetchUrl).hostname).toMatch(/^(upload|thumb)\.wikimedia\.org$/);
      expect(r.fetchUrl).not.toContain("?");
      expect(r.credit.author).not.toMatch(/[<>]/);
      expect(r.description).not.toMatch(/<[a-z]/i);
      expect(blockSchema.safeParse(imageBlock({ images: [{ image: r.id, alt: "A tarot card.", credit: r.credit }] })).success).toBe(true);
    }
    // The model reads ids, titles, descriptions and credits; never a download address.
    const told = results.map(describeCandidate).join("\n");
    expect(told).toContain(results[0]!.id);
    expect(told).not.toContain("wikimedia.org/wikipedia");
  });

  test("results that are not usable pictures are dropped", () => {
    const page = (title: string, info: Record<string, unknown>, meta: Record<string, string> = {}) => ({
      title,
      index: 1,
      imageinfo: [
        {
          mime: "image/jpeg",
          width: 1200,
          height: 900,
          thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/960px-x.jpg`,
          descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
          ...info,
          extmetadata: Object.fromEntries(Object.entries({ LicenseShortName: "CC BY-SA 4.0", LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", Artist: '<a href="//x">Jo &amp; Co</a>', ...meta }).map(([k, v]) => [k, { value: v }])),
        },
      ],
    });
    const results = parseCommonsSearch({
      query: {
        pages: [
          page("File:Good.jpg", {}),
          page("File:Clip.webm", { mime: "video/webm" }),
          page("File:Doc.pdf", { mime: "application/pdf" }),
          page("File:Icon.png", { width: 64, height: 64 }),
          page("File:Elsewhere.jpg", { thumburl: "https://example.com/x.jpg" }),
          page("File:Plain-http.jpg", { thumburl: "http://upload.wikimedia.org/x.jpg" }),
          page("File:Unlicensed.jpg", {}, { LicenseShortName: "" }),
          page("File:Logo.jpg", {}, { NonFree: "true" }),
          page("File:Map.svg", { mime: "image/svg+xml" }),
        ],
      },
    });
    expect(results.map((r) => r.credit.title)).toEqual(["Good.jpg", "Map.svg"]);
    expect(results[0]!.credit).toMatchObject({ author: "Jo & Co", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0" });
    expect(parseCommonsSearch({ error: "nope" })).toEqual([]);
    expect(parseCommonsSearch(null)).toEqual([]);
  });

  test("the search asks Commons for scaled image thumbnails, with nothing personal in it", () => {
    const url = new URL(commonsSearchUrl("Rider-Waite The Fool", 6));
    expect(url.origin).toBe("https://commons.wikimedia.org");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(url.searchParams.get("gsrsearch")).toContain("filetype:bitmap|drawing");
    expect(url.searchParams.get("iiurlwidth")).toBe("960");
    expect(USER_AGENT).toBe("Sloodle/0.1 (desktop learning app)");
  });

  test("metadata HTML becomes plain text", () => {
    expect(plainText('<bdi><a href="x"><span title="t">Pamela</span></a></bdi> &amp; &#x41;&#66; <script>bad()</script>x', 100)).toBe("Pamela & AB x");
    expect(plainText("a".repeat(50), 10)).toBe(`${"a".repeat(9)}…`);
    expect(plainText('Mona Lisa<div style="display: none;">title QS:P1476,pl:"Mona Lisa"</div>', 100)).toBe("Mona Lisa");
  });

  test("Wikidata labels that leak into a title fall back to the file name", () => {
    const [result] = parseCommonsSearch({
      query: {
        pages: [
          {
            title: "File:Mona Lisa, by Leonardo da Vinci.jpg",
            index: 1,
            imageinfo: [
              {
                mime: "image/jpeg",
                width: 7479,
                height: 11146,
                thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona.jpg/960px-Mona.jpg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Mona.jpg",
                extmetadata: { ObjectName: { value: 'Polish: Mona Lisa <span>title QS:P1476,pl:"Mona Lisa"</span>' }, LicenseShortName: { value: "Public domain" }, Artist: { value: "Leonardo da Vinci" } },
              },
            ],
          },
        ],
      },
    });
    expect(result!.title).toBe("Mona Lisa, by Leonardo da Vinci");
  });
});

describe("the image block", () => {
  test("validates source, alt text and size", () => {
    expect(blockSchema.safeParse(imageBlock()).success).toBe(true);
    expect(blockSchema.safeParse(imageBlock({ images: [{ image: "https://example.com/cat.jpg", alt: "A cat." }] })).success).toBe(false);
    expect(blockSchema.safeParse(imageBlock({ images: [{ image: SAMPLE_IMAGE_ID, alt: "" }] })).success).toBe(false);
    expect(blockSchema.safeParse({ ...imageBlock(), images: [{ image: SAMPLE_IMAGE_ID }] }).success).toBe(false);
    expect(blockSchema.safeParse(imageBlock({ images: [] })).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => ({ image: imageId("commons", `File:${i}.jpg`), alt: "A card.", credit: sampleCredit() }));
    expect(blockSchema.safeParse(imageBlock({ images: seven })).success).toBe(false);
    const badCredit = { ...sampleCredit(), sourceUrl: "javascript:alert(1)" };
    expect(blockSchema.safeParse(imageBlock({ images: [{ image: SAMPLE_IMAGE_ID, alt: "A card.", credit: badCredit }] })).success).toBe(false);
  });

  test("a picture needs its credit, once per block", () => {
    expect(blockProblems(imageBlock())).toEqual([]);
    expect(blockProblems(imageBlock({ images: [{ image: SAMPLE_IMAGE_ID, alt: "A card." }] }))[0]).toContain("no credit");
    const twice = imageBlock().images[0]!;
    expect(blockProblems(imageBlock({ images: [twice, twice] }))[0]).toContain("only once");
  });

  test("the window is sent engine paths, never internet addresses", () => {
    const { view } = present(imageBlock({ caption: "Look at the dog." }), { id: "v1", courseId: "tarot-abc123" });
    expect(view).toMatchObject({ type: "image", caption: "Look at the dog.", images: [{ src: `/images/tarot-abc123/${SAMPLE_IMAGE_ID}`, alt: expect.stringContaining("The Fool"), credit: sampleCredit() }] });
  });
});

/** A stand-in for Commons: no network, and it counts downloads. */
function fakeSource(bytes: () => Uint8Array = tinyPng): ImageSource & { downloads: number } {
  const candidate: ImageCandidate = {
    id: imageId("commons", "File:RWS Tarot 00 Fool.jpg"),
    title: "RWS Tarot 00 Fool",
    description: "The Fool, from the 1909 Rider-Waite deck.",
    width: 1144,
    height: 1919,
    credit: { ...sampleCredit(), title: "RWS Tarot 00 Fool.jpg", licence: "Public domain" },
    fetchUrl: "https://upload.wikimedia.org/x.jpg",
  };
  const source = {
    provider: "commons" as const,
    downloads: 0,
    search: async () => [candidate],
    download: async () => {
      source.downloads += 1;
      const b = bytes();
      return { bytes: b, type: sniffImage(b)! };
    },
  };
  return source;
}

describe("the cache and the route", () => {
  test("only searched or cached pictures can be used, and each downloads once", async () => {
    const courseId = freshCourse();
    const source = fakeSource();
    const library = new ImageLibrary(courseId, [source]);
    await expect(library.use(imageId("commons", "File:Made up.jpg"))).rejects.toThrow("find_images");
    const [found] = await library.find("the fool");
    const record = await library.use(found!.id);
    expect(record).toMatchObject({ id: found!.id, type: "image/png", title: "RWS Tarot 00 Fool", credit: found!.credit });
    await library.use(found!.id);
    expect(source.downloads).toBe(1);
    // A later session finds it in the course folder without searching.
    expect((await new ImageLibrary(courseId, []).use(found!.id)).id).toBe(found!.id);
  });

  test("attach fills in the credit from the source, whatever the model wrote", async () => {
    const courseId = freshCourse();
    const library = new ImageLibrary(courseId, [fakeSource()]);
    const [found] = await library.find("the fool");
    const forged = { ...sampleCredit(), author: "Someone the model made up" };
    const block = imageBlock({ images: [{ image: found!.id, alt: "The Fool card.", credit: forged }] });
    const { problems, used } = await library.attach([block]);
    expect(problems).toEqual([]);
    expect(used).toHaveLength(1);
    expect(block.images[0]!.credit).toEqual(found!.credit);
    const unknown = imageBlock({ images: [{ image: imageId("commons", "File:Nope.jpg"), alt: "Nothing." }] });
    expect((await library.attach([unknown])).problems[0]).toContain(`Block "${unknown.id}"`);
  });

  test("the route serves a cached picture with its real type, and nothing else", async () => {
    const courseId = freshCourse();
    const saved = saveImage(courseId, { id: SAMPLE_IMAGE_ID, title: "Cups", description: "", credit: sampleCredit() }, jpeg());
    expect(saved.type).toBe("image/jpeg");
    const response = serveImage(courseId, SAMPLE_IMAGE_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg());
    expect(serveImage(courseId, imageId("commons", "File:Other.jpg")).status).toBe(404);
    expect(serveImage(courseId, "../course").status).toBe(404);
    expect(serveImage("no-such-course", SAMPLE_IMAGE_ID).status).toBe(404);
  });

  test("bytes that are not a picture, or too many of them, are refused", async () => {
    const courseId = freshCourse();
    const meta = { id: SAMPLE_IMAGE_ID, title: "x", description: "", credit: sampleCredit() };
    expect(() => saveImage(courseId, meta, new TextEncoder().encode("<svg onload=alert(1)>"))).toThrow("not a picture");
    const huge = new Uint8Array(3_000_000);
    huge.set(jpeg());
    expect(() => saveImage(courseId, meta, huge)).toThrow("too large");
    expect(cachedImage(courseId, SAMPLE_IMAGE_ID)).toBeUndefined();
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
  });
});

describe("sharing courses with pictures", () => {
  test("the export embeds each used picture and the import restores it, servable at once", async () => {
    const course = courseWithEveryBlock();
    saveImage(course.id, { id: SAMPLE_IMAGE_ID, title: "Cups", description: "", credit: sampleCredit() }, tinyPng());
    const { json, missingImages } = exportCourse(course, (id) => sharedImage(course.id, id));
    expect(missingImages).toBe(0);
    const file = JSON.parse(json);
    expect(Object.keys(file.images)).toEqual([SAMPLE_IMAGE_ID]);
    expect(file.images[SAMPLE_IMAGE_ID].type).toBe("image/png");

    const { doc, images } = importCourse(json, now);
    expect(images).toHaveLength(1);
    expect(images[0]!.bytes).toEqual(tinyPng());
    expect(JSON.stringify(doc)).not.toContain('"data"');
    expect(saveSharedImages(doc, images)).toBe(1);
    const served = serveImage(doc.id, SAMPLE_IMAGE_ID);
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(tinyPng());
    expect(cachedImage(doc.id, SAMPLE_IMAGE_ID)?.credit).toEqual(sampleCredit());
  });

  test("a course without pictures exports exactly as before, and a missing picture is only counted", () => {
    const course = courseWithEveryBlock();
    course.modules[0]!.objectives[1]!.lesson.blocks = course.modules[0]!.objectives[1]!.lesson.blocks.filter((b: LessonBlock) => b.type !== "image");
    expect(JSON.parse(exportCourse(course).json)).toEqual(course);
    const withPicture = courseWithEveryBlock();
    withPicture.id = "never-cached-abc123";
    const { json, missingImages } = exportCourse(withPicture, () => undefined);
    expect(missingImages).toBe(1);
    expect(JSON.parse(json).images).toBeUndefined();
  });

  test("embedded pictures are untrusted: unused, forged or oversized ones are dropped", () => {
    const course = courseWithEveryBlock();
    const other = imageId("commons", "File:Unused.jpg");
    const file = {
      ...course,
      images: {
        [SAMPLE_IMAGE_ID]: { type: "image/png", data: Buffer.from("<html>not a picture</html>").toString("base64") },
        [other]: { type: "image/png", data: Buffer.from(tinyPng()).toString("base64") },
        "../../evil": { type: "image/png", data: Buffer.from(tinyPng()).toString("base64") },
      },
    };
    const { images } = importCourse(JSON.stringify(file), now);
    expect(images).toEqual([]);
    const big = { ...course, images: { [SAMPLE_IMAGE_ID]: { type: "image/png", data: "A".repeat(4_000_000) } } };
    expect(importCourse(JSON.stringify(big), now).images).toEqual([]);
    expect(MAX_IMPORT_BYTES).toBeLessThan(16 * 1024 * 1024);
  });

  test("a shared picture without a credit does not import", () => {
    const course = courseWithEveryBlock();
    const block = course.modules[0]!.objectives[1]!.lesson.blocks.find((b) => b.type === "image") as BlockOf<"image">;
    delete block.images[0]!.credit;
    expect(() => importCourse(JSON.stringify(course), now)).toThrow("no credit");
  });
});
