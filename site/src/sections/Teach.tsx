// 4. It teaches you, and remembers how you learn: Sloo asks, you answer in the real fill-in-the-blanks component (graded
// by the engine's own grader), then the "How Sloo teaches you" dials from the profile, then the chat where you tell Sloo
// what you think and it proposes a change to the course (the app's real ProposalCard, on the app's demo data).
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Toggle } from "@ui-sdk/react/toggle";
import { useEffect, useRef, useState } from "react";
import { Word } from "../../../ad/src/kit";
import { SceneTime } from "../../../ad/src/time";
import type { ComponentUpdate, ProposalView, Verdict } from "../../../src/api";
import { Markdown } from "../../../src/components/Markdown";
import { ProposalCard } from "../../../src/components/ProposalCard";
import { after, LiveBlock, Reserve, samples, StaticBlock, useLive, useShown } from "../live";
import { clamp, enterStyle, SETTLED, useBeatClock } from "../motion";
import { owl, OwlStop, useOwlZone } from "../owl";

const ASK = "Quick one. The five line names, **bottom to top**?";
const REPLY: Record<Verdict, string> = {
  correct: "Yes! And without the mnemonic this time.",
  partial: "Nearly. Bottom to top they are **E G B D F**. We'll come back to this one tomorrow.",
  incorrect: "Not yet, and that's fine. Bottom to top: **E G B D F**. We'll come back to it tomorrow.",
};

/** Text that streams in word by word as Sloo says it, laid over its full length so the lines never rewrap. */
function Streamed({ text, t, from, to }: { text: string; t: number; from: number; to: number }) {
  const words = text.split(" ");
  const n = t >= SETTLED ? words.length : Math.ceil(clamp((t - from) / (to - from)) * words.length);
  let shown = words.slice(0, n).join(" ");
  if ((shown.match(/\*\*/g)?.length ?? 0) % 2) shown += "**";
  return (
    <div className="tutor-turn stream">
      <div className="stream-full" aria-hidden="true">
        <Markdown text={text} className="tutor" />
      </div>
      <div className="stream-shown">
        <Markdown text={shown || " "} className="tutor" />
      </div>
      <span className="visually-hidden">{text.replace(/\*\*/g, "")}</span>
    </div>
  );
}

function Lesson() {
  const { zone, stop } = useOwlZone("teach", "talking");
  const t = useBeatClock(zone, 3, { amount: 0.35 });
  const component = useShown(samples.blanks);
  const [verdict, setVerdict] = useState<Verdict>();
  const [replyAt, setReplyAt] = useState<number>();
  const [now, setNow] = useState(0);
  const graded = useState(() => after(component, [{ do: "fill", answers: ["E", "D"] }]))[0];
  const live = useLive(component, (updates: ComponentUpdate[]) => {
    const result = updates.find((u) => u.kind === "graded");
    if (result?.kind !== "graded") return;
    setVerdict(result.result.verdict);
    setReplyAt(performance.now());
    if (result.result.verdict === "correct") owl.react("correct");
    owl.setMood("teach", "talking");
  });

  useEffect(() => {
    if (t > 2.4 && !verdict) owl.setMood("teach", "listening");
  }, [t, verdict]);

  // The reply streams on its own short clock, from the moment the answer is graded.
  useEffect(() => {
    if (replyAt === undefined) return;
    let frame = requestAnimationFrame(function tick() {
      const seconds = (performance.now() - replyAt) / 1000;
      setNow(seconds);
      if (seconds < 2.2) frame = requestAnimationFrame(tick);
      else owl.setMood("teach", "idle");
    });
    return () => cancelAnimationFrame(frame);
  }, [replyAt]);

  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="teach" className="lesson">
      <OwlStop id="teach" stopRef={stop} className="stop-teach" />
      <div className="lesson-main">
        <SceneTime.Provider value={t}>
          <h2 id="teach-title" className="display">
            <Word at={0.05}>It</Word> <Word at={0.17}>teaches</Word> <Word at={0.32} className="accent">you.</Word>
          </h2>
        </SceneTime.Provider>
        <p className="lede">One idea at a time, in conversation. Sloo asks before it tells, reads its words aloud with a voice that runs on your computer, and grades your answers against a key it wrote in advance.</p>
        <div className="exchange">
          <p className="chip" data-tone="lavender" style={enterStyle(t, 0.3, { dy: 12, s0: 0.9 })}>
            Sloo reads aloud
          </p>
          <Streamed text={ASK} t={t} from={0.5} to={1.7} />
          <div className="float-card" style={enterStyle(t, 1.5, { dy: 70, s0: 0.88, duration: 0.6 })}>
            <Reserve ghost={<StaticBlock component={component} progress={graded} />}>
              <LiveBlock component={component} progress={live.progress} act={live.act} />
            </Reserve>
          </div>
          <div className="reply-slot">
            {verdict ? (
              <Streamed text={REPLY[verdict]} t={now} from={0.15} to={1.4} />
            ) : (
              <p className="reply-hint muted">Type E and D, then press Check.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const DIALS = [
  { label: "Explanations", levels: ["brief", "standard", "thorough"], from: "standard", to: "brief", reason: "Succeeds without explanations first (80% over 5)." },
  { label: "Pace", levels: ["slower", "steady", "brisk"], from: "steady", to: "steady", reason: "" },
];

function Memory() {
  const { zone, stop } = useOwlZone("memory", "happy");
  const t = useBeatClock(zone, 2.2, { amount: 0.4 });
  const [values, setValues] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const moved = t >= 0.9;
  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="memory" className="memory">
      <div className="memory-copy">
        <SceneTime.Provider value={t}>
          <h3 className="display">
            <Word at={0.05}>Remembers</Word> <Word at={0.2}>how</Word> <Word at={0.32}>you</Word> <Word at={0.45} className="accent">learn.</Word>
          </h3>
        </SceneTime.Provider>
        <p className="lede">No learning-style quiz. Sloo watches what actually works for you and adjusts its teaching one step at a time, with the evidence written down. You can read, correct, lock or delete all of it.</p>
      </div>
      <div className="card dials" style={enterStyle(t, 0.25, { dy: 80, s0: 0.9, duration: 0.65 })}>
        <section className="profile-list">
          <h4>How Sloo teaches you</h4>
          <p className="muted">These adjust from your results. Pick one yourself to lock it.</p>
          {DIALS.map((dial) => (
            <Field key={dial.label}>
              <FieldLabel>{dial.label}</FieldLabel>
              <div className="profile-dial">
                <SegmentedControl
                  aria-label={dial.label}
                  value={values[dial.label] ?? (moved ? dial.to : dial.from)}
                  onValueChange={(value) => {
                    if (!value) return;
                    setValues((current) => ({ ...current, [dial.label]: value }));
                    setLocked((current) => ({ ...current, [dial.label]: true }));
                  }}
                >
                  <SegmentedControlIndicator />
                  {dial.levels.map((level) => (
                    <SegmentedControlItem key={level} value={level}>
                      {level}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
                <Toggle pressed={!!locked[dial.label]} onPressedChange={(on) => setLocked((current) => ({ ...current, [dial.label]: on }))}>
                  Locked
                </Toggle>
              </div>
              {dial.reason && <FieldDescription style={{ opacity: values[dial.label] ? 1 : clamp((t - 1.1) / 0.25) }}>{dial.reason}</FieldDescription>}
            </Field>
          ))}
        </section>
      </div>
      <OwlStop id="memory" stopRef={stop} className="stop-memory" />
    </div>
  );
}

function useProposal(): ProposalView | undefined {
  const [proposal, setProposal] = useState<ProposalView>();
  useEffect(() => {
    let live = true;
    // The app's own demo chat (src/demo.ts), through the page's engine-free rpc.
    void import("../shim/api").then(({ rpc }) =>
      rpc<{ history: { t: string; proposal?: ProposalView }[] }>("chat.open").then((chat) => {
        const found = chat?.history?.find((event) => event.t === "proposal")?.proposal;
        if (live && found) setProposal(found);
      }),
    );
    return () => {
      live = false;
    };
  }, []);
  return proposal;
}

function Talk() {
  const { zone, stop } = useOwlZone("talk", "listening");
  const t = useBeatClock(zone, 2, { amount: 0.25 });
  const proposal = useProposal();
  const [status, setStatus] = useState<ProposalView["status"]>("pending");
  const decided = useRef(false);
  return (
    <div ref={zone as React.RefObject<HTMLDivElement>} data-owl-zone="talk" className="talk">
      <div className="talk-copy">
        <h3 className="display-sm">
          Or just <span className="accent">tell Sloo.</span>
        </h3>
        <p className="lede">Chat with Sloo outside any course. Say what drags or what you'd rather do, and Sloo proposes a change to your course. Nothing changes until you accept.</p>
      </div>
      <div className="talk-thread">
        <p className="learner" style={enterStyle(t, 0.1, { dx: 40, dy: 0, s0: 0.95 })}>
          Honestly the staff lessons feel a bit slow. I already know how many lines there are, I want to get my hands on the keys.
        </p>
        <div className="talk-sloo" style={enterStyle(t, 0.5, { dx: -40, dy: 0, s0: 0.95 })}>
          <OwlStop id="talk" stopRef={stop} className="stop-talk" />
          <p className="bubble">That makes sense: you named all five lines without the mnemonic yesterday. Here's what dropping the counting lesson would look like.</p>
        </div>
        <div className="talk-card" style={enterStyle(t, 0.9, { dy: 60, s0: 0.92, duration: 0.6 })}>
          {proposal ? (
            <ProposalCard
              proposal={{ ...proposal, status }}
              note="The new lesson plan is written next."
              onDecide={(accept) => {
                if (decided.current) return;
                decided.current = true;
                setTimeout(() => {
                  setStatus(accept ? "accepted" : "rejected");
                  if (accept) owl.react("correct");
                }, 450);
              }}
            />
          ) : (
            <div className="proposal-placeholder" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}

export function Teach() {
  return (
    <section id="teach" className="beat teach" aria-labelledby="teach-title">
      <Lesson />
      <Memory />
      <Talk />
    </section>
  );
}

