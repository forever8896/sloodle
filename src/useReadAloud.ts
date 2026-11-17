import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { rpc, type PublicSettings } from "./api";
import type { TranscriptItem } from "./useSession";
import { highlightSpoken, speaker, type SpeechProgress, type SpeechState, type Utterance } from "./voice";

interface SessionLike {
  sessionId?: string;
  items: TranscriptItem[];
  streaming: string;
  busy: boolean;
}

const SPEEDS = [0.8, 1, 1.2, 1.4];

/** The `data-speech-key` of a transcript item, and of the reply still streaming in. */
export const speechKey = (index: number) => `item-${index}`;
export const LIVE_KEY = "live";

/**
 * Reads the session aloud as it happens: a reply is spoken from its first clause while it is still streaming, and the
 * finished message is never spoken a second time. Question cards are read when they appear. The transcript element
 * gets the sentence being heard highlighted (elements carry data-speech-key).
 */
export function useReadAloud(session: SessionLike, transcript: RefObject<HTMLElement | null>) {
  const [readAloud, setReadAloudState] = useState(false);
  const [state, setState] = useState<SpeechState>(speaker.getState());
  const [progress, setProgress] = useState<SpeechProgress>();
  const [speed, setSpeedState] = useState(1);

  const seen = useRef<number | undefined>(undefined);
  const live = useRef<Utterance | undefined>(undefined);
  const lastStreamed = useRef("");
  // After the learner cuts Sloo off, the rest of that turn stays quiet.
  const quietTurn = useRef(false);
  const wasBusy = useRef(session.busy);

  useEffect(() => {
    void rpc<PublicSettings>("settings.get").then((settings) => {
      setReadAloudState(settings.voice.speakReplies);
      setSpeedState(settings.voice.speed);
      speaker.setSpeed(settings.voice.speed);
      if (settings.voice.speakReplies) speaker.warm().catch(() => undefined);
    });
    const offState = speaker.onState(setState);
    const offProgress = speaker.onProgress(setProgress);
    return () => {
      offState();
      offProgress();
      speaker.stop();
    };
  }, []);

  const finishLive = (text?: string) => {
    live.current?.finish(text ?? lastStreamed.current);
    live.current = undefined;
    lastStreamed.current = "";
  };

  useEffect(() => {
    if (!session.streaming || !readAloud || quietTurn.current || seen.current === undefined) return;
    live.current ??= speaker.stream({ key: LIVE_KEY });
    live.current.update(session.streaming);
    lastStreamed.current = session.streaming;
  }, [session.streaming, readAloud]);

  useEffect(() => {
    if (session.sessionId === undefined) return;
    const from = seen.current;
    seen.current = session.items.length;
    if (from === undefined) return; // History from before the session opened is not read out.
    session.items.slice(from).forEach((item, offset) => {
      const key = speechKey(from + offset);
      if (item.type === "tutor") {
        if (live.current) {
          live.current.setKey(key);
          finishLive(item.text);
        } else if (readAloud && !quietTurn.current) speaker.say(item.text, { key });
      } else if (item.type === "question") {
        finishLive();
        if (readAloud && !quietTurn.current) speaker.say(item.question.prompt, { key });
      }
    });
  }, [session.items, session.sessionId, readAloud]);

  // Runs after the items effect, so a reply whose message and turn end arrive together is finished with its message.
  // A new turn (send, answer, spoken reply) silences Sloo at once and lets the next reply speak.
  useEffect(() => {
    if (session.busy && !wasBusy.current && seen.current !== undefined) {
      speaker.stop();
      live.current = undefined;
      quietTurn.current = false;
    }
    if (!session.busy && wasBusy.current) finishLive();
    wasBusy.current = session.busy;
  }, [session.busy]);

  useEffect(() => {
    const root = transcript.current;
    if (!progress?.key) return highlightSpoken(null);
    highlightSpoken(root?.querySelector(`[data-speech-key="${progress.key}"]`), progress.text, progress.index === 0);
  }, [progress, session.streaming, session.items, transcript]);

  const setReadAloud = useCallback((on: boolean) => {
    setReadAloudState(on);
    if (on) speaker.warm().catch(() => undefined);
    else {
      speaker.stop();
      live.current = undefined;
    }
    void rpc("settings.set", { voice: { speakReplies: on } });
  }, []);

  /** The learner wants the floor (typing, microphone, stop button): silence now and for the rest of this turn. */
  const interrupt = useCallback(() => {
    if (speaker.getState() === "idle" && !live.current) return;
    speaker.stop();
    live.current = undefined;
    quietTurn.current = true;
  }, []);

  const replay = useCallback((text: string, key: string) => {
    speaker.stop();
    live.current = undefined;
    speaker.say(text, { key });
  }, []);

  const cycleSpeed = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(speaker.getSpeed()) + 1) % SPEEDS.length] ?? 1;
    speaker.setSpeed(next);
    setSpeedState(next);
    void rpc("settings.set", { voice: { speed: next } });
  }, []);

  return {
    readAloud,
    setReadAloud,
    state,
    speaking: state === "speaking" || state === "paused",
    progress,
    speed,
    cycleSpeed,
    interrupt,
    replay,
    pause: () => speaker.pause(),
    resume: () => speaker.resume(),
  };
}
