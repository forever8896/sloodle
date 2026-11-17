import { Button } from "@ui-sdk/react/button";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from "@ui-sdk/react/password-input";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Textarea } from "@ui-sdk/react/textarea";
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle";
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { rpc, type AuthMode, type AuthStatus, type LearnerDoc, type Progress, type PublicSettings } from "../api";
import { sfx, useNavigateSound, type SoundSettings } from "../sound";
import { speaker } from "../voice";
import { Sloo, type LevelSource, type Mood } from "./Sloo";

const steps = ["hello", "name", "prefs", "voice", "power", "learn"] as const;
type Step = (typeof steps)[number];

const preferenceChoices = [
  "Short explanations, then practice",
  "Plenty of worked examples",
  "Pictures and diagrams",
  "Real-world uses first",
  "Short sessions, about 10 minutes",
  "Push me a little",
];

const topicIdeas = ["Reading sheet music", "Conversational Spanish", "How engines work", "Statistics for work"];

const voiceLevel: LevelSource = (listener) => speaker.onLevel(listener);

interface Props {
  /** Called when the welcome closes; with the course it started, if the learner named one. */
  onDone: (course?: Progress) => void;
}

/** The first-run welcome: Sloo says hello, learns a little about the person, and starts their first course. */
function Onboarding({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const step: Step = steps[index]!;
  useNavigateSound(step);

  const [learner, setLearner] = useState<LearnerDoc>();
  const [settings, setSettings] = useState<PublicSettings>();
  const [auth, setAuth] = useState<AuthStatus>();
  const [checking, setChecking] = useState(false);

  const [name, setName] = useState("");
  const [typing, setTyping] = useState(false);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [otherPref, setOtherPref] = useState("");
  const [sound, setSound] = useState<SoundSettings>({ volume: sfx.volume, muted: sfx.muted });
  const [speech, setSpeech] = useState<"idle" | "preparing" | "speaking" | "failed">("idle");
  const [apiKey, setApiKey] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    rpc<LearnerDoc>("learner.get").then((doc) => {
      setLearner(doc);
      setName((current) => current || doc.stated.name || "");
    }, () => undefined);
    rpc<PublicSettings>("settings.get").then(setSettings, () => undefined);
    return sfx.subscribe(setSound);
  }, []);

  useEffect(() => speaker.onSpeaking((on) => setSpeech((current) => (on ? "speaking" : current === "speaking" ? "idle" : current))), []);
  useEffect(() => () => speaker.stop(), []);

  async function checkAuth() {
    setChecking(true);
    try {
      setAuth(await rpc<AuthStatus>("auth.status"));
    } catch (e) {
      setAuth({ mode: settings?.authMode ?? "subscription", ok: false, detail: (e as Error).message });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (step === "power" && !auth) void checkAuth();
  }, [step]);

  useEffect(() => {
    if (auth?.ok && step === "power") sfx.play("correct");
  }, [auth?.ok, step]);

  function go(to: number) {
    setError(undefined);
    setDirection(to > index ? "forward" : "back");
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  }

  async function saveStep() {
    if (step === "name") {
      const trimmed = name.trim();
      if (trimmed && trimmed !== (learner?.stated.name ?? "")) setLearner(await rpc<LearnerDoc>("learner.update", { op: "set", name: trimmed }));
    }
    if (step === "prefs") {
      const known = new Set((learner?.stated.preferences ?? []).map((entry) => entry.text.toLowerCase()));
      const wanted = [...prefs, otherPref.trim()].filter((text) => text && !known.has(text.toLowerCase()));
      for (const text of wanted) setLearner(await rpc<LearnerDoc>("learner.update", { op: "add", list: "preferences", text }));
    }
  }

  async function next(event?: FormEvent) {
    event?.preventDefault();
    try {
      await saveStep();
      go(index + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finish(course?: Progress) {
    speaker.stop();
    try {
      await rpc("settings.set", { onboardedAt: new Date().toISOString() });
    } catch {
      // The welcome shows again next time; nothing else is lost.
    }
    onDone(course);
  }

  async function start(event?: FormEvent) {
    event?.preventDefault();
    if (!topic.trim() || creating) return;
    setCreating(true);
    setError(undefined);
    try {
      const course = await rpc<Progress>("course.create", { topic: topic.trim() });
      sfx.play("courseCreated");
      setFinished(true);
      setTimeout(() => void finish(course), 1300);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  async function setReadAloud(on: boolean) {
    setSettings((current) => current && { ...current, voice: { ...current.voice, speakReplies: on } });
    try {
      setSettings(await rpc<PublicSettings>("settings.set", { voice: { speakReplies: on } }));
      if (on) speaker.warm().catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function sayHello() {
    speaker.stop();
    setSpeech("preparing");
    const greeting = name.trim() ? `Hi ${name.trim()}! This is how I sound when I read to you.` : "Hi! This is how I sound when I read to you.";
    speaker.say(greeting);
    window.setTimeout(() => setSpeech((current) => (current === "preparing" ? "failed" : current)), 8000);
  }

  async function setMode(mode: AuthMode) {
    try {
      setSettings(await rpc<PublicSettings>("settings.set", { authMode: mode }));
      await checkAuth();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveKey() {
    if (!apiKey.trim()) return;
    try {
      setSettings(await rpc<PublicSettings>("settings.set", { apiKey: apiKey.trim() }));
      setApiKey("");
      await checkAuth();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const firstName = name.trim().split(/\s+/)[0];
  const mood: Mood = finished
    ? "cheer"
    : step === "hello"
      ? "wave"
      : step === "name" || step === "learn"
        ? creating
          ? "writing"
          : typing
            ? "listening"
            : "idle"
        : step === "prefs"
          ? prefs.length > 0 || otherPref.trim()
            ? "happy"
            : "listening"
          : step === "voice"
            ? speech === "speaking"
              ? "talking"
              : speech === "preparing"
                ? "thinking"
                : "idle"
            : checking
              ? "thinking"
              : auth?.ok
                ? "happy"
                : "idle";

  const line: Record<Step, ReactNode> = {
    hello: "Hi! I'm Sloo. I'll be your tutor.",
    name: firstName && !typing ? `${firstName}. Lovely to meet you!` : "First things first. What should I call you?",
    prefs: firstName ? `Nice to meet you, ${firstName}. How do you like to learn?` : "Nice to meet you. How do you like to learn?",
    voice: speech === "failed" ? "Hmm, my voice isn't ready on this computer yet. You can still read along." : "I can read my replies aloud, and you can answer by speaking.",
    power: auth?.ok ? "My thinking is all set up." : "One practical thing: what powers my thinking.",
    learn: finished ? "Yay! Let's get started." : "Now the fun part. What would you love to learn?",
  };

  function onTopicKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void start();
    }
  }

  const skipStep = (
    <Button data-variant="ghost" onClick={() => go(index + 1)}>
      Skip
    </Button>
  );

  const back =
    index > 0 ? (
      <Button data-variant="ghost" className="welcome-back" onClick={() => go(index - 1)}>
        Back
      </Button>
    ) : null;

  return (
    <div className="welcome" data-step={step}>
      <header className="welcome-top">
        <p className="welcome-brand">sloodle</p>
        <ol className="welcome-progress" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((name, at) => (
            <li key={name} data-state={at < index ? "done" : at === index ? "current" : undefined} />
          ))}
        </ol>
        {!finished && (
          <Button data-variant="ghost" className="welcome-skip" onClick={() => void finish()}>
            Skip intro
          </Button>
        )}
      </header>

      <div className="welcome-body">
        <figure className="welcome-stage">
          <p className="welcome-bubble" key={String(line[step])} aria-live="polite">
            {line[step]}
          </p>
          <div className="stage welcome-sloo">
            <Sloo mood={mood} size={300} level={step === "voice" ? voiceLevel : undefined} />
          </div>
        </figure>

        <div className="welcome-panel" key={step} data-direction={direction}>
          {step === "hello" && (
            <div className="welcome-step">
              <h1>
                Learn anything, <em>at your own pace</em>
              </h1>
              <p className="welcome-lede">
                Tell me what you want to be able to do. I'll ask a few questions, research how it's best learned, build a course around you, and
                teach it one small step at a time.
              </p>
              <div className="welcome-actions">
                <Button data-variant="solid" className="big" onClick={() => go(1)}>
                  Hi Sloo!
                </Button>
              </div>
            </div>
          )}

          {step === "name" && (
            <form className="welcome-step" onSubmit={(e) => void next(e)}>
              <h1>What should I call you?</h1>
              <Field name="name">
                <FieldLabel>Your name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder="First name or a nickname"
                  autoComplete="given-name"
                  autoFocus
                  className="welcome-input"
                />
                <FieldDescription>Only Sloo sees it. You can change it any time under You and Sloo.</FieldDescription>
              </Field>
              <div className="welcome-actions">
                {back}
                {skipStep}
                <Button type="submit" data-variant="solid" className="big" disabled={!name.trim()}>
                  Continue
                </Button>
              </div>
            </form>
          )}

          {step === "prefs" && (
            <form className="welcome-step" onSubmit={(e) => void next(e)}>
              <h1>How do you like to learn?</h1>
              <p className="welcome-lede">Pick any that sound like you. They're a starting point: I'll also notice what actually works for you, and you can change them later.</p>
              <ToggleGroup
                multiple
                aria-label="Learning preferences"
                className="chips"
                value={prefs}
                onValueChange={(value) => {
                  const list = value as string[];
                  if (list.length > prefs.length) sfx.play("select", { index: list.length });
                  setPrefs(list);
                }}
              >
                {preferenceChoices.map((choice) => (
                  <Toggle key={choice} value={choice} className="chip" data-sound="off">
                    {choice}
                  </Toggle>
                ))}
              </ToggleGroup>
              <Field name="otherPreference">
                <FieldLabel>Anything else?</FieldLabel>
                <Input
                  value={otherPref}
                  onChange={(e) => setOtherPref(e.target.value)}
                  placeholder="For example: I learn best when I can teach it back"
                  autoComplete="off"
                />
              </Field>
              <div className="welcome-actions">
                {back}
                {skipStep}
                <Button type="submit" data-variant="solid" className="big">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {step === "voice" && (
            <div className="welcome-step">
              <h1>Voice and sound</h1>
              <div className="welcome-options">
                <div className="option-card">
                  <label data-slot="label">
                    <Switch checked={settings?.voice.speakReplies ?? false} onCheckedChange={(on) => void setReadAloud(on)}>
                      <SwitchThumb />
                    </Switch>
                    Sloo reads replies aloud
                  </label>
                  <p className="muted">You can switch this on or off in any lesson.</p>
                  <Button onClick={sayHello} data-loading={speech === "preparing" || undefined} disabled={speech === "speaking"}>
                    {speech === "speaking" ? "Speaking…" : "Hear my voice"}
                  </Button>
                </div>
                <div className="option-card">
                  <label data-slot="label">
                    <Switch checked={!sound.muted} onCheckedChange={(on) => sfx.setMuted(!on)}>
                      <SwitchThumb />
                    </Switch>
                    Little sounds as you go
                  </label>
                  <p className="muted">Soft chimes for answers, reviews and growing skills.</p>
                  <Button data-sound="off" onClick={() => sfx.play("correct")} disabled={sound.muted}>
                    Play a sample
                  </Button>
                </div>
              </div>
              <p className="welcome-note">
                <strong>Speaking your answers:</strong> press the microphone in a lesson and talk. Your computer will ask once whether sloodle may use the
                microphone, and what you say is turned into text on this computer.
              </p>
              <div className="welcome-actions">
                {back}
                <Button data-variant="solid" className="big" onClick={() => go(index + 1)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === "power" && (
            <div className="welcome-step">
              <h1>What powers Sloo</h1>
              <p className="welcome-lede">sloodle runs on your computer and uses Claude for the thinking: your Claude Code login, or an Anthropic API key.</p>
              {settings && (
                <RadioGroup className="power-choices" aria-label="Powered by" value={settings.authMode} onValueChange={(mode) => mode && void setMode(mode as AuthMode)}>
                  <label data-slot="label" className="option tile">
                    <Radio value="subscription">
                      <RadioIndicator />
                    </Radio>
                    <span>
                      <strong>Claude Code login</strong>
                      <span className="muted">Uses the Claude Code installed here, signed in by you. sloodle never reads your login.</span>
                    </span>
                  </label>
                  <label data-slot="label" className="option tile">
                    <Radio value="apiKey">
                      <RadioIndicator />
                    </Radio>
                    <span>
                      <strong>Anthropic API key</strong>
                      <span className="muted">Kept in sloodle's settings file, readable only by your user account.</span>
                    </span>
                  </label>
                </RadioGroup>
              )}
              {settings?.authMode === "apiKey" && (
                <form
                  className="key-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveKey();
                  }}
                >
                  <Field name="apiKey">
                    <FieldLabel>API key</FieldLabel>
                    <PasswordInput value={apiKey} onValueChange={setApiKey} autoComplete="off">
                      <PasswordInputControl placeholder={settings.hasApiKey ? "A key is saved. Type to replace it." : "sk-ant-…"} />
                      <PasswordInputToggle aria-label="Show API key" />
                    </PasswordInput>
                  </Field>
                  <Button type="submit" disabled={!apiKey.trim()}>
                    Save key
                  </Button>
                </form>
              )}
              <div className="power-status" role="status">
                {checking ? (
                  <p className="notice" data-tone="checking">
                    Checking…
                  </p>
                ) : auth ? (
                  <p className="notice" data-tone={auth.ok ? "good" : "warn"}>
                    {auth.detail}
                  </p>
                ) : null}
                {auth && !auth.ok && !checking && (
                  <Button data-variant="ghost" onClick={() => void checkAuth()}>
                    Check again
                  </Button>
                )}
              </div>
              <div className="welcome-actions">
                {back}
                <Button data-variant="solid" className="big" onClick={() => go(index + 1)}>
                  {auth?.ok ? "Continue" : "Set up later"}
                </Button>
              </div>
            </div>
          )}

          {step === "learn" && (
            <form className="welcome-step" onSubmit={(e) => void start(e)}>
              <Field name="topic">
                <FieldLabel className="welcome-title">What do you want to learn?</FieldLabel>
                <Textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={onTopicKey}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder="Anything. A language, calculus, how engines work…"
                  rows={3}
                  autoFocus
                  disabled={creating}
                  className="welcome-topic"
                />
              </Field>
              <div className="ideas" aria-label="Ideas">
                {topicIdeas.map((idea) => (
                  <Button key={idea} data-variant="ghost" className="idea" disabled={creating} onClick={() => setTopic(idea)}>
                    {idea}
                  </Button>
                ))}
              </div>
              {auth && !auth.ok && <p className="notice" data-tone="warn">Sloo needs Claude to build a course. You can finish setting that up in Settings.</p>}
              <div className="welcome-actions">
                {back}
                <Button data-variant="ghost" onClick={() => void finish()} disabled={creating}>
                  I'll decide later
                </Button>
                <Button type="submit" data-variant="solid" className="big" disabled={!topic.trim() || creating} data-loading={(creating && !finished) || undefined}>
                  {finished ? "Here we go" : "Let's begin"}
                </Button>
              </div>
            </form>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { Onboarding };
