# Notes for coding agents

- The interface uses UI SDK. Before using it, follow the ui-sdk skill if it is installed
  (`node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`) and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a
  new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading and read `rendering.md` next to it.
- Teaching behaviour lives in `sidecar/src/prompts.ts` (what the tutor is told) and `sidecar/src/session.ts` and
  `sidecar/src/learner.ts` (what the harness enforces). Change the rule in code when the model must not be able to
  skip it.
- The sidecar must keep a single copy of `@huggingface/transformers`, pinned to the version `kokoro-js` uses. Two
  copies load two ONNX runtimes into one process and speech fails to start.
- Agent SDK sessions pass `settingSources: []` so the user's own Claude Code settings and CLAUDE.md never leak into
  the tutor.
