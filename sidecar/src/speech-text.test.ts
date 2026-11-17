import { describe, expect, test } from "bun:test";
import { chunkSpeech, speakable, speechChunks } from "./speech-text";

const speech = (text: string) => speechChunks(text).map((c) => c.speech);

describe("speechChunks", () => {
  test("splits sentences and keeps abbreviations, decimals and list numbers together", () => {
    expect(speech("Pi is about 3.14. That is, e.g. a ratio! Right?")).toEqual(["Pi is about 3.14.", "That is, e.g. a ratio!", "Right?"]);
    expect(speech("Steps:\n1. Open it.\n2. Close it.")).toEqual(["Steps:", "Open it.", "Close it."]);
  });

  test("offsets point back into the source", () => {
    const text = "Hello **there**. Next one.";
    for (const chunk of speechChunks(text)) expect(speakable(text.slice(chunk.start, chunk.end))).toBe(chunk.speech);
    expect(speech(text)).toEqual(["Hello there.", "Next one."]);
  });

  test("skips code blocks", () => {
    expect(speech("Look:\n```js\nconst a = 1.5;\n```\nThat sets a.")).toEqual(["Look:", "That sets a."]);
  });

  test("cuts long sentences near the limit at a clause", () => {
    const long = `${"word ".repeat(30)}, ${"more ".repeat(30)}, ${"end ".repeat(20)}done.`;
    const chunks = speechChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.end - chunk.start).toBeLessThanOrEqual(232);
    expect(chunks.map((c) => c.speech).join(" ").replace(/\s+/g, " ")).toBe(speakable(long));
  });
});

describe("chunkSpeech while streaming", () => {
  test("holds back an unfinished sentence and a trailing full stop", () => {
    expect(chunkSpeech("First one. Second", 0, { final: false })).toMatchObject({ chunks: [{ speech: "First one." }], consumed: 10 });
    expect(chunkSpeech("It is 3.", 0, { final: false }).chunks).toEqual([]);
    expect(chunkSpeech("It is 3.", 0, { final: true }).chunks.map((c) => c.speech)).toEqual(["It is 3."]);
  });

  test("opening chunks stop at a clause once they have a few words", () => {
    const text = "Right, so the key idea here, which people miss, is scope. Next.";
    const { chunks } = chunkSpeech(text, 0, { final: false, clauses: 1 });
    expect(chunks.map((c) => c.speech)).toEqual(["Right, so the key idea here,", "which people miss, is scope."]);
    // "which people miss," is too short to stand alone.
    expect(chunkSpeech(text, 0, { final: false, clauses: 2 }).chunks.map((c) => c.speech)).toEqual(["Right, so the key idea here,", "which people miss, is scope."]);
  });

  test("feeding deltas gives the same speech as the finished text", () => {
    const text = "Good start! Now, think about what a loop does: it repeats. Try one.\n\nWhat prints first?";
    let consumed = 0;
    const spoken: string[] = [];
    for (let n = 1; n <= text.length; n += 3) {
      const result = chunkSpeech(text.slice(0, n), consumed, { final: false, clauses: 3 - spoken.length });
      spoken.push(...result.chunks.map((c) => c.speech));
      consumed = result.consumed;
    }
    spoken.push(...chunkSpeech(text, consumed, { final: true }).chunks.map((c) => c.speech));
    expect(spoken.join(" ")).toBe(speakable(text));
  });

  test("an unclosed code block holds everything after it", () => {
    expect(chunkSpeech("See:\n```\ncode. more", 0, { final: false })).toMatchObject({ chunks: [{ speech: "See:" }], consumed: 5 });
  });
});
