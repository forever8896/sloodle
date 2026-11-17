// Turning tutor text into pieces of speech. Pure functions, shared by the engine (audio lessons) and the interface
// (speaking replies while they stream in), so both cut text the same way.

/** Markdown and symbols read badly aloud, so speak a plain version. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A piece of the source text to speak: `start`/`end` index the source, `speech` is what the voice reads. */
export interface SpeechChunk {
  start: number;
  end: number;
  speech: string;
}

export interface ChunkOptions {
  /** The text is complete: whatever is left after `from` is spoken too. */
  final: boolean;
  /**
   * How many of the next chunks may be cut at a clause rather than a sentence end. Speech starts sooner when the
   * opening chunks are short, and later ones are synthesized while those play. Default 0.
   */
  clauses?: number;
}

/** Synthesis time grows with length and cannot be interrupted, so no chunk is longer than this. */
const MAX_CHUNK = 220;
/** A chunk only stops at a clause once it has this many words, so it does not sound clipped. */
const FIRST_CLAUSE_WORDS = 4;

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "prof", "st", "approx", "fig", "no"]);
const CLOSERS = `"')]}”’»*_`;

function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Index just past a sentence end at `i`, or -1. `text[i]` is the candidate punctuation or newline. */
function sentenceEnd(text: string, i: number, final: boolean): number {
  const ch = text[i]!;
  if (ch === "\n") return i + 1;
  if (!".!?…".includes(ch)) return -1;
  let j = i + 1;
  while (j < text.length && ".!?…".includes(text[j]!)) j++;
  while (j < text.length && CLOSERS.includes(text[j]!)) j++;
  if (j >= text.length) return final ? j : -1; // Wait: the next delta may continue this word ("3." then "14").
  if (!/\s/.test(text[j]!)) return -1; // "3.14", "e.g.x", "file.ts"
  if (ch === ".") {
    if (/^\s*\d+$/.test(text.slice(text.lastIndexOf("\n", i - 1) + 1, i))) return -1; // A numbered list item, "1. First".
    const word = /([\p{L}.]+)\.$/u.exec(text.slice(Math.max(0, i - 12), i + 1))?.[1]?.toLowerCase();
    if (word && (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word))) return -1;
    if (/^\s+\p{Ll}/u.test(text.slice(j, j + 3))) return -1; // "about 3 p.m. today" style: a lowercase continuation.
  }
  return j;
}

function clauseEnd(text: string, i: number): number {
  return ",;:—–".includes(text[i]!) && /\s/.test(text[i + 1] ?? "") ? i + 1 : -1;
}

/**
 * Cuts the source text after `from` into speech chunks: whole sentences, the opening ones optionally cut short at
 * clauses, long ones split near MAX_CHUNK. Code blocks are skipped; an unfinished one holds everything after it back
 * until it closes. Returns the chunks and how far the source has been consumed.
 */
export function chunkSpeech(text: string, from: number, options: ChunkOptions): { chunks: SpeechChunk[]; consumed: number } {
  const chunks: SpeechChunk[] = [];
  let start = from;
  let clauses = options.clauses ?? 0;
  let lastClause = -1;
  let lastSpace = -1;

  const emit = (end: number) => {
    const speech = speakable(text.slice(start, end));
    if (hasWords(speech)) {
      chunks.push({ start, end, speech });
      clauses -= 1;
    }
    start = end;
    lastClause = lastSpace = -1;
  };

  for (let i = from; i < text.length; i++) {
    if (text.startsWith("```", i) && (i === 0 || text[i - 1] === "\n")) {
      if (i > start) emit(i);
      const close = text.indexOf("```", i + 3);
      if (close < 0) return { chunks, consumed: options.final ? text.length : start };
      const after = text.indexOf("\n", close + 3);
      i = after < 0 ? text.length - 1 : after;
      start = i + 1;
      continue;
    }

    const end = sentenceEnd(text, i, options.final);
    if (end > 0) {
      emit(end);
      i = end - 1;
      continue;
    }
    const clause = clauseEnd(text, i);
    if (clause > 0) {
      lastClause = clause;
      if (clauses > 0 && speakable(text.slice(start, clause)).split(" ").length >= FIRST_CLAUSE_WORDS) {
        emit(clause);
        continue;
      }
    }
    if (/\s/.test(text[i]!)) lastSpace = i + 1;

    if (i - start >= MAX_CHUNK) {
      const cut = lastClause > start ? lastClause : lastSpace > start ? lastSpace : i + 1;
      emit(cut);
      i = cut - 1;
    }
  }
  if (options.final && start < text.length) emit(text.length);
  return { chunks, consumed: start };
}

/** All chunks of a finished text. */
export function speechChunks(text: string): SpeechChunk[] {
  return chunkSpeech(text, 0, { final: true }).chunks;
}
