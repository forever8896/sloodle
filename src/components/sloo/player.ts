import { entryFor, type Manifest, type SlooMedia, type SlooReaction, type SlooState, type StateEntry } from "./manifest";

/**
 * "native": VP9 WebM with a real alpha channel in a plain <video> (WebView2, WebKitGTK with GStreamer's codecalpha).
 * "packed": H.264 MP4 with colour above alpha, composited on a WebGL canvas (WKWebView, or any engine that drops VP9 alpha).
 */
type VideoMode = "native" | "packed";

interface Segment {
  media: SlooMedia;
  entry: StateEntry;
  clip: string;
  role: "intro" | "body" | "outro" | "once";
  variant: number;
}

interface Slot {
  clip: string;
  video: HTMLVideoElement;
  lastTime: number;
  used: number;
  ready: Promise<void>;
  texture?: WebGLTexture;
}

const FADE_MS = 260;
const POOL_SIZE = 4;
const LOAD_TIMEOUT_MS = 6000;

// WebKitGTK's GStreamer source needs Range requests. The dev server and plain HTTP answer them; the packaged app's custom
// protocol is not known to, so there every clip is fetched once into a blob URL shared by all players.
const blobs = new Map<string, Promise<string>>();

function source(url: string): Promise<string> {
  const protocol = new URL(url, location.href).protocol;
  if (protocol === "http:" || protocol === "https:" || protocol === "blob:") return Promise.resolve(url);
  let blob = blobs.get(url);
  if (!blob) {
    blob = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Sloo clip missing: ${url}`);
        return response.blob();
      })
      .then((data) => URL.createObjectURL(data));
    blobs.set(url, blob);
    blob.catch(() => blobs.delete(url));
  }
  return blob;
}

/** A video that can no longer show anything: no source (WebKit keeps currentSrc after the src is removed) or an error. */
function isBroken(video: HTMLVideoElement): boolean {
  return !video.getAttribute("src") || !!video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE;
}

// In WebKitGTK a <video> only advances while attached to the document and not visibility:hidden or display:none,
// so videos that feed the canvas stay in the page at 1px and opacity 0.
function makeVideo(className: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.className = className;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.setAttribute("aria-hidden", "true");
  return video;
}

function firstFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Sloo clip took too long to start")), LOAD_TIMEOUT_MS);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onError = () => finish(new Error(`Sloo clip failed (${video.error?.code ?? "?"}): ${video.currentSrc}`));
    video.addEventListener("error", onError);
    if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(() => finish());
    else (video as HTMLVideoElement).addEventListener("timeupdate", () => finish(), { once: true });
    video.play().catch((error: Error) => {
      if (error.name !== "AbortError") finish(error);
    });
  });
}

class Compositor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private mixLocation: WebGLUniformLocation | null;
  lost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error("WebGL is not available");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", () => (this.lost = true));

    const shader = (type: number, source: string) => {
      const object = gl.createShader(type)!;
      gl.shaderSource(object, source);
      gl.compileShader(object);
      return object;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }"));
    // Colour is premultiplied over black in the top half; the bottom half is the matte. Sampling stops half a texel short
    // of the seam so the halves do not bleed into each other.
    gl.attachShader(
      program,
      shader(
        gl.FRAGMENT_SHADER,
        `precision mediump float;
        varying vec2 uv;
        uniform sampler2D a;
        uniform sampler2D b;
        uniform float t;
        vec4 unpack(sampler2D s) {
          float y = clamp(uv.y, 0.001, 0.999) * 0.4996;
          vec3 colour = texture2D(s, vec2(uv.x, y)).rgb;
          float alpha = clamp((texture2D(s, vec2(uv.x, 0.5004 + y)).r - 0.03) / 0.94, 0.0, 1.0);
          return vec4(min(colour, vec3(alpha)), alpha);
        }
        void main() { gl_FragColor = t >= 1.0 ? unpack(b) : mix(unpack(a), unpack(b), t); }`,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Sloo compositor failed to link");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(gl.getUniformLocation(program, "a"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "b"), 1);
    this.mixLocation = gl.getUniformLocation(program, "t");
  }

  texture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  upload(slot: Slot): void {
    if (slot.video.readyState < 2 || slot.video.currentTime === slot.lastTime) return;
    slot.lastTime = slot.video.currentTime;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture ?? null);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slot.video);
  }

  draw(from: Slot | undefined, to: Slot, mix: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (from ?? to).texture ?? null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, to.texture ?? null);
    gl.uniform1f(this.mixLocation, from ? mix : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);
  }

  dispose(): void {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** Plays Sloo's clips for a state, crossfading between states and cutting between clips designed to join. */
class SlooPlayer {
  // Warm (loaded, paused on frame 0) videos by clip name. Starting one takes milliseconds; a fresh load takes 120-270 ms
  // in WebKitGTK, which is late for a reaction. The pool holds the playing clip, what follows it and the reactions.
  private pool = new Map<string, Slot>();
  private front?: Slot;
  private compositor?: Compositor;
  private target: SlooState = "idle";
  private reaction?: SlooReaction;
  private current?: Segment;
  /** The segment being loaded to replace `current`, until its first frame is ready. */
  private pending?: Segment;
  /** In native mode, the video fading out under the new one; kept loaded until the fade ends. */
  private leaving?: Slot;
  private fadeIn?: Animation;
  private watchdog?: ReturnType<typeof setInterval>;
  private token = 0;
  private active = true;
  private resting = false;
  private restDue = false;
  private destroyed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private fade?: { from: Slot; start: number };
  private frame = 0;
  private resize?: ResizeObserver;

  constructor(
    private host: HTMLElement,
    private manifest: Manifest,
    readonly mode: VideoMode,
    private events: { onReady: () => void; onUncovered: () => void; onFail: (error: Error) => void },
  ) {
    this.watchdog = setInterval(() => this.check(), 500);
    if (mode === "packed") {
      const canvas = document.createElement("canvas");
      canvas.className = "sloo-canvas";
      canvas.width = 640;
      canvas.height = 704;
      host.append(canvas);
      this.compositor = new Compositor(canvas);
      this.resize = new ResizeObserver(() => this.fitCanvas());
      this.resize.observe(host);
    }
  }

  start(state: SlooState): void {
    this.target = state;
    void this.play(this.opening(state), "cut");
  }

  setState(state: SlooState): void {
    if (state === this.target) return;
    this.target = state;
    if (this.reaction || !this.current) return;
    const entry = entryFor(this.manifest, state);
    // Back to what is on screen before the change finished loading (talking, a gap, talking again): drop the change.
    if (this.pending && entry === this.current.entry && this.current.role === "body") {
      this.cancelPending();
      return;
    }
    // A state that resolves to the clips already playing or loading (listening falls back to idle, say) changes nothing.
    const wanted = this.pending ?? this.current;
    if (entry === wanted.entry && (wanted.role === "body" || wanted.role === "intro")) return;
    const outro = this.current.role === "body" && !this.pending ? this.current.entry.outro : undefined;
    if (outro) void this.play({ ...this.current, clip: outro, role: "outro" }, "fade");
    else void this.play(this.opening(state), "fade");
  }

  private cancelPending(): void {
    this.token += 1;
    const pending = this.pending && this.pool.get(this.pending.clip);
    this.pending = undefined;
    if (pending && pending !== this.front) this.park(pending);
    this.armCurrent();
  }

  react(kind: SlooReaction): void {
    const entry = entryFor(this.manifest, kind);
    if (!entry) return;
    this.reaction = kind;
    void this.play({ media: kind, entry, clip: entry.clips[Math.floor(Math.random() * entry.clips.length)]!, role: "once", variant: 0 }, "fade");
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (!active) {
      for (const slot of this.pool.values()) slot.video.pause();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    } else if (this.front && !this.resting && !this.front.video.ended) {
      void this.front.video.play().catch(() => undefined);
      this.tick();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.token += 1;
    this.fadeIn?.cancel();
    clearInterval(this.watchdog);
    this.clearTimers();
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    for (const slot of [...this.pool.values()]) this.release(slot);
    this.compositor?.dispose();
    this.compositor?.canvas.remove();
  }

  /** Whether the clip on screen is really there: attached, decoded, and shown (or drawn on the canvas). */
  private covered(): boolean {
    const video = this.front?.video;
    if (!video || !video.isConnected || isBroken(video) || video.readyState < 2) return false;
    if (this.compositor) return !this.compositor.lost;
    return video.style.opacity === "1";
  }

  /** The floor: if nothing is showing, the stage falls back to the poster and the state starts again. */
  private check(): void {
    if (this.destroyed || !this.active || this.pending || !this.current) return;
    if (this.compositor?.lost) {
      this.events.onFail(new Error("WebGL context lost"));
      return;
    }
    if (this.covered()) return;
    this.events.onUncovered();
    this.reaction = undefined;
    const broken = this.front;
    if (broken && isBroken(broken.video)) {
      this.front = undefined;
      this.release(broken);
    }
    void this.play(this.opening(this.target), "cut");
  }

  private opening(media: SlooMedia): Segment {
    const entry = entryFor(this.manifest, media)!;
    if (entry.intro) return { media, entry, clip: entry.intro, role: "intro", variant: 0 };
    return this.body(media, entry, 0);
  }

  private body(media: SlooMedia, entry: StateEntry, variant: number): Segment {
    return { media, entry, clip: entry.clips[variant % entry.clips.length]!, role: "body", variant };
  }

  private next(segment: Segment): Segment | undefined {
    switch (segment.role) {
      case "intro":
        return this.body(segment.media, segment.entry, 0);
      case "outro":
      case "once":
        return this.opening(this.target);
      case "body":
        return segment.entry.play === "once" ? undefined : this.body(segment.media, segment.entry, segment.variant + 1);
    }
  }

  private url(clip: string): string {
    return this.manifest.url(`${clip}.${this.mode === "native" ? "webm" : "mp4"}`);
  }

  private slot(clip: string): Slot {
    let slot = this.pool.get(clip);
    if (!slot) {
      const video = makeVideo(this.mode === "native" ? "sloo-clip" : "sloo-clip sloo-clip-feed");
      video.style.opacity = "0";
      this.host.append(video);
      const ready = source(this.url(clip)).then((src) => {
        if (video.isConnected) video.src = src;
      });
      ready.catch(() => undefined);
      const created: Slot = { clip, video, lastTime: -1, used: 0, ready, texture: this.compositor?.texture() };
      video.addEventListener("error", () => {
        if (created === this.front && !this.destroyed) this.events.onFail(new Error(`Sloo clip failed: ${clip}`));
      });
      slot = created;
      this.pool.set(clip, slot);
    }
    slot.used = performance.now();
    while (this.pool.size > POOL_SIZE) {
      const keep = new Set([this.front, this.fade?.from, this.leaving, slot, this.pending && this.pool.get(this.pending.clip)]);
      const victim = [...this.pool.values()].filter((each) => !keep.has(each)).sort((a, b) => a.used - b.used)[0];
      if (!victim) break;
      this.release(victim);
    }
    return slot;
  }

  private release(slot: Slot): void {
    slot.video.onended = null;
    slot.video.pause();
    slot.video.removeAttribute("src");
    slot.video.load();
    slot.video.remove();
    if (slot.texture) this.compositor?.deleteTexture(slot.texture);
    this.pool.delete(slot.clip);
  }

  /** Loads what is likely to play next, so it starts without a wait. */
  private warm(segment: Segment): void {
    const clips = [this.next(segment)?.clip, entryFor(this.manifest, "correct")?.clips[0], entryFor(this.manifest, "encourage")?.clips[0]];
    for (const clip of clips) if (clip && clip !== segment.clip && !this.destroyed) this.slot(clip);
  }

  private async play(segment: Segment, how: "fade" | "cut"): Promise<void> {
    const token = ++this.token;
    this.clearTimers();
    this.settle();
    if (segment.media !== this.current?.media) this.restDue = false;
    this.resting = false;
    this.pending = segment;
    const slot = this.slot(segment.clip);
    const video = slot.video;
    if (slot !== this.front) video.onended = null;
    try {
      await slot.ready;
      if (token !== this.token || this.destroyed) return;
      video.loop = segment.role === "body" && segment.entry.play === "loop" && segment.entry.clips.length === 1;
      if (video.currentTime > 0 || video.ended) video.currentTime = 0;
      await firstFrame(video);
    } catch (error) {
      if (token === this.token && !this.destroyed) {
        this.pending = undefined;
        this.events.onFail(error as Error);
      }
      return;
    }
    if (token !== this.token || this.destroyed) return;
    this.pending = undefined;
    if (!this.active) video.pause();

    const old = this.front;
    this.front = slot;
    this.current = segment;
    if (old !== slot) this.show(slot, old, how);
    else if (this.compositor) this.tick();
    else slot.video.style.opacity = "1";
    this.events.onReady();
    this.arm(token);
    this.warm(segment);
  }

  /** Binds what follows the clip on screen when it ends (the next clip, or a rest) to the latest change. */
  private arm(token: number): void {
    const segment = this.current;
    const video = this.front?.video;
    if (!segment || !video) return;
    const ended = () => {
      if (token !== this.token) return;
      if (segment.role === "once") this.reaction = undefined;
      const next = segment.role === "body" && segment.entry.rest && this.restDue ? undefined : this.next(segment);
      if (next) void this.play(next, "cut");
      else this.rest();
    };
    video.onended = ended;
    const rest = segment.role === "body" ? segment.entry.rest : undefined;
    if (rest && this.restDue) video.loop = false;
    else if (rest)
      this.later(rest.after, () => {
        this.restDue = true;
        video.loop = false;
      });
    if (video.ended) ended();
  }

  private armCurrent(): void {
    this.clearTimers();
    this.arm(this.token);
  }

  /** Finishes a crossfade still in progress, so a quick second change starts from one clean layer. */
  private settle(): void {
    const from = this.fade?.from ?? this.leaving;
    this.fade = undefined;
    this.leaving = undefined;
    this.fadeIn?.cancel();
    this.fadeIn = undefined;
    for (const slot of this.pool.values()) {
      if (slot === this.front) continue;
      if (!this.compositor) {
        slot.video.style.transition = "none";
        slot.video.style.opacity = "0";
      }
      if (slot === from || !slot.video.paused) this.park(slot);
    }
    if (this.front && !this.compositor) {
      this.front.video.style.transition = "none";
      this.front.video.style.opacity = "1";
    }
  }

  /** Pauses a video that left the screen and rewinds it, so it is warm for next time. */
  private park(slot: Slot): void {
    slot.video.pause();
    slot.video.onended = null;
    if (slot.video.currentTime > 0) slot.video.currentTime = 0;
    slot.lastTime = -1;
  }

  private show(slot: Slot, old: Slot | undefined, how: "fade" | "cut"): void {
    if (this.compositor) {
      this.compositor.upload(slot);
      this.fade = how === "fade" && old ? { from: old, start: performance.now() } : undefined;
      if (old && !this.fade) this.park(old);
      this.tick();
      return;
    }
    slot.video.style.zIndex = "2";
    slot.video.style.transition = "none";
    slot.video.style.opacity = "1";
    if (!old) return;
    old.video.style.zIndex = "1";
    const hideOld = () => {
      if (this.leaving !== old) return;
      this.leaving = undefined;
      this.fadeIn = undefined;
      if (old === this.front || this.destroyed) return;
      old.video.style.opacity = "0";
      this.park(old);
    };
    this.leaving = old;
    if (how === "cut") {
      hideOld();
      return;
    }
    // The old layer is hidden only once the new one has finished fading in. A timer of the fade's length is not
    // enough: WebKit starts a transition on its next rendered frame, and when the page is busy (text streaming in,
    // speech starting) that start slips, the timer hid the old layer first and Sloo flashed nearly empty.
    this.fadeIn = slot.video.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-in-out" });
    this.fadeIn.finished.then(hideOld, () => undefined);
  }

  /** Idle can settle on its last frame (the hero pose) and wake for one loop now and then, to save decoding all session. */
  private rest(): void {
    const segment = this.current;
    this.resting = true;
    const every = segment?.role === "body" ? segment.entry.rest?.every : undefined;
    if (!segment || !every) return;
    const wait = every[0] + Math.random() * Math.max(0, every[1] - every[0]);
    this.later(wait, () => {
      if (!this.active) {
        this.rest();
        return;
      }
      void this.play(segment.entry.clips.length > 1 ? this.body(segment.media, segment.entry, segment.variant + 1) : { ...segment }, "cut");
    });
  }

  private tick = (): void => {
    if (!this.compositor || this.frame || !this.active) return;
    const loop = () => {
      this.frame = 0;
      const compositor = this.compositor;
      const to = this.front;
      if (!compositor || !to || this.destroyed) return;
      if (compositor.lost) {
        this.events.onFail(new Error("WebGL context lost"));
        return;
      }
      compositor.upload(to);
      let mix = 1;
      const fade = this.fade;
      if (fade) {
        compositor.upload(fade.from);
        mix = Math.min(1, (performance.now() - fade.start) / FADE_MS);
      }
      compositor.draw(fade?.from, to, mix);
      if (fade && mix >= 1) {
        this.fade = undefined;
        this.park(fade.from);
      }
      const playing = !to.video.paused && !to.video.ended;
      if (playing || this.fade) this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  };

  private fitCanvas(): void {
    const canvas = this.compositor?.canvas;
    if (!canvas || !this.compositor) return;
    const width = Math.min(640, Math.max(64, Math.round(this.host.clientWidth * devicePixelRatio)));
    if (Math.abs(canvas.width - width) < 8) return;
    canvas.width = width;
    canvas.height = Math.round((width * 704) / 640);
    // Resizing clears the canvas; a paused video needs one redraw from its last texture.
    if (this.front) this.compositor.draw(undefined, this.front, 1);
    this.tick();
  }

  private later(seconds: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, seconds * 1000);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}

const alphaChecks = new Map<string, Promise<boolean>>();

/** Plays the first frames of a WebM and reads a corner pixel: engines that drop VP9 alpha (Safari, WKWebView) draw it opaque. */
function keepsWebmAlpha(url: string): Promise<boolean> {
  let check = alphaChecks.get(url);
  if (!check) {
    check = (async () => {
      const video = makeVideo("sloo-clip-feed");
      document.body.append(video);
      try {
        video.src = await source(url);
        await firstFrame(video);
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        // Right after the first frame callback WebKitGTK can still hand drawImage an empty image, which read as "no
        // alpha" and sent the app down the far costlier canvas path. Read until the body (frame centre) is there.
        for (let attempt = 0; attempt < 20; attempt++) {
          context.clearRect(0, 0, 16, 16);
          context.drawImage(video, 0, 0, 16, 16);
          const corner = context.getImageData(0, 0, 1, 1).data[3]!;
          const middle = context.getImageData(8, 9, 1, 1).data[3]!;
          if (middle > 200) return corner < 16;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
      } catch {
        return false;
      } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
    })();
    alphaChecks.set(url, check);
  }
  return check;
}

let webglSupport: boolean | undefined;

/** Asked once: every probe context counts against the engine's limit (16 in WebKit) until it is collected. */
function hasWebgl(): boolean {
  if (webglSupport === undefined) {
    const context = document.createElement("canvas").getContext("webgl");
    webglSupport = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return webglSupport;
}

let forcedMode: VideoMode | undefined;

/** The audition page uses this to compare the two paths on one machine. */
function forceVideoMode(mode: VideoMode | undefined): void {
  forcedMode = mode;
}

/** Picks how this engine can show the manifest's clips with transparency, or undefined when it cannot. */
async function chooseVideoMode(manifest: Manifest): Promise<VideoMode | undefined> {
  const idle = manifest.states.idle;
  if (!idle) return undefined;
  const probe = document.createElement("video");
  const webm = probe.canPlayType('video/webm; codecs="vp9"') !== "";
  const mp4 = probe.canPlayType('video/mp4; codecs="avc1.640028"') !== "";
  const webgl = hasWebgl();
  if (forcedMode === "packed") return mp4 && webgl ? "packed" : undefined;
  if (webm && (forcedMode === "native" || (await keepsWebmAlpha(manifest.url(`${idle.clips[0]}.webm`))))) return "native";
  return mp4 && webgl ? "packed" : undefined;
}

export { chooseVideoMode, forceVideoMode, SlooPlayer };
export type { VideoMode };
