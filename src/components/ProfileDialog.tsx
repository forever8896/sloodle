import { Button } from "@ui-sdk/react/button";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toggle } from "@ui-sdk/react/toggle";
import { useCallback, useEffect, useState } from "react";
import { onProfile, rpc, type DialName, type Entry, type LearnerDoc, type SlooDoc } from "../api";

const dials: { name: DialName; label: string; levels: string[] }[] = [
  { name: "explanationDepth", label: "Explanations", levels: ["brief", "standard", "thorough"] },
  { name: "pacing", label: "Pace", levels: ["slower", "steady", "brisk"] },
  { name: "challenge", label: "Challenge", levels: ["gentle", "balanced", "stretching"] },
  { name: "hintGenerosity", label: "Hints", levels: ["sparing", "standard", "generous"] },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString();

function EntryList({ label, entries, onAdd, onDelete }: { label: string; entries: Entry[]; onAdd?: (text: string) => void; onDelete: (id: string) => void }) {
  const [text, setText] = useState("");
  return (
    <section className="profile-list">
      <h3>{label}</h3>
      {entries.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.text}</span>
            <span className="muted">
              {entry.source}, {day(entry.at)}
            </span>
            <Button data-variant="ghost" aria-label={`Forget: ${entry.text}`} onClick={() => onDelete(entry.id)}>
              Forget
            </Button>
          </li>
        ))}
      </ul>
      {onAdd && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            onAdd(text.trim());
            setText("");
          }}
        >
          <Input aria-label={`Add to ${label}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add…" />
          <Button type="submit" disabled={!text.trim()}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}

function LearnerPanel({ learner, edit, clearActivity }: { learner: LearnerDoc; edit: (change: Record<string, unknown>) => void; clearActivity: () => void }) {
  const o = learner.observed;
  const findings = o?.findings ?? [];
  return (
    <div className="profile-panel">
      <Field name="name">
        <FieldLabel>Your name</FieldLabel>
        <Input defaultValue={learner.stated.name ?? ""} onBlur={(e) => e.target.value !== (learner.stated.name ?? "") && edit({ op: "set", name: e.target.value })} />
      </Field>
      <Field name="about">
        <FieldLabel>About you</FieldLabel>
        <Input defaultValue={learner.stated.about ?? ""} onBlur={(e) => e.target.value !== (learner.stated.about ?? "") && edit({ op: "set", about: e.target.value })} />
        <FieldDescription>Anything you want Sloo to keep in mind.</FieldDescription>
      </Field>
      {(["preferences", "goals", "interests"] as const).map((list) => (
        <EntryList
          key={list}
          label={list === "preferences" ? "How you like to learn" : list === "goals" ? "Goals" : "Interests"}
          entries={learner.stated[list]}
          onAdd={(text) => edit({ op: "add", list, text })}
          onDelete={(id) => edit({ op: "delete", list, id })}
        />
      ))}
      <EntryList label="Notes from sessions" entries={learner.notes.map((n) => ({ ...n, text: `${n.category}: ${n.text}` }))} onDelete={(id) => edit({ op: "delete", list: "notes", id })} />

      <section className="profile-list">
        <h3>What your activity shows</h3>
        {!o || o.answers.all.n === 0 ? (
          <p className="muted">Nothing measured yet. This fills in as you answer questions and review.</p>
        ) : (
          <>
            <p>
              {o.answers.all.n} answers, {pct(o.answers.all.accuracy)} right, {pct(o.answers.all.hintRate)} after a hint. {o.sessions.n} sessions
              {o.sessions.medianMinutes !== null ? `, usually ${o.sessions.medianMinutes} minutes` : ""}. Confidence: {o.calibration.verdict}.
            </p>
            <ul>
              {findings.map((f) => {
                const dismissed = learner.dismissed.includes(f.key);
                return (
                  <li key={f.key} data-dismissed={dismissed || undefined}>
                    <span>{f.text}</span>
                    <span className="muted">from {f.evidence.length} recent events</span>
                    <Button data-variant="ghost" onClick={() => edit({ op: dismissed ? "restore" : "dismiss", key: f.key })}>{dismissed ? "Restore" : "Not right"}</Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Button onClick={clearActivity}>Delete activity history</Button>
      </section>
    </div>
  );
}

function SlooPanel({ sloo, edit }: { sloo: SlooDoc; edit: (change: Record<string, unknown>) => void }) {
  return (
    <div className="profile-panel">
      <Field name="slooName">
        <FieldLabel>Name</FieldLabel>
        <Input defaultValue={sloo.persona.name} onBlur={(e) => e.target.value.trim() && e.target.value !== sloo.persona.name && edit({ op: "persona", name: e.target.value })} />
      </Field>
      <Field name="tone">
        <FieldLabel>Tone</FieldLabel>
        <Input defaultValue={sloo.persona.tone} onBlur={(e) => e.target.value !== sloo.persona.tone && edit({ op: "persona", tone: e.target.value })} />
      </Field>

      <section className="profile-list">
        <h3>How Sloo teaches you</h3>
        <p className="muted">These adjust from your results. Pick one yourself to lock it.</p>
        {dials.map(({ name, label, levels }) => {
          const dial = sloo.approach[name];
          return (
            <Field key={name}>
              <FieldLabel>{label}</FieldLabel>
              <div className="profile-dial">
                <SegmentedControl value={dial.value} onValueChange={(value) => value && value !== dial.value && edit({ op: "dial", dial: name, value })}>
                  <SegmentedControlIndicator />
                  {levels.map((level) => (
                    <SegmentedControlItem key={level} value={level}>
                      {level}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
                <Toggle pressed={dial.locked} onPressedChange={(locked: boolean) => edit({ op: "dial", dial: name, locked })}>
                  Locked
                </Toggle>
              </div>
              {dial.reason && <FieldDescription>{dial.reason}</FieldDescription>}
            </Field>
          );
        })}
      </section>

      <EntryList label="Things you told Sloo" entries={sloo.memory.toldMe} onAdd={(text) => edit({ op: "add", list: "toldMe", text })} onDelete={(id) => edit({ op: "delete", list: "toldMe", id })} />
      <EntryList label="What you're working toward" entries={sloo.memory.workingToward} onAdd={(text) => edit({ op: "add", list: "workingToward", text })} onDelete={(id) => edit({ op: "delete", list: "workingToward", id })} />
      <EntryList label="Moments Sloo remembers" entries={sloo.memory.episodes} onDelete={(id) => edit({ op: "delete", list: "episodes", id })} />
      <EntryList
        label="What has worked and what hasn't"
        entries={sloo.approach.tactics.map((t) => ({ id: t.id, at: t.updatedAt, source: t.source === "stats" ? "tutor" : t.source, text: `${t.text}: worked ${t.worked}, didn't ${t.failed}` }))}
        onDelete={(id) => edit({ op: "delete", list: "tactics", id })}
      />

      <section className="profile-list">
        <h3>Recent changes</h3>
        <ul>
          {sloo.log
            .slice(-8)
            .reverse()
            .map((change) => (
              <li key={`${change.at}-${change.change}`}>
                <span>{change.change}</span>
                <span className="muted">
                  {change.source}, {day(change.at)}: {change.reason}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function ProfileDialog() {
  const [open, setOpen] = useState(false);
  const [learner, setLearner] = useState<LearnerDoc>();
  const [sloo, setSloo] = useState<SlooDoc>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    rpc<LearnerDoc>("learner.get").then(setLearner, (e: Error) => setError(e.message));
    rpc<SlooDoc>("sloo.get").then(setSloo, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    return onProfile(load);
  }, [open, load]);

  const fail = (e: Error) => setError(e.message);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rail-button">
        <span className="rail-title">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8.5" r="4" />
            <path d="M4.5 20.5c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6" />
          </svg>
          You and Sloo
        </span>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="settings profile">
        <div data-slot="stack">
          <DialogTitle>You and Sloo</DialogTitle>
          <DialogDescription>Everything Sloo remembers about you, and how it teaches you. Correct or remove anything.</DialogDescription>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Tabs defaultValue="you">
          <TabsList aria-label="Profile">
            <TabsTab value="you">You</TabsTab>
            <TabsTab value="sloo">Sloo</TabsTab>
          </TabsList>
          <TabsPanel value="you">
            {learner && (
              <LearnerPanel
                learner={learner}
                edit={(change) => void rpc<LearnerDoc>("learner.update", change).then(setLearner, fail)}
                clearActivity={() => void rpc<LearnerDoc>("learner.clearActivity").then(setLearner, fail)}
              />
            )}
          </TabsPanel>
          <TabsPanel value="sloo">{sloo && <SlooPanel sloo={sloo} edit={(change) => void rpc<SlooDoc>("sloo.update", change).then(setSloo, fail)} />}</TabsPanel>
        </Tabs>
        <div data-slot="row">
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ProfileDialog };
