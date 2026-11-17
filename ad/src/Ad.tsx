// The whole ad: scenes on one clock, with Sloo as a single actor across all of them.
import type { ReactNode } from "react";
import { BUILD, BuildScene, buildPose } from "./scenes/Build";
import { OpenScene, openPose, OPEN } from "./scenes/Open";
import { SHARE, ShareScene, sharePose } from "./scenes/Share";
import { TEACH, TeachScene, teachPose } from "./scenes/Teach";
import { END, EndScene, endPose, YOURS, YoursScene, yoursPose } from "./scenes/Yours";
import { cueFrame, seq, SlooFrame, type Cue } from "./SlooClip";
import { FPS, SceneTime, SlooPose, useGlobalFrame } from "./time";

export const DURATION = END.start + END.end;

/** Sloo's clips over the whole ad, in global seconds. Segments end on the hero pose, so each join is a clean cut. */
export const SLOO: Cue[] = [
  { at: 0.1, clip: "wave", speed: 1.5 },
  { at: OPEN.closeup, clip: "happy-hd", from: 11, speed: 1.15 },
  ...seq(OPEN.wide, [{ clip: "cheer", from: 12, speed: 1.25 }, { clip: "listening" }]),
  ...seq(9.55, [{ clip: "thinking", speed: 1.6 }, { clip: "writing", speed: 1.3 }]),
  ...seq(15.13, [{ clip: "listening", speed: 1.4 }, { clip: "cheer", speed: 1.6 }, { clip: "talking" }, { clip: "cheer", speed: 1.3 }]),
  { at: 27.06, clip: "idle", hold: true },
  ...seq(28.6, [{ clip: "wave", speed: 1.4 }, { clip: "happy", speed: 1.5 }, { clip: "idle", speed: 1.4 }, { clip: "writing", speed: 1.5 }, { clip: "happy", speed: 1.5 }, { clip: "cheer", speed: 1.15 }]),
  { at: 45.81, clip: "idle", hold: true },
];

function slooPose(t: number) {
  if (t < BUILD.start) return openPose(t);
  if (t < TEACH.start) return buildPose(t - BUILD.start);
  const teachEnd = teachPose(SHARE.start - TEACH.start, buildPose(TEACH.start - BUILD.start));
  if (t < SHARE.start) return teachPose(t - TEACH.start, buildPose(TEACH.start - BUILD.start));
  const shareEnd = sharePose(YOURS.start - SHARE.start, teachEnd);
  if (t < YOURS.start) return sharePose(t - SHARE.start, teachEnd);
  const yoursEnd = yoursPose(END.start - YOURS.start, shareEnd);
  if (t < END.start) return yoursPose(t - YOURS.start, shareEnd);
  return endPose(t - END.start, yoursEnd);
}

function Scene({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  const t = useGlobalFrame() / FPS;
  if (t < from || t >= to) return null;
  return <SceneTime.Provider value={t - from}>{children}</SceneTime.Provider>;
}

export function Ad() {
  const t = useGlobalFrame() / FPS;
  const pose = slooPose(t);
  const shown = cueFrame(SLOO, t);
  return (
    <SceneTime.Provider value={t}>
      <SlooPose.Provider value={pose}>
      <Scene from={0} to={BUILD.start}>
        <OpenScene />
      </Scene>
      <Scene from={BUILD.start} to={BUILD.start + BUILD.end}>
        <BuildScene />
      </Scene>
      <Scene from={TEACH.start} to={TEACH.start + TEACH.end}>
        <TeachScene />
      </Scene>
      <Scene from={SHARE.start} to={SHARE.start + SHARE.end}>
        <ShareScene />
      </Scene>
      <Scene from={YOURS.start} to={YOURS.start + YOURS.end}>
        <YoursScene />
      </Scene>
      <Scene from={END.start} to={END.start + END.end}>
        <EndScene />
      </Scene>
      {pose.opacity > 0 && <SlooFrame {...shown} {...pose} style={{ zIndex: 10 }} />}
      </SlooPose.Provider>
    </SceneTime.Provider>
  );
}
