// Writes the published JSON Schema files from the zod definitions in formats.ts. Run: bun run schema
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { schemas } from "./formats";

export const schemaDir = join(import.meta.dir, "..", "schema");

export function jsonSchemas(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => {
      const json = z.toJSONSchema(schema, { target: "draft-7", io: "input", unrepresentable: "any" }) as Record<string, unknown>;
      const doc = { title: name, ...json };
      return [`${name}.schema.json`, `${JSON.stringify(doc, null, 2)}\n`];
    }),
  );
}

if (import.meta.main) {
  mkdirSync(schemaDir, { recursive: true });
  for (const [file, text] of Object.entries(jsonSchemas())) writeFileSync(join(schemaDir, file), text);
  console.log(`Wrote ${Object.keys(schemas).length} schemas to ${schemaDir}`);
}
