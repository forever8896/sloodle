import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The ad scores its bed with the app's own instrument. sound.ts keeps its voices private, so this re-exports them
 * from the module as the ad loads it; the file on disk is not changed.
 */
function exposeInstrument(): Plugin {
  return {
    name: "sloodle-ad-expose-instrument",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/sound.ts")) return;
      return `${code}\nexport { tine, mallet, breath, click, pad, pop, run, sparkle, pent, semi, buildChain, voiceFor, sounds as __sounds };\n`;
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [exposeInstrument(), react()],
  clearScreen: false,
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 1431, strictPort: true, fs: { allow: [appRoot] } },
});
