import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@ui-sdk/react/alert-dialog";
import { useState } from "react";
import { rpc, type ChatOffer } from "../api";
import { SessionView } from "./SessionView";
import "../styles/chat.css";

/** The global chat with Sloo: one ongoing conversation outside any course, saved by the engine. */
function ChatView({ onOffer }: { onOffer: (offer: ChatOffer) => void }) {
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string>();

  function fresh() {
    setError(undefined);
    rpc("chat.reset").then(
      () => setGeneration((n) => n + 1),
      (e: Error) => setError(e.message),
    );
  }

  return (
    <section className="pane chat">
      <header className="pane-header pane-header-row chat-header">
        <div>
          <h1>Chat with Sloo</h1>
          <p>Talk about your studies, tell me what you think of your courses, and we can reshape them together.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger className="chat-new">New conversation</AlertDialogTrigger>
          <AlertDialogBackdrop />
          <AlertDialogContent>
            <div data-slot="stack">
              <AlertDialogTitle>Start a new conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This conversation is put away and we start fresh. Everything I noted about you and every change you accepted stays. Proposals you haven't answered are dropped.
              </AlertDialogDescription>
            </div>
            <div data-slot="row">
              <AlertDialogClose>Keep talking</AlertDialogClose>
              <AlertDialogClose data-variant="solid" value="confirm" onClick={fresh}>
                Start fresh
              </AlertDialogClose>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </header>
      {error && (
        <p className="error chat-error" role="alert">
          {error}
        </p>
      )}
      <SessionView
        key={generation}
        courseId=""
        kind="chat"
        onOffer={onOffer}
        empty={
          <div className="chat-empty">
            <p className="bubble">
              This is our space outside the lessons. Tell me how your studies are going, what you'd change in a course, or ask what to do next. I'll remember what matters, and any change to a course waits for your OK.
            </p>
          </div>
        }
      />
    </section>
  );
}

export { ChatView };
