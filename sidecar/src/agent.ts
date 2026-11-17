import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { graderPrompt } from "./prompts";
import type { AuthStatus, Settings } from "./types";

/** An app launched from the desktop often has a shorter PATH than a terminal, so check the usual install spots too. */
export function claudePath(): string | undefined {
  if (process.env.SLOODLE_CLAUDE_PATH) return process.env.SLOODLE_CLAUDE_PATH;
  const onPath = Bun.which("claude");
  if (onPath) return onPath;
  const home = homedir();
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  return [join(home, ".local", "bin", name), join(home, ".claude", "local", name), `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`].find(existsSync);
}

/**
 * Subscription mode runs the person's own installed Claude Code, which reads
 * its own login. We never read or store those credentials; we only make sure a
 * stray API key in the environment does not override the login.
 */
function agentEnv(settings: Settings): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_AGENT_SDK_CLIENT_APP: "sloodle/0.1.0",
    MCP_TOOL_TIMEOUT: "600000",
  };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  if (settings.authMode === "apiKey") {
    if (!settings.apiKey) throw new Error("No API key is saved. Add one in Settings, or switch to your Claude Code login.");
    env.ANTHROPIC_API_KEY = settings.apiKey;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  return env;
}

export function baseOptions(settings: Settings, cwd: string): Options {
  const path = claudePath();
  if (settings.authMode === "subscription" && !path) {
    throw new Error("Claude Code is not installed. Install it and run `claude` once to sign in, or add an API key in Settings.");
  }
  return {
    cwd,
    env: agentEnv(settings),
    settingSources: [],
    permissionMode: "dontAsk",
    ...(path ? { pathToClaudeCodeExecutable: path } : {}),
  };
}

export async function authStatus(settings: Settings): Promise<AuthStatus> {
  const path = claudePath();
  if (settings.authMode === "apiKey") {
    return settings.apiKey
      ? { mode: "apiKey", ok: true, detail: "Using your Anthropic API key.", claudePath: path }
      : { mode: "apiKey", ok: false, detail: "No API key saved yet.", claudePath: path };
  }
  if (!path) {
    return { mode: "subscription", ok: false, detail: "Claude Code was not found on this computer. Install it and sign in, or use an API key." };
  }
  try {
    const proc = Bun.spawn([path, "auth", "status", "--json"], { stdout: "pipe", stderr: "ignore" });
    const status = JSON.parse(await new Response(proc.stdout).text()) as { loggedIn?: boolean; subscriptionType?: string };
    await proc.exited;
    return status.loggedIn
      ? { mode: "subscription", ok: true, detail: `Signed in to Claude Code${status.subscriptionType ? ` (${status.subscriptionType} plan)` : ""}.`, claudePath: path }
      : { mode: "subscription", ok: false, detail: "Claude Code is installed but not signed in. Run `claude` in a terminal and sign in.", claudePath: path };
  } catch {
    return { mode: "subscription", ok: false, detail: "Could not read Claude Code's sign-in status.", claudePath: path };
  }
}

const verdictSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  score: z.number().min(0).max(1),
  note: z.string(),
  misconceptionId: z.string().nullable().optional(),
});

export type Verdict = z.infer<typeof verdictSchema>;

/** One model call with no tools that must return JSON matching `schema`. Used for grading and reflection. */
export async function structuredCall<T extends z.ZodType>(
  settings: Settings,
  cwd: string,
  input: { model: string; system: string; prompt: string; schema: T; label: string },
): Promise<z.infer<T>> {
  const run = query({
    prompt: input.prompt,
    options: {
      ...baseOptions(settings, cwd),
      model: input.model,
      systemPrompt: input.system,
      tools: [],
      persistSession: false,
      outputFormat: { type: "json_schema", schema: z.toJSONSchema(input.schema, { target: "draft-7" }) as Record<string, unknown> },
    },
  });
  for await (const message of run) {
    if (message.type !== "result") continue;
    if (message.subtype === "success" && !message.is_error) return input.schema.parse(message.structured_output);
    throw new Error(`${input.label} failed: ${message.subtype === "success" ? message.result : message.subtype}`);
  }
  throw new Error(`${input.label} ended without a result.`);
}

export async function gradeFreeResponse(
  settings: Settings,
  cwd: string,
  input: { prompt: string; answerKey: string; rubric?: string; answer: string; misconceptions?: { id: string; belief: string }[] },
): Promise<Verdict> {
  const known = input.misconceptions?.length
    ? `\n<known_misconceptions>\n${input.misconceptions.map((m) => `${m.id}: ${m.belief}`).join("\n")}\n</known_misconceptions>`
    : "";
  return structuredCall(settings, cwd, {
    model: settings.models.grader,
    system: graderPrompt(),
    prompt: `<question>\n${input.prompt}\n</question>\n<answer_key>\n${input.answerKey}\n</answer_key>\n<rubric>\n${input.rubric ?? "Full credit needs the core idea of the answer key, stated correctly."}\n</rubric>${known}\n<learner_answer>\n${input.answer}\n</learner_answer>`,
    schema: verdictSchema,
    label: "Grading",
  });
}

export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
