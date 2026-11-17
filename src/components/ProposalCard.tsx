import { Button } from "@ui-sdk/react/button";
import { useState } from "react";
import type { ChatOffer, OutlineModule, ProposalView } from "../api";
import { Growth } from "./Sloo";

const markLabel = { added: "New", removed: "Removed", changed: "Changed" } as const;
const markTone = { added: "good", removed: "bad", changed: "partial" } as const;

const statusText: Record<ProposalView["status"], string> = {
  pending: "",
  accepted: "Accepted. The course is updated.",
  rejected: "Rejected. Nothing was changed.",
  stale: "Not applied: the course changed after this was proposed. Nothing was changed.",
  failed: "Not applied. Nothing was changed.",
  superseded: "Replaced by a newer proposal. Nothing was changed.",
};

function Outline({ modules, label }: { modules: OutlineModule[]; label: string }) {
  return (
    <section className="proposal-side" aria-label={label}>
      <h4 className="eyebrow">{label}</h4>
      {modules.map((module) => {
        const touched = module.mark || module.lessons.some((lesson) => lesson.mark);
        return (
          <div key={module.id} className="proposal-module" data-mark={module.mark}>
            <p className="proposal-module-title">
              {module.title}
              {module.mark && (
                <span className="chip" data-tone={markTone[module.mark]}>
                  {markLabel[module.mark]}
                </span>
              )}
              {!touched && <span className="proposal-unchanged">{module.lessons.length} lessons, unchanged</span>}
            </p>
            {touched && (
              <ol>
                {module.lessons.map((lesson) => (
                  <li key={lesson.id} data-mark={lesson.mark}>
                    <Growth status={lesson.status} size={16} />
                    <span className="proposal-lesson">{lesson.statement}</span>
                    {lesson.mark && (
                      <span className="chip" data-tone={markTone[lesson.mark]}>
                        {markLabel[lesson.mark]}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** A curriculum change Sloo proposed in the chat: before and after, and nothing is saved until the learner accepts. */
function ProposalCard({ proposal, note, onDecide }: { proposal: ProposalView; note?: string; onDecide: (accept: boolean) => void }) {
  const [deciding, setDeciding] = useState<boolean>();
  const pending = proposal.status === "pending";

  return (
    <article className="content-card proposal" data-status={proposal.status} aria-label={`Proposed change to ${proposal.courseTitle}`}>
      <div>
        <p className="eyebrow">Proposed change to {proposal.courseTitle}</p>
        <p className="proposal-reason">{proposal.reason}</p>
      </div>
      <ul className="proposal-lines">
        {proposal.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {proposal.warnings.map((warning) => (
        <p key={warning} className="notice" data-tone="warn">
          {warning}
        </p>
      ))}
      <div className="proposal-compare">
        <Outline modules={proposal.before} label="Now" />
        <Outline modules={proposal.after} label="After" />
      </div>
      {proposal.plans > 0 && pending && (
        <p className="muted proposal-plans">
          {proposal.plans === 1 ? "One lesson gets a new lesson plan" : `${proposal.plans} lessons get new lesson plans`} once you accept. Your progress on every lesson that stays is kept.
        </p>
      )}
      {pending ? (
        <div className="proposal-actions">
          <Button data-variant="solid" data-loading={deciding === true || undefined} disabled={deciding !== undefined} onClick={() => (setDeciding(true), onDecide(true))}>
            Accept change
          </Button>
          <Button disabled={deciding !== undefined} onClick={() => (setDeciding(false), onDecide(false))}>
            Keep it as it is
          </Button>
        </div>
      ) : (
        <p className="proposal-status" role="status" data-status={proposal.status}>
          {statusText[proposal.status]} {proposal.status === "accepted" && note ? note.replace(/^Saved\.\s*/, "") : proposal.status === "failed" ? note : ""}
        </p>
      )}
    </article>
  );
}

const offerIcon: Record<ChatOffer["kind"], string> = {
  open_course: "M4 5h7v14H4zM13 5h7v14h-7z",
  start_lesson: "M7 4.5v15l13-7.5z",
  review: "M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4",
  new_course: "M12 5v14M5 12h14",
};

/** A button Sloo offered in the chat: open a course, start a lesson, review, or start a new course. */
function ChatOfferButton({ offer, onOffer }: { offer: ChatOffer; onOffer?: (offer: ChatOffer) => void }) {
  return (
    <div className="chat-offer">
      <Button data-variant="solid" onClick={() => onOffer?.(offer)} disabled={!onOffer}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill={offer.kind === "start_lesson" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d={offerIcon[offer.kind]} />
        </svg>
        {offer.label}
      </Button>
      {offer.kind === "new_course" && <p className="muted">“{offer.topic}”</p>}
    </div>
  );
}

export { ChatOfferButton, ProposalCard };
