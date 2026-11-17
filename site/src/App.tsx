import { Toggle } from "@ui-sdk/react/toggle";
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from "react";
import { Word } from "../../ad/src/kit";
import { SceneTime } from "../../ad/src/time";
import { sfx } from "../../src/sound";
import { requestAdPlay } from "./bus";
import { useBeatClock } from "./motion";
import { owl, OwlStop, Owl, useOwlZone } from "./owl";
import { chooseTheme, chosenTheme, setSoundsWanted, soundsWanted, systemTheme } from "./prefs";
import { site } from "./site.config";

const Below = lazy(() => import("./Below"));
const Footer = lazy(() => import("./Below").then((module) => ({ default: module.Footer })));

function useDark(): [boolean, (dark: boolean) => void] {
  const [dark, setDark] = useState(() => (chosenTheme() ?? systemTheme()) === "dark");
  useEffect(() => {
    if (chosenTheme()) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => !chosenTheme() && setDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return [
    dark,
    (value) => {
      chooseTheme(value ? "dark" : "light");
      setDark(value);
    },
  ];
}

function Nav() {
  const [dark, setDark] = useDark();
  const [sounds, setSounds] = useState(soundsWanted);
  return (
    <header className="nav">
      <a className="wordmark" href="#top" aria-label="sloodle, back to the top">
        <img src="./sloo/mark.webp" alt="" width={44} height={52} />
        <span>sloodle</span>
      </a>
      <div className="nav-actions">
        <Toggle
          className="nav-sounds"
          data-sound="off"
          pressed={sounds}
          onPressedChange={(on) => {
            setSoundsWanted(on);
            setSounds(on);
            sfx.setMuted(!on);
            if (on) sfx.play("open");
          }}
        >
          Sounds
        </Toggle>
        <Toggle pressed={dark} onPressedChange={setDark}>
          Dark
        </Toggle>
        <a className="nav-repo" data-slot="button" data-variant="solid" href={site.repositoryUrl}>
          GitHub
        </a>
      </div>
    </header>
  );
}

function Hero() {
  const { zone, stop } = useOwlZone("hero", "wave");
  const t = useBeatClock(zone, 2.6, { amount: 0 });

  // He waves hello, then settles.
  useEffect(() => {
    const timer = setTimeout(() => owl.setMood("hero", "idle"), 4200);
    return () => clearTimeout(timer);
  }, []);

  const watch = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("film")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    requestAdPlay();
  };

  return (
    <section ref={zone} data-owl-zone="hero" className="hero" id="top" aria-labelledby="hero-title">
      <SceneTime.Provider value={t}>
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title">
            <span className="line">
              <Word at={0.1}>Hey</Word> <Word at={0.38} className="accent">Stupid,</Word>
            </span>{" "}
            <span className="line">
              <Word at={0.78}>it's</Word> <Word at={0.9}>time</Word>
            </span>{" "}
            <span className="line">
              <Word at={1.16}>to</Word> <Word at={1.3} className="accent">learn.</Word>
            </span>
          </h1>
          <p className="hero-promise">
            The harness for learning <em>anything.</em>
          </p>
          <p className="hero-lede">Sloo, a plush owl tutor, researches any subject you name, plans a course around you and teaches it, right on your desktop.</p>
          <div className="cta-row">
            <a className="big" data-slot="button" data-variant="solid" href={site.repositoryUrl}>
              View on GitHub
            </a>
            <a className="big" data-slot="button" href="#film" onClick={watch}>
              Watch the ad
            </a>
          </div>
        </div>
      </SceneTime.Provider>
      <OwlStop id="hero" stopRef={stop} cushion className="stop-hero">
        <button type="button" className="owl-boop" aria-label="Say hi to Sloo" data-sound="off" onClick={() => owl.react("correct")} />
      </OwlStop>
    </section>
  );
}

export function App() {
  const page = useRef<HTMLDivElement>(null);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the content
      </a>
      <div className="page" ref={page}>
        <Nav />
        <main id="main">
          <Hero />
          <Suspense fallback={<div className="below-fallback" />}>
            <Below />
          </Suspense>
        </main>
        <Suspense>
          <Footer />
        </Suspense>
        <Owl page={page} />
      </div>
    </>
  );
}
