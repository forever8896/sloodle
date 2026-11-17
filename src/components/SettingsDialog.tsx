import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from "@ui-sdk/react/password-input";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { useEffect, useState } from "react";
import { SoundSettings } from "./SoundSettings";
import { rpc, type AuthMode, type AuthStatus, type PublicSettings } from "../api";

const modelRoles = [
  { key: "tutor", label: "Tutor model", hint: "Runs the interview and lessons." },
  { key: "planner", label: "Planner model", hint: "Researches and designs the course." },
  { key: "grader", label: "Grader model", hint: "Checks written answers against the answer key." },
] as const;

type Theme = "system" | "light" | "dark";

function savedTheme(): Theme {
  try {
    return (localStorage.getItem("sloodle-theme") as Theme | null) ?? "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.style.colorScheme = theme === "system" ? "" : theme;
  try {
    localStorage.setItem("sloodle-theme", theme);
  } catch {
    // The choice still applies for this run.
  }
}

applyTheme(savedTheme());

function SettingsDialog({ onAuthChange, onShowWelcome }: { onAuthChange: (status: AuthStatus) => void; onShowWelcome?: () => void }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PublicSettings>();
  const [status, setStatus] = useState<AuthStatus>();
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useState<Theme>(savedTheme);

  async function refreshStatus() {
    const next = await rpc<AuthStatus>("auth.status");
    setStatus(next);
    onAuthChange(next);
  }

  useEffect(() => {
    if (!open) return;
    void rpc<PublicSettings>("settings.get").then(setSettings);
    void refreshStatus();
  }, [open]);

  async function save(change: Record<string, unknown>) {
    setSettings(await rpc<PublicSettings>("settings.set", change));
    await refreshStatus();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rail-button">
        <span className="rail-title">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
          </svg>
          Settings
        </span>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="settings">
        <div data-slot="stack">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Choose what powers sloodle on this computer.</DialogDescription>
        </div>

        <section className="settings-group" aria-label="Appearance">
        <Field>
          <FieldLabel>Appearance</FieldLabel>
          <SegmentedControl
            value={theme}
            onValueChange={(next) => {
              if (!next) return;
              setTheme(next as Theme);
              applyTheme(next as Theme);
            }}
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="system">Match system</SegmentedControlItem>
            <SegmentedControlItem value="light">Light</SegmentedControlItem>
            <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
          </SegmentedControl>
        </Field>
        </section>

        <section className="settings-group" aria-label="Sound">
          <h3>Sound</h3>
          <SoundSettings />
        </section>

        {settings && (
          <section className="settings-group" aria-label="Claude">
            <Field>
              <FieldLabel>Powered by</FieldLabel>
              <RadioGroup value={settings.authMode} onValueChange={(mode) => mode && void save({ authMode: mode as AuthMode })}>
                <label data-slot="label">
                  <Radio value="subscription">
                    <RadioIndicator />
                  </Radio>
                  Your Claude Code login
                </label>
                <label data-slot="label">
                  <Radio value="apiKey">
                    <RadioIndicator />
                  </Radio>
                  An Anthropic API key
                </label>
              </RadioGroup>
              <FieldDescription>
                {settings.authMode === "subscription"
                  ? "sloodle runs the Claude Code installed on this computer, signed in by you. It never reads or stores your login."
                  : "The key is kept in sloodle's settings file on this computer, readable only by your user account."}
              </FieldDescription>
            </Field>

            {settings.authMode === "apiKey" && (
              <Field name="apiKey">
                <FieldLabel>API key</FieldLabel>
                <PasswordInput value={apiKey} onValueChange={setApiKey} autoComplete="off">
                  <PasswordInputControl
                    onBlur={() => void (apiKey && save({ apiKey }).then(() => setApiKey("")))}
                    placeholder={settings.hasApiKey ? "A key is saved. Type to replace it." : "sk-ant-…"}
                  />
                  <PasswordInputToggle aria-label="Show API key" />
                </PasswordInput>
              </Field>
            )}

            {status && (
              <p className="notice" data-tone={status.ok ? "good" : "warn"} role="status">
                {status.detail}
              </p>
            )}

            {modelRoles.map((role) => (
              <Field key={role.key} name={role.key}>
                <FieldLabel>{role.label}</FieldLabel>
                <Input
                  defaultValue={settings.models[role.key]}
                  onBlur={(e) => e.target.value.trim() && void save({ models: { [role.key]: e.target.value.trim() } })}
                  spellCheck={false}
                />
                <FieldDescription>{role.hint}</FieldDescription>
              </Field>
            ))}
          </section>
        )}

        <div data-slot="row">
          {onShowWelcome && (
            <DialogClose data-variant="ghost" onClick={onShowWelcome}>
              Show the welcome again
            </DialogClose>
          )}
          <DialogClose data-variant="solid">Done</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { SettingsDialog };
