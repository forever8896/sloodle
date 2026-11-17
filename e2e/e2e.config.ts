import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { claudeCode } from '@e2e-dev/acp';

// The interface in a plain browser, in demo mode: sample data, no engine, no model behind the app.
// The runner builds the interface and serves the build on a free port (support/serve.mjs), so it
// never collides with `pnpm dev` on 1420, and no dev-server reload can land in the middle of a step.
const app = {
  url: 'http://127.0.0.1:0',
  command: {
    executable: 'node',
    args: ['support/serve.mjs', '{port}'],
    log: '.e2e/logs/serve.log',
    startupTimeout: 120_000,
  },
};

// What the agent should know about this app. It is part of every recording's key:
// changing it means the next run records every agent step again.
const context = `
sloodle is a desktop app for learning anything; the tutor is a character called Sloo.
These tests run the interface in a browser with demo data.
On a page opened with ?demo, five copies of the app sit one below another, each in a section
named for the screen it starts on: "Home", "Course", "Session with Sloo", "Review" and "Chat with Sloo".
A goal that names a section happens only inside that section; ignore the other copies.
On a page opened with ?blocks, every lesson component is shown in its own section ("Ordering", "Matching",
"Flashcard", "Code", "Picture" and so on). The first card in a section is the answerable one; the cards
after it show fixed states. Use the first card unless the goal says otherwise.
`.trim();

export default {
  projectId: 'sloodle',
  tests: 'tests/**/*.e2e.ts',
  targets: [
    {
      name: 'chromium',
      engine: web({
        reducedMotion: 'reduce',
        initScripts: [{ path: 'support/seeded-random.js' }],
      }),
      app,
    },
  ],
  // Agent steps run on Claude Code over the Agent Client Protocol, with its own login
  // (`claude`) or ANTHROPIC_API_KEY. Recorded steps replay from .e2e/cache without it.
  agents: {
    default: {
      executor: claudeCode({ model: 'sonnet' }),
      context,
      maxModelCalls: 12,
    },
  },
  cache: { mode: process.env.CI ? 'read-only' : 'read-write', dir: '.e2e/cache' },
  timeout: 180_000,
  assertionTimeout: 15_000,
  reporters: ['list'],
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
} satisfies E2EConfig;
