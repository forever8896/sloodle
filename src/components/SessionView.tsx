import { Button } from "@ui-sdk/react/button";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Textarea } from "@ui-sdk/react/textarea";
import { Toggle } from "@ui-sdk/react/toggle";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar";
import { type ChatOffer } from "../api";
import { useSession, type TranscriptItem, type ViewKind } from "../useSession";
import { ChatOfferButton, ProposalCard } from "./ProposalCard";
import { Markdown } from "./Markdown";
import { QuestionCard } from "./QuestionCard";
import { Block, soundItems } from "./blocks/Block";
import { isOpen } from "./blocks/state";
import { Sloo, type LevelSource, type Mood, type SlooReaction } from "./Sloo";
import { speaker, startRecording, type Recording } from "../voice";
import { LIVE_KEY, speechKey, useReadAloud } from "../useReadAloud";
import { sfx, useSessionSounds } from "../sound";

const voiceLevel: LevelSource = (listener) => speaker.onLevel(listener);

interface Props {
  /** Unused by the global chat. */
  courseId: string;
  kind: ViewKind;
  /** Shown once the session has ended. */
  footer?: (closing: { summary?: string; nextStep?: string }) => ReactNode;
  /** The global chat: what a button Sloo offered does. */
  onOffer?: (offer: ChatOffer) => void;
  /** Shown above the transcript while it is empty. */
  empty?: ReactNode;
}

function SessionView({ courseId, kind, footer, onOffer, empty }: Props) {
  const session = useSession(courseId, kind);
  // Gradable components sound like questions (shown, hint, verdict); the rest like content.
  const soundView = useMemo(() => soundItems(session.items), [session.items]);
  useSessionSounds({ ...session, items: soundView }, kind);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);

  const openQuestion = session.items.some((item) => (item.type === "question" && !item.result) || (item.type === "component" && isOpen(item.component, item.progress)));
  const graded = session.items.flatMap((item) => (item.type === "question" && item.result ? [item.result] : []));
  const lastVerdict = graded.at(-1)?.verdict;
  const [reaction, setReaction] = useState<{ kind: SlooReaction; id: number | string }>();
  const seenGrades = useRef<number | undefined>(undefined);

  // Sloo reacts once when an answer has just been graded, but not to old history.
  useEffect(() => {
    if (session.sessionId === undefined) return;
    const before = seenGrades.current;
    seenGrades.current = graded.length;
    if (before === undefined || graded.length <= before) return;
    setReaction({ kind: lastVerdict === "correct" ? "correct" : "encourage", id: graded.length });
  }, [graded.length, lastVerdict, session.sessionId]);

  // Voice: Sloo reads replies aloud as they stream in, and the learner can answer by speaking.
  const speech = useReadAloud(session, transcript);
  const { readAloud, speaking } = speech;
  const [recording, setRecording] = useState<Recording>();
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();

  function toggleReadAloud(on: boolean) {
    speech.setReadAloud(on);
  }

  async function toggleMic(on: boolean) {
    setVoiceError(undefined);
    try {
      if (on) {
        speech.interrupt();
        setRecording(await startRecording());
        return;
      }
      if (!recording) return;
      setRecording(undefined);
      setListening(true);
      const heard = (await recording.stop()).trim();
      if (!heard) setVoiceError("I didn't catch that. Try again a little closer to the microphone.");
      else if (session.busy) setDraft((current) => `${current} ${heard}`.trim());
      else session.send(heard);
    } catch (error) {
      setRecording(undefined);
      setVoiceError(error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone access was blocked." : (error as Error).message);
    } finally {
      setListening(false);
    }
  }

  // Between spoken lines the voice passes through "preparing". Hold talking through those gaps, and briefly after the
  // last line, so Sloo does not flip to writing or idle and back for every sentence.
  const [holdTalking, setHoldTalking] = useState(false);
  useEffect(() => {
    if (speaking) {
      setHoldTalking(true);
      return;
    }
    const timer = setTimeout(() => setHoldTalking(false), speech.state === "preparing" ? 4000 : 700);
    return () => clearTimeout(timer);
  }, [speaking, speech.state]);

  const mood: Mood = (speaking || holdTalking) && !recording
    ? "talking"
    : recording || (draft.trim() && !session.busy)
      ? "listening"
      : session.streaming || (kind === "planning" && session.busy)
        ? "writing"
        : session.busy || listening
          ? "thinking"
          : session.ended
            ? "happy"
            : "idle";
  const status = session.failure
    ? "Something went wrong."
    : session.ended
      ? "That's a wrap for now."
      : kind === "planning"
        ? "I'm reading up and building your course…"
        : undefined;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [session.items.length, session.streaming, session.busy]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || session.busy || session.ended) return;
    session.send(text);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function render(item: TranscriptItem, index: number) {
    switch (item.type) {
      case "tutor":
        return (
          <div key={index} className="tutor-turn" data-speech-key={speechKey(index)} data-speaking={speech.progress?.key === speechKey(index) || undefined}>
            <Markdown text={item.text} className="tutor" />
            <Button className="replay" data-variant="ghost" aria-label="Read this aloud" onClick={() => speech.replay(item.text, speechKey(index))}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            </Button>
          </div>
        );
      case "user":
        return (
          <p key={index} className="learner">
            {item.text}
          </p>
        );
      case "content":
        return (
          <article key={item.id} className="content-card">
            <h3>{item.title}</h3>
            <Markdown text={item.markdown} />
          </article>
        );
      case "activity":
        return (
          <p key={index} className="activity">
            <span>{item.label}</span> {item.detail}
          </p>
        );
      case "error":
        return (
          <p key={index} className="error" role="alert">
            {item.message}
          </p>
        );
      case "project":
        return (
          <article key={item.project.id} className="content-card">
            <p className="eyebrow">Project</p>
            <h3>{item.project.title}</h3>
            <Markdown text={item.project.brief} />
            <ul>
              {item.project.deliverables.map((deliverable) => (
                <li key={deliverable}>{deliverable}</li>
              ))}
            </ul>
          </article>
        );
      case "component":
        return <Block key={item.component.id} component={item.component} progress={item.progress} disabled={session.ended} act={(action) => session.act(item.component.id, action)} />;
      case "proposal":
        return (
          <ProposalCard
            key={item.proposal.id}
            proposal={item.proposal}
            note={item.note}
            onDecide={(accept) => {
              if (accept) setReaction({ kind: "correct", id: item.proposal.id });
              session.decide(item.proposal.id, accept);
            }}
          />
        );
      case "offer":
        return <ChatOfferButton key={item.offer.id} offer={item.offer} onOffer={onOffer} />;
      case "question":
        return (
          <QuestionCard
            key={item.question.id}
            question={item.question}
            hints={item.hints}
            result={item.result}
            disabled={session.ended}
            onAnswer={(value, confidence) => session.answer(item.question.id, value, confidence)}
            onHint={() => session.hint(item.question.id)}
          />
        );
    }
  }

  return (
    <div className="session">
      {kind !== "planning" && (
        <label data-slot="label" className="read-aloud">
          <Switch checked={readAloud} onCheckedChange={toggleReadAloud}>
            <SwitchThumb />
          </Switch>
          Sloo reads aloud
        </label>
      )}
      {speech.state !== "idle" && (
        <Toolbar aria-label="Speech" className="speech-controls">
          {speech.state === "paused" ? (
            <ToolbarButton aria-label="Resume speaking" onClick={speech.resume}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <path d="M7 4.5v15l13-7.5z" />
              </svg>
            </ToolbarButton>
          ) : (
            <ToolbarButton aria-label="Pause speaking" onClick={speech.pause}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <rect x="6" y="4.5" width="4" height="15" rx="1" />
                <rect x="14" y="4.5" width="4" height="15" rx="1" />
              </svg>
            </ToolbarButton>
          )}
          <ToolbarButton aria-label="Stop speaking" onClick={speech.interrupt}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
              <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
            </svg>
          </ToolbarButton>
          <ToolbarButton aria-label={`Speaking speed ${speech.speed}×, change`} onClick={speech.cycleSpeed}>
            {speech.speed}×
          </ToolbarButton>
        </Toolbar>
      )}
      <div className="transcript" aria-live="polite" ref={transcript}>
        <div className="column">
          {session.failure && (
            <p className="error" role="alert">
              {session.failure}
            </p>
          )}
          {session.items.length === 0 && !session.busy && empty}
          {session.items.map(render)}
          {session.streaming && (
            <div className="tutor-turn" data-speech-key={LIVE_KEY}>
              <Markdown text={session.streaming} className="tutor" />
            </div>
          )}
          {session.busy && !session.streaming && !session.failure && kind !== "planning" && (
            <p className="thinking" role="status">
              Sloo is thinking<span aria-hidden="true">…</span>
            </p>
          )}
          {voiceError && (
            <p className="error" role="alert">
              {voiceError}
            </p>
          )}
          {session.ended && footer?.(session.closing ?? {})}
          <div ref={end} />
        </div>
      </div>

      <form className="dock" onSubmit={submit}>
        <div className="column">
          <div className="dock-sloo">
            <Sloo mood={mood} size={84} level={voiceLevel} reaction={reaction} />
          </div>
          {status ? (
            <p className="dock-status" role="status">
              {status}
            </p>
          ) : (
            <>
              <Toggle
                className="mic"
                aria-label="Speak your reply"
                pressed={recording !== undefined}
                onPressedChange={(on) => { sfx.play(on ? "micOn" : "micOff"); void toggleMic(on); }}
                disabled={listening}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
                  <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
                </svg>
              </Toggle>
              <Textarea
                aria-label="Your reply to Sloo"
                placeholder={recording ? "Listening… press the microphone again when you're done" : listening ? "Writing down what you said…" : openQuestion ? "Answer the question above, or ask Sloo about it" : kind === "chat" && session.items.length === 0 ? "Tell Sloo what's on your mind" : "Reply to Sloo"}
                value={draft}
                onChange={(e) => {
                  if (e.target.value.trim()) speech.interrupt();
                  setDraft(e.target.value);
                }}
                onKeyDown={onKeyDown}
                rows={2}
              />
              <Button type="submit" data-variant="solid" className="send" disabled={!draft.trim() || session.busy}>
                Send
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export { SessionView };
