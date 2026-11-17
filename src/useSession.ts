import { useCallback, useEffect, useReducer } from "react";
import { onSession, rpc, type AssignedProject, type ChatInfo, type ChatOffer, type ComponentAction, type GradeResult, type ProposalView, type Question, type SessionEvent, type SessionInfo, type SessionKind, type ShownComponent } from "./api";
import { applyUpdate, freshProgress, type ComponentProgress } from "./components/blocks/state";

type TranscriptItem =
  | { type: "tutor"; text: string }
  | { type: "user"; text: string }
  | { type: "content"; id: string; title: string; markdown: string }
  | { type: "activity"; label: string; detail?: string }
  | { type: "error"; message: string }
  | { type: "question"; question: Question; hints: string[]; result?: GradeResult }
  | { type: "project"; project: AssignedProject }
  | { type: "component"; component: ShownComponent; progress: ComponentProgress }
  | { type: "proposal"; proposal: ProposalView; note?: string }
  | { type: "offer"; offer: ChatOffer };

/** A course session, or the global chat with Sloo (its RPC methods are chat.* instead of session.*). */
type ViewKind = SessionKind | "chat";

interface SessionState {
  sessionId?: string;
  items: TranscriptItem[];
  streaming: string;
  busy: boolean;
  ended: boolean;
  closing?: { summary?: string; nextStep?: string };
  failure?: string;
}

type Action =
  | { type: "opened"; info: Pick<SessionInfo, "sessionId" | "busy" | "ended" | "history"> }
  | { type: "event"; event: SessionEvent }
  | { type: "busy" }
  | { type: "failed"; message: string };

const initial: SessionState = { items: [], streaming: "", busy: true, ended: false };

function apply(state: SessionState, event: SessionEvent): SessionState {
  const add = (item: TranscriptItem): SessionState => ({ ...state, items: [...state.items, item] });
  const patchQuestion = (id: string, change: (item: Extract<TranscriptItem, { type: "question" }>) => TranscriptItem): SessionState => ({
    ...state,
    items: state.items.map((item) => (item.type === "question" && item.question.id === id ? change(item) : item)),
  });

  switch (event.t) {
    case "delta":
      return { ...state, streaming: state.streaming + event.text };
    case "message":
      return { ...add({ type: "tutor", text: event.text }), streaming: "" };
    case "user":
      return add({ type: "user", text: event.text });
    case "content":
      return add({ type: "content", id: event.id, title: event.title, markdown: event.markdown });
    case "activity":
      return add({ type: "activity", label: event.label, detail: event.detail });
    case "question":
      return { ...add({ type: "question", question: event.question, hints: [] }), streaming: "" };
    case "hint":
      return patchQuestion(event.questionId, (item) => ({ ...item, hints: [...item.hints, event.text] }));
    case "graded":
      return patchQuestion(event.result.questionId, (item) => ({ ...item, result: event.result }));
    case "project":
      return add({ type: "project", project: event.project });
    case "component":
      return { ...add({ type: "component", component: event.component, progress: freshProgress() }), streaming: "" };
    case "component_update":
      return {
        ...state,
        items: state.items.map((item) => (item.type === "component" && item.component.id === event.id ? { ...item, progress: applyUpdate(item.progress, event.update) } : item)),
      };
    case "error":
      return add({ type: "error", message: event.message });
    case "turn_end":
      return { ...state, busy: false, streaming: "" };
    case "ended":
      return { ...state, busy: false, ended: true, closing: { summary: event.summary, nextStep: event.nextStep } };
    case "proposal":
      return add({ type: "proposal", proposal: event.proposal });
    case "proposal_update":
      return {
        ...state,
        items: state.items.map((item) => (item.type === "proposal" && item.proposal.id === event.id ? { ...item, proposal: { ...item.proposal, status: event.status }, note: event.note } : item)),
      };
    case "offer":
      return add({ type: "offer", offer: event.offer });
    case "course":
      return state;
  }
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "opened":
      return action.info.history.reduce(apply, { ...initial, sessionId: action.info.sessionId, busy: action.info.busy, ended: action.info.ended });
    case "event":
      return apply(state, action.event);
    case "busy":
      return { ...state, busy: true };
    case "failed":
      return { ...state, busy: false, failure: action.message };
  }
}

function useSession(courseId: string, kind: ViewKind) {
  const [state, dispatch] = useReducer(reducer, initial);
  const chat = kind === "chat";

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (chat ? rpc<ChatInfo>("chat.open") : rpc<SessionInfo>("session.open", { courseId, kind })).then(
      (info) => {
        if (cancelled) return;
        dispatch({ type: "opened", info });
        stop = onSession(info.sessionId, (event) => dispatch({ type: "event", event }));
      },
      (error: Error) => !cancelled && dispatch({ type: "failed", message: error.message }),
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [courseId, kind, chat]);

  const call = useCallback(
    (method: string, params: Record<string, unknown>) => {
      if (!state.sessionId) return;
      const request = chat ? rpc(method.replace(/^session\./, "chat."), params) : rpc(method, { courseId, sessionId: state.sessionId, ...params });
      request.catch((error: Error) => dispatch({ type: "event", event: { t: "error", message: error.message } }));
    },
    [courseId, state.sessionId, chat],
  );

  /** The learner's answer to a proposed course change. The engine writes nothing unless they accept. */
  const decide = useCallback((proposalId: string, accept: boolean) => call(accept ? "session.accept" : "session.reject", { proposalId }), [call]);

  const send = useCallback(
    (text: string) => {
      dispatch({ type: "busy" });
      call("session.send", { text });
    },
    [call],
  );

  const answer = useCallback(
    (questionId: string, value: string | number, confidence?: number) => {
      dispatch({ type: "busy" });
      call("session.answer", { questionId, answer: value, confidence });
    },
    [call],
  );

  const hint = useCallback((questionId: string) => call("session.hint", { questionId }), [call]);

  /** The learner's work on a lesson component. Rejects so the component can show why; work that goes to Sloo makes the session busy. */
  const act = useCallback(
    async (componentId: string, action: ComponentAction): Promise<void> => {
      if (!state.sessionId) throw new Error("The session is not open yet.");
      await rpc("session.component", { courseId, sessionId: state.sessionId, componentId, action });
      const toTutor = action.do === "order" || action.do === "match" || action.do === "fill" || action.do === "rate" || action.do === "report";
      if (toTutor) dispatch({ type: "busy" });
    },
    [courseId, state.sessionId],
  );

  return { ...state, send, answer, hint, act, decide };
}

export { useSession };
export type { TranscriptItem, ViewKind };
