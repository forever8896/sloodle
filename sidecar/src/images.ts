// Pictures for lessons. The engine searches openly licensed images (Wikimedia Commons, through its public API: no key,
// no cost), downloads only the one the tutor or planner picked, as a scaled thumbnail, into the course folder, and
// serves it to the window from its own local server. The model only ever names an image by the id of a search
// result, so it cannot put an invented address on screen, and a lesson seen again offline still has its pictures.
//
// A second source (generated pictures, say) implements ImageSource, joins `imageProviders` in formats.ts, and is
// added to `sources` below; the cache, the route, sharing and the block do not change.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { imageIdSchema, type CourseDoc, type ImageCredit, type ImageProvider, type LessonBlock, type LessonImage } from "./formats";
import { courseDir } from "./store";

/** Sent with every request to Wikimedia, as its API policy asks. Generic on purpose: nothing about the person. */
export const USER_AGENT = "Sloodle/0.1 (desktop learning app)";
/** Thumbnail width requested from the source: sharp in a lesson card and when enlarged, small enough to share. */
export const THUMB_WIDTH = 960;
/** The largest picture the engine keeps, downloaded or imported. */
export const MAX_IMAGE_BYTES = 2_500_000;
/** Above this the full-width thumbnail is swapped for a smaller one. */
const PREFERRED_IMAGE_BYTES = 1_000_000;

export const imageTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
export type ImageType = keyof typeof imageTypes;

/** A search result. `fetchUrl` stays in the engine; the model sees the id, title, description and credit. */
export interface ImageCandidate {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  credit: ImageCredit;
  fetchUrl: string;
}

export interface ImageSource {
  provider: ImageProvider;
  search(query: string, limit: number): Promise<ImageCandidate[]>;
  /** The picture's bytes, already checked to be one of `imageTypes` and under MAX_IMAGE_BYTES. */
  download(candidate: ImageCandidate): Promise<{ bytes: Uint8Array; type: ImageType }>;
}

/** What the cache keeps next to each picture. */
export interface CachedImage {
  id: string;
  type: ImageType;
  title: string;
  description: string;
  credit: ImageCredit;
  savedAt: string;
}

export function imageId(provider: ImageProvider, key: string): string {
  return `img-${createHash("sha256").update(`${provider}:${key}`).digest("hex").slice(0, 16)}`;
}

// ---------------------------------------------------------------- checking bytes

/** The type the bytes really are, from their first bytes, whatever a server or a file claims. */
export function sniffImage(bytes: Uint8Array): ImageType | undefined {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return undefined;
}

// ---------------------------------------------------------------- Wikimedia Commons

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** Thumbnails and small originals are served from these hosts only. */
const COMMONS_MEDIA_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
/** Originals Commons can make a JPEG or PNG thumbnail of. Video, audio, PDF and 3D files are left out. */
const COMMONS_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/tiff"]);
const MIN_SIDE = 250;
const MAX_PIXELS = 400_000_000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Commons metadata is HTML: keep the text, drop the markup. */
export function plainText(html: string, max: number): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(\w+)[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function mediaUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !COMMONS_MEDIA_HOSTS.has(url.hostname)) return undefined;
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function httpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.startsWith("//") ? `https:${raw}` : raw.replace(/^http:\/\//i, "https://");
  return /^https:\/\/[^\s]+$/i.test(value) && value.length <= 2000 ? value : undefined;
}

type Meta = Record<string, { value?: unknown } | undefined>;

/** The usable results of a Commons search, best first. Pure, so it is tested against a recorded response. */
export function parseCommonsSearch(response: unknown): ImageCandidate[] {
  const pages = (response as { query?: { pages?: unknown } })?.query?.pages;
  if (!Array.isArray(pages)) return [];
  const out: (ImageCandidate & { rank: number })[] = [];
  for (const page of pages as Record<string, unknown>[]) {
    const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
    if (!info || typeof page.title !== "string") continue;
    const meta = (info.extmetadata ?? {}) as Meta;
    // Wikidata-backed fields can leak machine labels ("title QS:P1476,..."); treat those as missing.
    const field = (key: string, max: number) => {
      const value = plainText(String(meta[key]?.value ?? ""), max);
      return /\bQS:[PL]/.test(value) ? "" : value;
    };
    const width = Number(info.width);
    const height = Number(info.height);
    const fetchUrl = mediaUrl(info.thumburl);
    const sourceUrl = httpsUrl(info.descriptionurl);
    const licence = field("LicenseShortName", 100);
    if (!COMMONS_SOURCE_TYPES.has(String(info.mime))) continue;
    if (!(Math.min(width, height) >= MIN_SIDE) || width * height > MAX_PIXELS) continue;
    if (!fetchUrl || !sourceUrl || !licence) continue;
    if (String(meta.NonFree?.value ?? "").toLowerCase() === "true") continue;
    const fileTitle = page.title.replace(/^File:/, "");
    const title = (field("ObjectName", 200) || fileTitle.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200);
    const licenceUrl = httpsUrl(meta.LicenseUrl?.value);
    out.push({
      rank: Number(page.index ?? out.length),
      id: imageId("commons", page.title),
      title,
      description: field("ImageDescription", 500),
      width,
      height,
      fetchUrl,
      credit: {
        provider: "commons",
        title: plainText(fileTitle, 200),
        author: field("Artist", 200) || field("Credit", 200) || "Unknown author (see the source page)",
        licence,
        ...(licenceUrl ? { licenceUrl } : {}),
        sourceUrl,
      },
    });
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...candidate }) => candidate);
}

export function commonsSearchUrl(query: string, limit: number): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(20, limit * 2)),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "ObjectName|ImageDescription|Artist|Credit|LicenseShortName|LicenseUrl|NonFree",
    iiextmetadatalanguage: "en",
    origin: "*",
  });
  return `${COMMONS_API}?${params}`;
}

async function readCapped(response: Response, max: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new TooLarge();
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export const commons: ImageSource = {
  provider: "commons",

  async search(query, limit) {
    const response = await fetch(commonsSearchUrl(query, limit), { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Wikimedia Commons answered ${response.status}.`);
    return parseCommonsSearch(await response.json()).slice(0, limit);
  },

  async download(candidate) {
    try {
      return await fetchImage(candidate.fetchUrl, PREFERRED_IMAGE_BYTES);
    } catch (error) {
      // A PNG rendition of a large scan is heavy at full width, and every picture travels in shared courses: take
      // Wikimedia's next standard thumbnail step down instead.
      const smaller = candidate.fetchUrl.replace(`/${THUMB_WIDTH}px-`, "/500px-");
      if (error instanceof TooLarge && smaller !== candidate.fetchUrl) return fetchImage(smaller, MAX_IMAGE_BYTES);
      throw error;
    }
  },
};

class TooLarge extends Error {
  constructor() {
    super("That picture is too large.");
  }
}

async function fetchImage(address: string, max: number): Promise<{ bytes: Uint8Array; type: ImageType }> {
  if (!mediaUrl(address)) throw new Error("That picture is not on Wikimedia's media servers.");
  const get = () => fetch(address, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  let response = await get();
  if (response.status === 429 || response.status === 503) {
    // Wikimedia throttles bursts of uncached downloads; wait as asked (briefly) and try once more.
    const wait = Math.min(5, Math.max(1, Number(response.headers.get("retry-after")) || 2));
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    response = await get();
  }
  if (response.status === 429) throw new Error("Wikimedia is busy right now. Try again in a minute, or pick another picture.");
  if (!response.ok) throw new Error(`Wikimedia answered ${response.status} for that picture.`);
  if (!mediaUrl(response.url)) throw new Error("That picture was redirected away from Wikimedia.");
  const declared = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!(declared in imageTypes)) throw new Error(`That file is not a picture the app shows (${declared || "no type"}).`);
  const bytes = await readCapped(response, max);
  const type = sniffImage(bytes);
  if (!type) throw new Error("That file is not a picture the app shows.");
  return { bytes, type };
}

export const sources: Record<ImageProvider, ImageSource> = { commons };

// ---------------------------------------------------------------- the cache in the course folder

export function imagesDir(courseId: string): string {
  return join(courseDir(courseId), "images");
}

function metaPath(courseId: string, id: string): string {
  if (!imageIdSchema.safeParse(id).success) throw new Error(`Invalid image id: ${id}`);
  return join(imagesDir(courseId), `${id}.json`);
}

function filePath(courseId: string, image: Pick<CachedImage, "id" | "type">): string {
  return join(imagesDir(courseId), `${image.id}.${imageTypes[image.type]}`);
}

export function cachedImage(courseId: string, id: string): CachedImage | undefined {
  if (!imageIdSchema.safeParse(id).success) return undefined;
  const path = metaPath(courseId, id);
  if (!existsSync(path)) return undefined;
  try {
    const meta = JSON.parse(readFileSync(path, "utf8")) as CachedImage;
    return meta.id === id && meta.type in imageTypes && existsSync(filePath(courseId, meta)) ? meta : undefined;
  } catch {
    return undefined;
  }
}

export function readCachedImage(courseId: string, id: string): { meta: CachedImage; bytes: Uint8Array } | undefined {
  const meta = cachedImage(courseId, id);
  return meta && { meta, bytes: new Uint8Array(readFileSync(filePath(courseId, meta))) };
}

/** Writes a picture and its record. The bytes are checked again here, whoever supplied them. */
export function saveImage(courseId: string, meta: Omit<CachedImage, "type" | "savedAt">, bytes: Uint8Array): CachedImage {
  const type = sniffImage(bytes);
  if (!type) throw new Error("That file is not a picture the app shows.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("That picture is too large.");
  const record: CachedImage = { ...meta, type, savedAt: new Date().toISOString() };
  mkdirSync(imagesDir(courseId), { recursive: true });
  const write = (path: string, data: Uint8Array | string) => {
    writeFileSync(`${path}.tmp`, data);
    renameSync(`${path}.tmp`, path);
  };
  write(filePath(courseId, record), bytes);
  write(metaPath(courseId, record.id), JSON.stringify(record, null, 2));
  return record;
}

/** Stores the pictures that came inside a shared course, with the credit its blocks carry. Returns how many. */
export function saveSharedImages(doc: Pick<CourseDoc, "id" | "modules">, images: { id: string; bytes: Uint8Array }[]): number {
  const known = new Map<string, LessonImage>();
  for (const m of doc.modules) for (const o of m.objectives) for (const b of o.lesson.blocks) if (b.type === "image") for (const i of b.images) if (i.credit) known.set(i.image, i);
  let saved = 0;
  for (const image of images) {
    const picture = known.get(image.id);
    if (!picture?.credit) continue;
    saveImage(doc.id, { id: image.id, title: picture.credit.title, description: picture.alt, credit: picture.credit }, image.bytes);
    saved += 1;
  }
  return saved;
}

/** A cached picture in the form a shared file carries it. */
export function sharedImage(courseId: string, id: string): { id: string; type: ImageType; bytes: Uint8Array } | undefined {
  const found = readCachedImage(courseId, id);
  return found && { id, type: found.meta.type, bytes: found.bytes };
}

const imageHeaders = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };

/** GET /images/<courseId>/<imageId>: a cached picture. Ids are content-addressed, so the browser may keep it. */
export function serveImage(courseId: string, id: string): Response {
  let found: ReturnType<typeof readCachedImage>;
  try {
    found = readCachedImage(courseId, id);
  } catch {
    found = undefined;
  }
  if (!found) return new Response("Not found", { status: 404, headers: imageHeaders });
  return new Response(found.bytes as Uint8Array<ArrayBuffer>, {
    headers: { ...imageHeaders, "Content-Type": found.meta.type, "Cache-Control": "private, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'" },
  });
}

// ---------------------------------------------------------------- one session's pictures

/**
 * What one session has found and may use. An id can be used when it came from this session's searches or is already
 * in the course folder; anything else is refused, so the model cannot make a picture up.
 */
export class ImageLibrary {
  private found = new Map<string, { source: ImageSource; candidate: ImageCandidate }>();

  constructor(
    private readonly courseId: string,
    private readonly available: ImageSource[] = Object.values(sources),
  ) {}

  async find(query: string, limit = 6): Promise<ImageCandidate[]> {
    const results: ImageCandidate[] = [];
    for (const source of this.available) {
      for (const candidate of await source.search(query, limit)) {
        this.found.set(candidate.id, { source, candidate });
        results.push(candidate);
      }
    }
    return results.slice(0, limit);
  }

  /** Makes sure a picture is in the course folder, downloading it if needed, and returns its record. */
  async use(id: string): Promise<CachedImage> {
    const cached = cachedImage(this.courseId, id);
    if (cached) return cached;
    const hit = this.found.get(id);
    if (!hit) throw new Error(`There is no image ${id} in your search results. Search with find_images and use an id it returns.`);
    const { bytes } = await hit.source.download(hit.candidate);
    const { candidate } = hit;
    return saveImage(this.courseId, { id, title: candidate.title, description: candidate.description, credit: candidate.credit }, bytes);
  }

  /**
   * Fills in each picture's credit from its source (whatever the model wrote there), downloading any not cached yet.
   * Returns problems instead of throwing, so a planner can be told everything at once.
   */
  async attach(blocks: LessonBlock[]): Promise<{ problems: string[]; used: CachedImage[] }> {
    const problems: string[] = [];
    const used: CachedImage[] = [];
    for (const block of blocks) {
      if (block.type !== "image") continue;
      for (const picture of block.images) {
        try {
          const record = await this.use(picture.image);
          picture.credit = record.credit;
          used.push(record);
        } catch (error) {
          problems.push(`Block "${block.id}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return { problems, used };
  }
}

/** One search result as the model reads it. The model cannot see pictures, so this is all it knows about one. */
export function describeCandidate(c: ImageCandidate, index: number): string {
  return `${index + 1}. ${c.id}: "${c.title}" (${c.width}×${c.height}, ${c.credit.licence}, by ${c.credit.author})${c.description ? `\n   Description: ${c.description}` : "\n   No description."}`;
}

export const providerNames: Record<ImageProvider, string> = { commons: "Wikimedia Commons" };
