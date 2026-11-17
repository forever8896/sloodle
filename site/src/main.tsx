// The same fonts and stylesheets as the app (src/main.tsx), in the same order, then the page's own layer.
import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "@fontsource-variable/nunito/wght-italic.css";
import "@ui-sdk/core/web.css";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/styles.css";
import "../../src/styles/app.css";
import "../../src/styles/chat.css";
import "./site.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { forceVideoMode } from "../../src/components/sloo/player";
import { installSounds, sfx } from "../../src/sound";
import { App } from "./App";
import { installSpringEasing } from "./motion";
import { applyTheme, soundsWanted } from "./prefs";

applyTheme();
// ?packed tries the colour-over-alpha MP4 path that Safari takes, in any browser (for checking it).
if (new URLSearchParams(location.search).has("packed")) forceVideoMode("packed");
installSpringEasing();
// The app's sounds play on the page too, but only after the visitor turns them on.
sfx.setMuted(!soundsWanted());
installSounds();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
