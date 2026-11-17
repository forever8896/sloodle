import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { useEffect, useRef, useState } from "react";
import { Sloo, type LevelSource, type SlooReaction } from "./Sloo";
import { MANIFEST_URL, parseManifest, provideManifest, REACTIONS, STATES, type SlooState } from "./sloo/manifest";
import { forceVideoMode, type VideoMode } from "./sloo/player";
import "./SoundAudition.css";

// The synthetic stand-in clips (scripts/sloo-test-clips.sh): a labelled blob, so the video path can be judged before art exists.
const testFiles = import.meta.glob("./sloo/test-media/*", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const testUrls = Object.fromEntries(Object.entries(testFiles).map(([path, url]) => [path.split("/").pop()!, url]));
const TEST_MEDIA = "audition:test-clips";
provideManifest(
  TEST_MEDIA,
  parseManifest(
    {
      version: 1,
      poster: "idle-a.png",
      states: {
        idle: { clips: ["idle-a", "idle-b"], rest: { after: 12, every: [3, 6] } },
        thinking: { clips: ["thinking"] },
        talking: { clips: ["talking"] },
        correct: { clips: ["correct"] },
        encourage: { clips: ["encourage"] },
      },
    },
    location.href,
    (file) => testUrls[file] ?? file,
  ),
);

type Source = "app" | "test" | "drawn";

// ?sloo=app|test|drawn picks the media, &path=native|packed the video path, and &single shows one stage as in the app,
// to judge timing and cost without seven players competing.
const params = new URLSearchParams(location.search);
const single = params.has("single");

const sources: { value: Source; label: string; media: string | false }[] = [
  { value: "app", label: "App manifest", media: MANIFEST_URL },
  { value: "test", label: "Test clips", media: TEST_MEDIA },
  { value: "drawn", label: "Drawn", media: false },
];

const stateLabels: Record<SlooState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  writing: "Writing",
  talking: "Talking",
  happy: "Happy",
  cheer: "Cheer",
  wave: "Wave",
};

const reactionLabels: Record<SlooReaction, string> = { correct: "Correct answer", encourage: "Wrong answer: encourage" };

/** Speech-like loudness without the engine: syllables of varying strength, with short pauses between words. */
const simulatedVoice: LevelSource = (listener) => {
  let frame = 0;
  const start = performance.now();
  const loop = (now: number) => {
    const t = (now - start) / 1000;
    const syllable = Math.max(0, Math.sin(t * Math.PI * 2 * 4.3));
    const word = Math.sin(t * Math.PI * 2 * 0.9) > -0.6 ? 1 : 0;
    const stress = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.7));
    listener(syllable ** 0.7 * word * stress);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(frame);
    listener(0);
  };
};

const surfaces = [
  { name: "Page", className: "sloo-audition-bg" },
  { name: "Panel", className: "sloo-audition-surface" },
  { name: "Sun disc", className: "sloo-audition-sun" },
  { name: "Checkerboard", className: "sloo-audition-check" },
];

function SlooAudition() {
  const [source, setSource] = useState<Source>(() => sources.find((entry) => entry.value === params.get("sloo"))?.value ?? "app");
  const [mode, setMode] = useState<VideoMode | "auto">(() => (params.get("path") === "native" || params.get("path") === "packed" ? (params.get("path") as VideoMode) : "auto"));
  const [mood, setMood] = useState<SlooState>("idle");
  const [reaction, setReaction] = useState<{ kind: SlooReaction; id: number }>();
  const [voice, setVoice] = useState(true);
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [status, setStatus] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const media = sources.find((entry) => entry.value === source)!.media;

  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  forceVideoMode(mode === "auto" ? undefined : mode);

  // What the first stage is actually showing, read back from the DOM so the page reports the real path taken.
  useEffect(() => {
    const read = () => {
      const element = stage.current?.querySelector<HTMLElement>(".sloo");
      if (!element) return;
      const canvas = element.querySelector(".sloo-canvas");
      const videos = element.querySelectorAll<HTMLVideoElement>(".sloo-clip");
      const playing = [...videos].find((video) => (canvas ? !video.paused : video.style.opacity === "1")) ?? videos[0];
      const path = element.dataset.kind === "video" ? (canvas ? "packed H.264 + WebGL" : "native VP9 alpha") : element.dataset.kind;
      const clip = playing?.currentSrc ? decodeURIComponent(playing.currentSrc.split("/").pop() ?? "").replace(/\?.*/, "") : "";
      setStatus(`${path}${clip ? ` · ${clip}` : ""}${element.dataset.ready ? "" : element.dataset.kind === "video" ? " · loading" : ""}`);
    };
    const timer = setInterval(read, 250);
    return () => clearInterval(timer);
  }, []);

  const props = { mood, reaction, media, level: voice ? simulatedVoice : undefined };
  // A new key remounts every stage, so a change of source or video path starts from scratch.
  const key = `${source}-${mode}`;

  return (
    <main className="audition sloo-audition">
      <header>
        <h1>Sloo</h1>
        <p>
          Every state and reaction on the surfaces Sloo sits on. Clips go in <code>public/sloo/</code> and are listed in{" "}
          <code>public/sloo/manifest.json</code>; see <code>docs/sloo-character.md</code>.
        </p>
        <Field>
          <FieldLabel>Media</FieldLabel>
          <SegmentedControl value={source} onValueChange={(value) => setSource(value as Source)}>
            <SegmentedControlIndicator />
            {sources.map(({ value, label }) => (
              <SegmentedControlItem key={value} value={value}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </Field>
        <Field>
          <FieldLabel>Video path</FieldLabel>
          <SegmentedControl value={mode} onValueChange={(value) => setMode(value as VideoMode | "auto")}>
            <SegmentedControlIndicator />
            <SegmentedControlItem value="auto">Automatic</SegmentedControlItem>
            <SegmentedControlItem value="native">Native alpha (WebM)</SegmentedControlItem>
            <SegmentedControlItem value="packed">Packed alpha (MP4 + canvas)</SegmentedControlItem>
          </SegmentedControl>
        </Field>
        <div data-slot="row">
          <label data-slot="label">
            <Switch checked={voice} onCheckedChange={setVoice}>
              <SwitchThumb />
            </Switch>
            Simulated voice while talking
          </label>
          <label data-slot="label">
            <Switch checked={dark} onCheckedChange={setDark}>
              <SwitchThumb />
            </Switch>
            Dark theme
          </label>
        </div>
        <p className="sloo-audition-status" role="status">
          Showing: {status}
        </p>
      </header>

      <section>
        <h2>State</h2>
        <SegmentedControl aria-label="State" className="sloo-audition-states" value={mood} onValueChange={(value) => setMood(value as SlooState)}>
          <SegmentedControlIndicator />
          {STATES.map((state) => (
            <SegmentedControlItem key={state} value={state}>
              {stateLabels[state]}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <div data-slot="row">
          {REACTIONS.map((kind) => (
            <Button key={kind} data-variant="solid" onClick={() => setReaction({ kind, id: Date.now() })}>
              {reactionLabels[kind]}
            </Button>
          ))}
          <Button render={<a href="./?sounds" />}>Sounds</Button>
          <Button render={<a href="./" />}>Back to the app</Button>
        </div>
        <p>Listening follows this field with the eyes (drawn Sloo); elsewhere the eyes follow the pointer.</p>
        <textarea className="sloo-audition-field" aria-label="Type here to watch Sloo read along" rows={2} onFocus={() => setMood("listening")} />
      </section>

      <section ref={stage} key={key} className="sloo-audition-stages">
        {surfaces.slice(0, single ? 1 : undefined).map(({ name, className }) => (
          <figure key={name} className={className}>
            <Sloo {...props} size={220} />
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </section>

      <section key={`${key}-sizes`} hidden={single}>
        <h2>Sizes used in the app</h2>
        <div className="sloo-audition-sizes">
          {(single ? [] : [34, 56, 84, 132]).map((size) => (
            <figure key={size}>
              <Sloo {...props} size={size} />
              <figcaption>{size}px</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

export { SlooAudition };
