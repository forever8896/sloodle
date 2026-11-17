# Contributing

Thanks for wanting to help Sloo teach. Issues and pull requests are welcome.

- **Before a big change**, open an issue so we can agree on the shape first.
- **Before a pull request**, run the checks: `pnpm exec tsc --noEmit` at the root, and `bun test` and
  `bunx tsc --noEmit` in `sidecar/`. If you change `sidecar/src/formats.ts`, run `bun run schema` in `sidecar/` and
  commit the regenerated files in `sidecar/schema/`.
- **Teaching rules** belong in code when the model must not be able to skip them: see `AGENTS.md` for where they live.
- Keep it local-first. A change that sends something new off the machine needs to say so in the README's privacy
  section.

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
