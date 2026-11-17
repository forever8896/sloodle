// The media manifest: which clips exist for each of Sloo's states. The contract is documented in docs/sloo-character.md.

const STATES = ["idle", "listening", "thinking", "writing", "talking", "happy", "cheer", "wave"] as const;
const REACTIONS = ["correct", "encourage"] as const;

type SlooState = (typeof STATES)[number];
type SlooReaction = (typeof REACTIONS)[number];
type SlooMedia = SlooState | SlooReaction;

interface StateEntry {
  /** Clip names without extension. Several are variants, played in turn so a loop does not look mechanical. */
  clips: string[];
  /** "loop" repeats; "once" plays a single time. Reactions are always "once" and then hand back. */
  play: "loop" | "once";
  intro?: string;
  outro?: string;
  /** Still image for this state; defaults to the first clip's `<clip>.png`, then the manifest poster. */
  poster?: string;
  /** Idle only: after `after` seconds of looping, settle on the still and play one loop every `every` seconds. */
  rest?: { after: number; every: [number, number] };
}

interface Manifest {
  /** Where every file name in the manifest is resolved from. */
  base: string;
  poster?: string;
  /** Draw a soft ground shadow under the clips (the clips themselves have none). */
  shadow: boolean;
  states: Partial<Record<SlooMedia, StateEntry>>;
  url: (file: string) => string;
}

const fallbacks: Record<SlooMedia, SlooMedia[]> = {
  idle: [],
  listening: ["idle"],
  thinking: ["idle"],
  writing: ["thinking", "idle"],
  talking: ["idle"],
  happy: ["cheer", "idle"],
  cheer: ["happy", "idle"],
  wave: ["happy", "idle"],
  correct: ["happy", "cheer"],
  encourage: ["cheer", "happy"],
};

/** The entry that plays for a state: its own, or the nearest stand-in (writing falls back to thinking, and so on). */
function entryFor(manifest: Manifest, media: SlooMedia): StateEntry | undefined {
  for (const name of [media, ...fallbacks[media]]) {
    const entry = manifest.states[name];
    if (entry) return entry;
  }
  return undefined;
}

function posterFor(manifest: Manifest, media: SlooMedia): string | undefined {
  const entry = entryFor(manifest, media);
  const file = entry?.poster ?? (entry ? `${entry.intro ?? entry.clips[0]}.png` : manifest.poster);
  return file ? manifest.url(file) : undefined;
}

const isMedia = (name: string): name is SlooMedia => (STATES as readonly string[]).includes(name) || (REACTIONS as readonly string[]).includes(name);
const isName = (value: unknown): value is string => typeof value === "string" && /^[\w.-]+$/.test(value);

/** Checks a parsed manifest.json; unknown states and malformed entries are dropped with a warning. */
function parseManifest(json: unknown, base: string, url?: (file: string) => string): Manifest | undefined {
  if (!json || typeof json !== "object") return undefined;
  const raw = json as { version?: unknown; poster?: unknown; shadow?: unknown; states?: Record<string, unknown> };
  if (raw.version !== 1) {
    console.warn("Sloo manifest: expected version 1");
    return undefined;
  }
  const states: Manifest["states"] = {};
  for (const [name, value] of Object.entries(raw.states ?? {})) {
    const entry = value as Partial<StateEntry> & { clips?: unknown };
    const clips = typeof entry?.clips === "string" ? [entry.clips] : Array.isArray(entry?.clips) ? entry.clips : [];
    if (!isMedia(name) || clips.length === 0 || !clips.every(isName)) {
      console.warn(`Sloo manifest: skipping state "${name}"`);
      continue;
    }
    const reaction = (REACTIONS as readonly string[]).includes(name);
    const rest = entry.rest;
    states[name] = {
      clips,
      play: reaction || entry.play === "once" ? "once" : "loop",
      intro: isName(entry.intro) ? entry.intro : undefined,
      outro: isName(entry.outro) ? entry.outro : undefined,
      poster: isName(entry.poster) ? entry.poster : undefined,
      rest:
        rest && typeof rest.after === "number" && Array.isArray(rest.every) && rest.every.length === 2
          ? { after: rest.after, every: [Number(rest.every[0]), Number(rest.every[1])] }
          : undefined,
    };
  }
  const poster = isName(raw.poster) ? raw.poster : undefined;
  if (!states.idle && !poster) return undefined;
  return {
    base,
    poster,
    shadow: raw.shadow !== false,
    states,
    url: url ?? ((file) => new URL(file, base).href),
  };
}

const MANIFEST_URL = "/sloo/manifest.json";
const loaded = new Map<string, Promise<Manifest | undefined>>();

/**
 * Loads a manifest once per address. Resolves undefined when there is none, or it has neither an idle clip nor a poster:
 * the drawn Sloo is used then. A manifest with only a poster shows that still, moved with CSS.
 */
function loadManifest(address = MANIFEST_URL): Promise<Manifest | undefined> {
  let promise = loaded.get(address);
  if (!promise) {
    const base = new URL(address, location.href).href;
    promise = fetch(base)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((json) => parseManifest(json, base))
      .catch(() => undefined);
    loaded.set(address, promise);
  }
  return promise;
}

/** Registers a manifest built in code (the audition page's synthetic clips) under a name usable as `media`. */
function provideManifest(name: string, manifest: Manifest | undefined): void {
  loaded.set(name, Promise.resolve(manifest));
}

export { entryFor, loadManifest, MANIFEST_URL, parseManifest, posterFor, provideManifest, REACTIONS, STATES };
export type { Manifest, SlooMedia, SlooReaction, SlooState, StateEntry };
