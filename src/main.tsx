import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";
import "@fontsource-variable/nunito/wght-italic.css";
import "@ui-sdk/core/web.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles.css";
import "./styles/app.css";
import "./styles/onboarding.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { App, DemoGallery, DemoOnboarding } from "./App";
import { demo } from "./api";
import { SoundAudition } from "./components/SoundAudition";
import { installSounds } from "./sound";

const audition = new URLSearchParams(location.search).has("sounds");
if (!audition) installSounds();

// ?sloo shows every Sloo state; development only, so its synthetic test clips stay out of the app bundle.
const SlooAudition =
  import.meta.env.DEV && new URLSearchParams(location.search).has("sloo")
    ? React.lazy(() => import("./components/SlooAudition").then((module) => ({ default: module.SlooAudition })))
    : undefined;

// ?blocks shows every lesson component in each state; development only.
const BlockGallery =
  import.meta.env.DEV && new URLSearchParams(location.search).has("blocks")
    ? React.lazy(() => import("./components/blocks/BlockGallery").then((module) => ({ default: module.BlockGallery })))
    : undefined;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {audition ? (
      <SoundAudition />
    ) : BlockGallery ? (
      <React.Suspense>
        <BlockGallery />
      </React.Suspense>
    ) : SlooAudition ? (
      <React.Suspense>
        <SlooAudition />
      </React.Suspense>
    ) : demo && new URLSearchParams(location.search).has("onboarding") ? (
      <DemoOnboarding />
    ) : demo ? (
      <DemoGallery />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
