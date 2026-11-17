// Preloaded by `bun test` (bunfig.toml): every test runs against a throwaway data folder, never the person's own.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SLOODLE_DATA = mkdtempSync(join(tmpdir(), "sloodle-test-"));
