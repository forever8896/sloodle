import { Button } from "@ui-sdk/react/button";
import { useEffect, useId, useRef, useState } from "react";
import { sfx } from "../../sound";
import { Markdown } from "../Markdown";
import { BlockHeader, type BlockProps } from "./parts";
import { runJavaScript, type RunLine, type RunOutcome } from "./runner";

const languageName: Record<string, string> = { javascript: "JavaScript", typescript: "TypeScript", python: "Python", html: "HTML", css: "CSS", json: "JSON", bash: "Shell", sql: "SQL", java: "Java", c: "C", cpp: "C++", csharp: "C#", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP", kotlin: "Kotlin", swift: "Swift", plaintext: "Text" };

const outcomeText: Record<RunOutcome["status"], string> = {
  done: "Finished.",
  error: "Stopped with an error.",
  timeout: "Stopped after 3 seconds. Is there a loop that never ends?",
  stopped: "Stopped.",
  unavailable: "Running code isn't available here.",
};

function CodeBlock({ component }: BlockProps<"code">) {
  const [html, setHtml] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [lines, setLines] = useState<RunLine[]>();
  const [outcome, setOutcome] = useState<RunOutcome>();
  const run = useRef<{ stop: () => void }>(undefined);
  const outputId = useId();
  const runnable = component.runnable && component.language === "javascript";

  useEffect(() => {
    let cancelled = false;
    import("./highlight").then(({ highlight }) => !cancelled && setHtml(highlight(component.code, component.language)));
    return () => {
      cancelled = true;
    };
  }, [component.code, component.language]);

  useEffect(() => () => run.current?.stop(), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(component.code);
      setCopied(true);
      sfx.play("select");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function start() {
    run.current?.stop();
    sfx.play("send");
    setLines([]);
    setOutcome(undefined);
    const started = runJavaScript(component.code, (line) => setLines((current) => [...(current ?? []), line]));
    run.current = started;
    const result = await started.done;
    if (run.current !== started) return;
    run.current = undefined;
    setOutcome(result);
    if (result.status === "error" || result.status === "timeout") sfx.play("error");
  }

  const running = lines !== undefined && outcome === undefined;

  return (
    <figure className="content-card block block-code">
      <BlockHeader component={component} />
      <div className="block-code-frame">
        <div className="block-code-bar">
          <span className="chip">{languageName[component.language] ?? component.language}</span>
          <div className="block-code-actions">
            <Button type="button" data-variant="ghost" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy code"}>
              {copied ? "Copied" : "Copy"}
            </Button>
            {runnable &&
              (running ? (
                <Button type="button" onClick={() => run.current?.stop()}>
                  Stop
                </Button>
              ) : (
                <Button type="button" data-variant="solid" onClick={() => void start()} aria-describedby={outputId}>
                  {lines ? "Run again" : "Run"}
                </Button>
              ))}
          </div>
        </div>
        <pre tabIndex={0} aria-label={`${languageName[component.language] ?? "Code"} code`}>
          {html === undefined ? <code>{component.code}</code> : <code className={`hljs language-${component.language}`} dangerouslySetInnerHTML={{ __html: html }} />}
        </pre>
      </div>
      {runnable && (
        <div className="block-code-output" id={outputId} hidden={lines === undefined}>
          <p className="eyebrow">Output</p>
          <pre role="log" aria-live="polite" aria-label="Output">
            {lines?.length ? lines.map((line, index) => <span key={index} data-level={line.level}>{`${line.text}\n`}</span>) : running ? "" : "(no output)"}
          </pre>
          {outcome && (
            <p className="block-code-status" role="status" data-status={outcome.status}>
              {outcomeText[outcome.status]}
              {outcome.truncated && " The output was cut short."}
            </p>
          )}
        </div>
      )}
      {runnable && lines === undefined && <p className="block-note">Runs in a sealed sandbox: no network, no access to the app, stopped after 3 seconds.</p>}
      {component.caption && (
        <figcaption>
          <Markdown text={component.caption} />
        </figcaption>
      )}
    </figure>
  );
}

export { CodeBlock };
