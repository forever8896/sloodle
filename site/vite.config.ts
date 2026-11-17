import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(here, "..");
const appApi = resolve(appRoot, "src/api");
const shim = resolve(here, "src/shim/api.ts");

/** The app's components talk to the engine through src/api.ts; on the page that module is the engine-free shim. */
function engineFree(): Plugin {
  return {
    name: "sloodle-site-engine-free",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return;
      const target = resolve(dirname(importer), source).replace(/\.ts$/, "");
      if (target === appApi) return shim;
    },
  };
}

/** Preloads the two Latin font files the first screen uses, so the headline does not reflow when they arrive. */
function preloadFonts(): Plugin {
  return {
    name: "sloodle-site-preload-fonts",
    apply: "build",
    transformIndexHtml(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((name) => /(fredoka|nunito)-latin-wght-normal.*\.woff2$/.test(name));
      const tags = files.map((file) => `<link rel="preload" href="./${file}" as="font" type="font/woff2" crossorigin>`).join("\n    ");
      return html.replace("</title>", `</title>\n    ${tags}`);
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  plugins: [engineFree(), preloadFonts(), react()],
  clearScreen: false,
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 1440, strictPort: true, fs: { allow: [appRoot] } },
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
