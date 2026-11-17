// 7. The ad itself: a web copy (720p H.264 + AAC), poster first, nothing fetched until the visitor presses play.
import { useEffect, useRef, useState } from "react";
import { onAdRequest, takeAdRequest } from "../bus";
import { OwlStop, owl, useOwlZone } from "../owl";

export function Film() {
  const { zone, stop } = useOwlZone("film", "idle");
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const play = () => {
    const element = video.current;
    if (!element) return;
    setStarted(true);
    void element.play().catch(() => undefined);
  };

  useEffect(() => onAdRequest(() => takeAdRequest() && play()), []);

  return (
    <section ref={zone} data-owl-zone="film" id="film" className="beat film" aria-labelledby="film-title">
      <div className="film-head">
        <h2 id="film-title" className="display">
          Watch the <span className="accent">ad.</span>
        </h2>
        <p className="lede">47 seconds. Everything in it is the app's real interface, set in motion.</p>
        <OwlStop id="film" stopRef={stop} className="stop-film" />
      </div>
      <div className="film-player">
        <video
          ref={video}
          controls={started}
          preload="none"
          playsInline
          poster="./media/sloodle-ad-poster.webp"
          width={1280}
          height={720}
          aria-label="The sloodle ad, 47 seconds, with narration and music"
          onPlay={() => {
            setStarted(true);
            owl.setMood("film", "happy");
          }}
          onPause={() => owl.setMood("film", "idle")}
          onEnded={() => owl.setMood("film", "cheer")}
        >
          <source src="./media/sloodle-ad.mp4" type="video/mp4" />
        </video>
        {!started && (
          <button type="button" className="play" onClick={play} aria-label="Play the ad (47 seconds, with sound)">
            <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
            <span>Play the ad</span>
          </button>
        )}
      </div>
    </section>
  );
}
