# Sloo: character bible, media contract and production guide

Sloo is the tutor in sloodle. This file is the reference for everyone who makes or places Sloo: what the character is,
the hero still, the clips to generate for each state, the exact files the app plays, and how to check them.

- Component: `src/components/Sloo.tsx` (the stage), with `src/components/sloo/` (manifest, player, drawn owl, ticker,
  gaze). Call shape: `<Sloo mood size level reaction />`.
- Media: `public/sloo/` with `public/sloo/manifest.json`. Adding clips is a no-code step: put files there, list them in
  the manifest.
- Audition page (development only): `pnpm dev`, then open <http://localhost:1420/?sloo>.

## 1. Character bible

**Who Sloo is.** A small plush owl who loves finding things out and loves it even more when you do. Warm, curious,
patient, quietly funny. Sloo never shows off and never sulks; when you get something wrong Sloo leans in, it does not
look disappointed. Sloo is a companion who thinks alongside you, not a teacher at a blackboard.

**What Sloo is made of.** A soft-sculpture plush toy, not a cartoon and not a real bird. Short, dense, tidy pile fabric
with a slight sheen, subtle stitched seams (a vertical seam down the middle of the head and body), clean silhouette, no
wispy loose fibres. Everything is rounded; there are no hard edges anywhere except the glossy eyes.

**Approved design.** `media/sloo/candidates/mix/M3.png`, cleaned to `media/sloo/hero.png` (sand backdrop) and
`media/sloo/hero-cutout.png` (transparent). These are the reference for every later image and clip.

| Part | Description | Colour (approx.) |
| --- | --- | --- |
| Body | Egg-shaped, wider at the bottom, about 1.2 times as tall as wide; one piece with the head, no neck | Cocoa brown `#6b3a2c` |
| Face mask | Two rounded lobes meeting at the centre seam, a soft dip above and below the beak, covering the upper face | Honey mustard `#e2a73d` |
| Eyes | Big, glossy, dark brown-black domes with an amber ring and one bright catchlight at upper right; set wide, inside the mask | Pupil `#170c08`, ring `#c47f1c` |
| Beak | Small, rounded, cream teardrop pointing down, between the eyes and slightly below them | Cream `#f4e4cd` |
| Belly | Large oval cream patch on the lower body, about 12 small brown speckles spread evenly | Cream `#f1e2c8`, speckles `#94643f` |
| Wings | Stubby rounded paddles sewn on at the sides, a little darker than the body, hanging slightly outward | `#5d3125` |
| Feet | Two cream rounded feet with three toe ridges, peeking out under the body | Cream `#f1e2c8` |
| Beret | Leaf-green felt beret, flat and round, sitting centred and straight on top, with a short curled stalk like an acorn cap's | Leaf green `#6f9c46` |

There is no mouth: the beak is the mouth. Sloo speaks by opening the beak slightly, and smiles with the eyes (closed
happy arcs) and the body (a hop, raised wings).

**Proportions to keep.** The body is about 60% of the frame height in the square hero framing; head and body are one
egg; the eyes sit at roughly 40% of the body height from the top; the belly takes the lower half; the beret is about
half the body's width.

**Originality.** Sloo is an original design. Do not prompt with or steer towards any existing mascot, brand character or
named plush line, and do not add accessories that recall one (no graduation cap, no glasses, no scarf, no books with
logos, no green owl colourway). The leaf-green beret and the honey mask on cocoa brown are Sloo's own signature.

**Consistency rules for every image and clip.**

1. Same character, same colours, same plush material; never redesign between states.
2. Front view, centred, full body, feet on the same ground line, with the same scale and framing as the hero still.
3. Plain flat warm sand backdrop `#efe4d2`, no gradient, no floor, no cast shadow (the app draws its own soft shadow).
4. Soft, even, shadowless frontal light.
5. No other characters, props only where the shot list names them, no text, no watermark.
6. Motion is gentle and plush-like: soft squash and settle, a small hop, wings flapping like stuffed paddles. No
   speed lines, no camera moves, no zoom, no cuts.

## 2. Hero still

The hero still is the pose every clip starts and ends on. It is approved; this section records how it was made, so it can
be redone at another size or touched up.

- Source: `media/sloo/hero.png` (2048x2048, sand backdrop) and `media/sloo/hero-cutout.png` (same, transparent).
- App poster: `public/sloo/hero.png`, 640x704 with transparency, made from the cutout:

  ```sh
  ffmpeg -i media/sloo/hero-cutout.png -vf "scale=791:791:flags=lanczos,crop=640:704:74:23" -compression_level 100 public/sloo/hero.png
  ```

  The same crop is applied to every square clip by `scripts/sloo-pack.sh`, so clips and poster line up to the pixel.

Prompt (the one that produced M3, for regenerating or making variants with an image model and the hero as reference):

> A plush toy owl character: soft short-pile plush fabric with subtle stitched seams, round egg-shaped body, stubby
> rounded wings, rounded felt feet. Deep cocoa-brown body, a honey-mustard face mask around the eyes, cream speckled belly
> patch, glossy black eyes with amber rings and white catchlights, tiny cream beak, cream feet, and a small leaf-green
> acorn-cap beret sitting centred and straight on top of the head. A single character only, full body from the top of the
> head to the feet, standing upright and facing the camera straight on in a calm, neutral, friendly pose, perfectly
> symmetrical, centred in a square frame, occupying about 60 percent of the frame height, generous empty margin on all
> sides. Both big warm eyes open and looking at the viewer, small beak clearly visible and closed, both wings resting at
> the sides of the body, feet together. Surface fibres short, dense and tidy with a clean crisp silhouette edge, no wispy
> or fly-away loose fibres. Soft, even, shadowless frontal light. Plain flat solid uniform background of warm sand
> (#efe4d2), no gradient, no floor, no cast shadow under the feet, no props, no text, no logo, no watermark. Cuddly,
> huggable, gentle.

**Pose stills.** Writing and thinking hold a pose that differs from the hero (a notebook, a wing at the chin). Make those
poses as stills first, by editing the hero with an image model ("the same plush owl, same framing and backdrop, now
holding a tiny cream notebook against its belly with its right wing, a small yellow pencil in the wing tip, looking down
at the notebook"), get them approved, then use them as start and end frames as the shot list says.

## 3. Shot list and motion prompts

Generate each clip with fal.ai image-to-video using **both a start and an end frame**. Unless the list says otherwise,
both are the hero still (`media/sloo/hero.png`), so the clip starts and ends on the same pose and loops. Settings for
every clip: square 1:1, 24 fps, the duration listed, no audio, camera locked off.

Append this to every motion prompt:

> Static locked-off camera, no zoom, no pan. Same plush owl, same framing, same plain warm sand background, soft even
> light. The motion is gentle and soft like a stuffed toy brought to life. The clip begins and ends in exactly the pose
> of the reference image, still and centred.

| Clip | State | Plays | Length | Start / end frame | Motion prompt |
| --- | --- | --- | --- | --- | --- |
| `idle-a` | idle | loop | 4 s | hero / hero | Sloo breathes slowly, body gently rising and settling; blinks once, slowly, around the middle; the beret's stalk sways a little. |
| `idle-b` | idle | loop | 4 s | hero / hero | Sloo glances to its left and back to the viewer, then gives a tiny contented wiggle, feet planted; blinks once at the end. |
| `listening` | listening | loop | 4 s | hero / hero | Sloo tilts its head slightly to one side as if listening closely, eyes attentive and a little wider, a slow small nod, then straightens. |
| `thinking-in` | thinking | intro | 1.5 s | hero / thinking pose | Sloo raises its left wing to its chin and looks up and to the side, thoughtful. |
| `thinking` | thinking | loop | 4 s | thinking pose / thinking pose | Sloo stays with wing at chin, eyes drifting up and to the side, a slow "hmm" tilt of the head and back, beret stalk swaying. |
| `thinking-out` | thinking | outro | 1.5 s | thinking pose / hero | Sloo lowers the wing and looks back at the viewer. |
| `writing-in` | writing | intro | 1.5 s | hero / writing pose | Sloo brings up a tiny notebook and pencil and looks down at it. |
| `writing` | writing | loop | 4 s | writing pose / writing pose | Sloo scribbles in the little notebook with small quick pencil movements, head bobbing slightly as it writes, pausing once to think. |
| `writing-out` | writing | outro | 1.5 s | writing pose / hero | Sloo tucks the notebook away and looks up at the viewer. |
| `talking` | talking | loop | 2 s | hero / hero | Sloo talks warmly: the small beak opens and closes softly in an easy speaking rhythm, slight head bobs, one small wing gesture. |
| `happy` | happy | loop with rests | 3 s | hero / hero | Sloo's eyes close into happy crescents, it bounces softly on its feet twice and lifts both wings a little, then settles. |
| `cheer` | cheer | loop with rests | 3 s | hero / hero | Sloo throws both wings up in delight and does one small joyful hop, landing softly, then settles. |
| `wave` | wave | loop with rests | 3 s | hero / hero | Sloo raises its right wing and waves hello twice, friendly and a little shy, then lowers it. |
| `correct` | correct (reaction) | once | 1.5 s | hero / hero | A quick proud hop with both wings up and eyes squeezed happy, landing softly. |
| `encourage` | encourage (reaction) | once | 2 s | hero / hero | A warm, encouraging nod with a small reassuring pat of the air with one wing, eyes kind and soft. |

Notes:

- Talking clips cannot match the words; the app adds a small bounce that follows the loudness of the voice, so keep the
  beak motion gentle and regular.
- If a generator overshoots or drifts, regenerate rather than fix: a clip that does not land on the start pose shows a
  visible jump when it loops or hands back.
- Optional later: `talking-in` and `talking-out` (0.5 s) if switching into talking looks abrupt, a second `talking`
  variant, and `idle-c`.

## 4. From generated clip to app files

Generated clips arrive as square MP4s on the sand backdrop (the first batch is in `media/sloo/clips/`: 1440x1440,
24 fps, 97 frames, first and last frame matching). The sand is too close to Sloo's cream belly and feet to colour-key,
so the background must be removed with a matting model (a video background-removal model on fal.ai, for example a
BiRefNet-based one, or any tool that returns either a video with alpha or a black-and-white mask video).

Then pack each clip:

```sh
# with a mask video from the matting tool
scripts/sloo-pack.sh media/sloo/clips/idle.mp4 public/sloo idle-a --matte media/sloo/mattes/idle.mp4 --trim-last
# or with a video that already has alpha (ProRes 4444 .mov, VP9-alpha .webm, PNG sequence)
scripts/sloo-pack.sh media/sloo/clips/idle-alpha.mov public/sloo idle-a --trim-last
```

`--trim-last` drops the final frame. Use it for every clip generated with an end frame: that last frame is the pose the
next clip (or the loop's own start) begins on, so keeping it would show the pose twice at every join. The output always has
exactly as many frames as the shorter of the clip and the matte (one fewer with `--trim-last`); the script counts them
first rather than trusting how ffmpeg ends the two streams, which on ffmpeg 9 sometimes held the last frame for seconds.

The script writes three files per clip into `public/sloo/` and prints their sizes. Then list the clip in
`public/sloo/manifest.json` (section 6) and open the audition page.

## 5. File contract

Every clip `<name>` is three files in `public/sloo/`:

| File | What | Played where |
| --- | --- | --- |
| `<name>.webm` | VP9, `yuva420p` with a real alpha channel (Matroska `alpha_mode=1`), 640x704, 24 fps, no audio | WebView2 (Windows) and WebKitGTK (Linux), in a plain `<video>` |
| `<name>.mp4` | H.264 High, level 4.0, `yuv420p`, BT.709 limited range, `+faststart`, 640x1408, 24 fps, no audio. Top half: colour premultiplied over black. Bottom half: the alpha as grey (white = opaque) | WKWebView (macOS) and any engine that drops VP9 alpha, composited on a WebGL canvas |
| `<name>.png` | The first frame, 640x704, RGBA with straight alpha | Shown before the clip starts, with reduced motion, and at small sizes |

Requirements:

- **Frame**: 640x704 (10:11). Sloo centred horizontally, feet about 30 px above the bottom edge, the top of the beret
  stalk about 80 px below the top edge, exactly as in `public/sloo/hero.png`. The frame centre must be opaque body and
  the corners transparent (the app checks this to detect whether the engine keeps VP9 alpha).
- **Background**: none. Transparent outside Sloo, with soft anti-aliased edges. No shadow in the clip; the app draws a
  soft ground shadow that follows light and dark themes (`"shadow": false` in the manifest turns it off).
- **Frame rate**: 24 fps. **Durations**: loops 2 to 4 s, intros and outros 0.5 to 1.5 s, reactions 1.5 to 2 s.
- **Seamless loops**: the first frame is the hero pose (or the state's pose) and the last frame is the one just before it,
  so `loop` joins without a hold or jump. Reactions, intros and outros start on the pose of what plays before them and end
  on the pose of what plays after, so the app can cut between them.
- **Size budget**: up to 1 MB per file; the whole `public/sloo/` folder up to 15 MB. A 4 s plush clip packs to about
  150 KB (WebM) and 330 KB (MP4) at the script's settings.

`scripts/sloo-pack.sh` produces exactly this from any square clip framed like the hero still.

## 6. The manifest

`public/sloo/manifest.json` lists what exists. The stage reads it once at start.

```json
{
  "version": 1,
  "poster": "hero.png",
  "shadow": true,
  "states": {
    "idle": { "clips": ["idle-a", "idle-b"], "rest": { "after": 20, "every": [8, 15] } },
    "listening": { "clips": ["listening"], "rest": { "after": 20, "every": [6, 12] } },
    "thinking": { "intro": "thinking-in", "clips": ["thinking"], "outro": "thinking-out", "rest": { "after": 30, "every": [6, 12] } },
    "writing": { "intro": "writing-in", "clips": ["writing"], "outro": "writing-out" },
    "talking": { "clips": ["talking"] },
    "happy": { "clips": ["happy"], "rest": { "after": 0, "every": [5, 9] } },
    "cheer": { "clips": ["cheer"], "rest": { "after": 0, "every": [5, 9] } },
    "wave": { "clips": ["wave"], "rest": { "after": 0, "every": [5, 9] } },
    "correct": { "clips": ["correct"] },
    "encourage": { "clips": ["encourage"] }
  }
}
```

| Field | Meaning |
| --- | --- |
| `version` | Always `1`. |
| `poster` | The still used when a state has no clip and before clips start. With a poster and no clips, the app shows the still with gentle CSS motion (this is the current state). |
| `shadow` | Draw the soft ground shadow under Sloo (default `true`). |
| `states.<state>.clips` | Clip names without extension. Several names are variants, played in turn. |
| `states.<state>.play` | `"loop"` (default for states) or `"once"` (play, then hold the last frame). Reactions are always played once and then hand back to the state underneath. |
| `states.<state>.intro` / `outro` | A clip played on entering or leaving the state, cut to the loop without a crossfade. |
| `states.<state>.poster` | A still for this state (defaults to the first clip's `.png`). |
| `states.<state>.rest` | After `after` seconds of looping, hold the last frame and play one loop every `every` seconds (a random time in that range). Saves decoding during long idle stretches. |

States: `idle`, `listening` (the learner is typing or speaking), `thinking`, `writing` (Sloo is composing a reply or
building a course), `talking` (Sloo's voice is playing), `happy`, `cheer`, `wave`. Reactions: `correct`, `encourage`.
A state with no entry uses its nearest stand-in: listening, thinking and talking use idle; writing uses thinking; happy,
cheer and wave use each other, then idle; correct uses happy or cheer; encourage uses cheer or happy. Clips need an
`idle` entry to be used at all; without one the app shows the poster, and without a poster it draws Sloo.

## 7. How the stage chooses what to show

1. **Clips**, when the manifest has an idle clip and the engine can play one with transparency:
   - **Native alpha** (`.webm`): the app plays the start of the idle WebM and reads a corner pixel. If it is transparent,
     the engine keeps VP9 alpha and plain `<video>` elements are used.
   - **Packed alpha** (`.mp4`): otherwise colour and alpha halves are composited in a small WebGL shader.
2. **The still** (poster), when there are no clips, with prefers-reduced-motion, below 56 px wide, or if video fails.
   Moods become whole-body motion (a tilt for listening, a sway for thinking, a hop for happy), and the bounce follows
   the voice while talking.
3. **The drawn owl** (SVG in `sloo/SlooFigure.tsx`), when there is no manifest or the media prop is `false`. It blinks,
   breathes, follows the pointer with its eyes (and the text field while listening), opens its beak with the voice,
   and has every state: notebook and pencil for writing, a wing to the chin and thought dots for thinking, a head tilt
   for listening, happy eyes and sparkles, a wave.

Switching states crossfades for 260 ms from the frame showing, and never shows an empty or black frame: the new clip is
started first and only shown once its first frame has been decoded. Clips designed to join (intro, loop, outro,
reaction and hand-back) cut instead. Setting the same state again does nothing, and two states that resolve to the
same clips (listening and idle without a listening clip) do not restart it. The player keeps up to four videos loaded
and paused on frame 0 (the current clip, what follows it, and the two reactions), so a reaction starts in about 15 ms
instead of 120 to 270 ms. Everything pauses when the window is hidden or Sloo is off screen.

## 8. Evidence: what plays where

Measured on the development machine, Linux with WebKitGTK 2.54.2 (the engine Tauri uses there) and GStreamer 1.28.9
(gst-plugins-base, -good, -bad, -ugly and gst-libav installed), by loading test pages in a WebKitGTK view:

| Check | Result |
| --- | --- |
| `canPlayType` H.264, VP9, AV1, HEVC | all `"probably"`, including HEVC with no HEVC decoder installed: not trustworthy, hence the runtime alpha check |
| VP9 with alpha in `<video>` | **alpha kept**: background pixel alpha 0, body 255 (GStreamer `vp9alphadecodebin`) |
| H.264 and VP9 frames into WebGL (`texImage2D`) | works; colour and matte halves read back correctly |
| `<video>` not attached to the document, or `display:none` / `visibility:hidden` | **never advances** (stuck at 0 s); attached at 1 px with `opacity: 0` plays |
| HTTP without Range support | fails ("unexpected 200 for range request"). Vite answers Range requests. The packaged app's custom protocol was not tested, so on any non-HTTP origin the player fetches each clip once into a blob URL, which plays (verified) |
| Start of a fresh video / warm paused video | 120 to 270 ms / 3 to 16 ms |

CPU of the WebKit process tree for one 220 px Sloo, as a percentage of one core (12-core machine, GPU compositing on):

| What is showing | CPU |
| --- | --- |
| Native VP9 alpha clip playing | 26 to 41% |
| Same, idle resting between loops (test settings: a 4 s loop every 3 to 6 s) | 25% on average; about 10% with the recommended rest settings |
| Packed H.264 + WebGL clip playing | 73 to 147% (the reason it is only the fallback) |
| Drawn owl, idle (breathing, blinking) | 11 to 18% |
| Still with motion | 6% |
| A CSS animation running continuously (for comparison) | 17 to 45%: WebKitGTK recomposites every frame, so the slow motion is written to CSS variables 12 times a second instead (`sloo/ticker.ts`) |

Expected but **not verified here**: WebView2 (Chromium) plays VP9 alpha WebM natively; WKWebView (macOS) drops VP9
alpha, so the runtime check picks the packed MP4 and WebGL path. Both should be checked once on those systems with the
audition page; the "Showing" line names the path taken. Linux users without gst-plugins-bad lose VP9 alpha (packed MP4
then needs gst-libav or openh264 for H.264); with neither, the still is shown.

## 9. The audition page

Development only. Run `pnpm dev` and open <http://localhost:1420/?sloo> in a browser, or in `pnpm tauri dev` open the
inspector and run `location.search = "?sloo"` to see it in the real webview.

- **Media**: the app manifest (`public/sloo/manifest.json`), the synthetic test clips (labelled blobs made by
  `scripts/sloo-test-clips.sh`, which prove the video path without art), or the drawn owl.
- **Video path**: automatic, or force native alpha or packed alpha to compare them.
- Buttons for every state and both reactions, a simulated voice for talking, a dark theme switch, Sloo on the page,
  panel, sun disc and checkerboard surfaces, and at the sizes the app uses. The "Showing" line reports what is actually
  playing (path and clip).
- Address options: `?sloo=test` or `?sloo=drawn` to start on that media, `&path=native` or `&path=packed`, and `&single`
  for one stage only (timing and CPU as in the app). `?sounds` is the sound audition next door.

## 10. Checklist for a new clip

1. Generate with the hero (or pose) still as start and end frame, using the shot-list prompt.
2. Remove the background with a matting model; pack with `scripts/sloo-pack.sh ... --trim-last`.
3. Add it to `public/sloo/manifest.json`.
4. On the audition page, check: no jump at the loop point, no fringe on the dark theme and the sun disc, hand-back
   from reactions lands cleanly, and the file sizes are within budget.
