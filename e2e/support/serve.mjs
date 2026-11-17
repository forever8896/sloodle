// Builds the interface once and serves the build, for the test run (see app.command in e2e.config.ts).
//
// A built bundle behaves the same on every machine: no file watcher reloading the page when
// something in the tree changes, no dependency pre-bundling that reloads the page the first
// time a lazy import is reached, no hot-module socket. Recorded steps replay against exactly
// what was recorded. The build uses development mode so the ?blocks gallery (DEV only) is kept.
//
//   node support/serve.mjs <port>
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = join(here, '../.e2e/dist');
const port = Number(process.argv[2]);
// import.meta.env.DEV follows NODE_ENV, not the mode: without this the gallery is left out of the build.
process.env.NODE_ENV = 'development';
if (!Number.isInteger(port) || port <= 0) throw new Error('usage: node support/serve.mjs <port>');

// The app's own Vite, from the repository root.
const vite = await import(pathToFileURL(createRequire(join(root, 'package.json')).resolve('vite')).href);
const shared = { root, configFile: join(root, 'vite.config.ts'), mode: 'development', logLevel: 'warn' };

await vite.build({ ...shared, build: { outDir, emptyOutDir: true } });
const server = await vite.preview({ ...shared, build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
server.printUrls();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close().finally(() => process.exit(0));
  });
}
