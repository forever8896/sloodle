// 2. Type a goal: the app's real composer (Home), with the ad's cycling subjects typed in when it scrolls into view.
import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Textarea } from "@ui-sdk/react/textarea";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Word } from "../../../ad/src/kit";
import { SceneTime } from "../../../ad/src/time";
import { SETTLED, squash, useBeatClock } from "../motion";
import { owl, OwlStop, useOwlZone } from "../owl";

const FIRST = { at: 0.9, text: "Tarot", rate: 0.09 };
const SUBJECTS: [number, string][] = [
  [1.9, "Sourdough"],
  [2.45, "Rust"],
  [3.0, "Music theory"],
  [3.55, "Sandbox architecture"],
  [4.1, "Chess openings"],
  [4.65, "Stand-up comedy"],
];
const FINAL = { at: 5.4, text: "Reading sheet music", rate: 0.055 };
const END = FINAL.at + FINAL.text.length * FINAL.rate + 0.4;

function scripted(t: number): string {
  if (t >= SETTLED) return FINAL.text;
  if (t < FIRST.at) return "";
  if (t < SUBJECTS[0]![0]) return FIRST.text.slice(0, Math.floor((t - FIRST.at) / FIRST.rate) + 1);
  if (t < FINAL.at) {
    let text = "";
    for (const [at, subject] of SUBJECTS) if (t >= at) text = subject;
    return text;
  }
  return FINAL.text.slice(0, Math.max(0, Math.floor((t - FINAL.at) / FINAL.rate) + 1));
}

export function Compose() {
  const { zone, stop } = useOwlZone("compose", "listening");
  const t = useBeatClock(zone, END, { amount: 0.45 });
  const [own, setOwn] = useState<string>();
  const [sent, setSent] = useState<string>();
  const field = useRef<HTMLTextAreaElement>(null);
  const text = own ?? scripted(t);

  useEffect(() => {
    if (t >= SETTLED && own === undefined) owl.setMood("compose", "idle");
  }, [t, own]);

  const swap = t < SETTLED && own === undefined ? SUBJECTS.reduce((last, [at]) => (t >= at ? at : last), -10) : -10;
  const bump = squash(t, swap, 0.03, 0.3);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSent(text.trim());
    owl.react("correct");
  };

  return (
    <section ref={zone} data-owl-zone="compose" className="beat compose" aria-labelledby="compose-title">
      <OwlStop id="compose" stopRef={stop} cushion className="stop-compose" />
      <div className="compose-main">
        <SceneTime.Provider value={t}>
          <h2 id="compose-title" className="display">
            <Word at={0.05}>Type</Word> <Word at={0.18}>a</Word> <Word at={0.3} className="accent">goal.</Word>
          </h2>
        </SceneTime.Provider>
        <p className="lede">Tarot, sourdough, Rust, chess openings. If you can name it, Sloo can build a course for it.</p>
        <div className="home site-composer">
          <form onSubmit={submit}>
            <Field name="topic" style={{ transform: `scale(${1 + bump * 0.5}, ${1 - bump * 0.3})` }}>
              <FieldLabel className="visually-hidden">What do you want to learn?</FieldLabel>
              <Textarea
                ref={field}
                value={text}
                onChange={(event) => setOwn(event.currentTarget.value)}
                onFocus={() => {
                  if (own === undefined) setOwn(text);
                  owl.setMood("compose", "listening");
                }}
                placeholder="Anything. A language, calculus, how engines work, reading sheet music…"
                rows={3}
              />
            </Field>
            <div className="home-actions">
              <Button type="submit" data-variant="solid" className="big" disabled={!text.trim()}>
                Let's begin
              </Button>
            </div>
          </form>
        </div>
        <p className="compose-note" role="status">
          {sent && (
            <>
              In the app, Sloo would now ask you a few questions about “{sent}”, research it and build your course. <a href="#build">Here is one it built earlier.</a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
