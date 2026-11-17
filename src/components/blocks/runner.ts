// Runs course JavaScript where it cannot reach the app, and only when the learner presses Run.
//
// - A sandboxed iframe with only allow-scripts: an opaque origin, so no access to this window, its storage, cookies,
//   Tauri's bridge or the engine's address and token. No popups, navigation, forms or modals.
// - Its content security policy is default-src 'none': no fetch, WebSocket, images, fonts or anything else that leaves
//   the frame. The worker the code runs in inherits that policy, and the obvious network globals are removed as well.
// - The code runs in a worker inside that frame, so a loop that never ends cannot freeze the window; after the time
//   limit the frame is removed, which ends the worker with it. Where a worker cannot be started, nothing runs.
// - Output is capped in lines and characters.

type Level = "log" | "info" | "warn" | "error";

interface RunLine {
  level: Level;
  text: string;
}

interface RunOutcome {
  status: "done" | "error" | "timeout" | "stopped" | "unavailable";
  lines: RunLine[];
  truncated: boolean;
}

const MAX_LINES = 200;
const MAX_CHARS = 20_000;
/** How long to wait for timers the code started after its last line ran. */
const SETTLE_MS = 400;

const PRELUDE = `(() => {
  const show = (v) => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.stack || String(v);
    try { const s = JSON.stringify(v, (k, x) => typeof x === "bigint" ? x + "n" : typeof x === "function" ? "[Function " + (x.name || "anonymous") + "]" : x === undefined ? "undefined" : x); return s === undefined ? String(v) : s; } catch { return String(v); }
  };
  const send = (level, args) => postMessage({ kind: "line", level, text: args.map(show).join(" ") });
  for (const level of ["log", "info", "warn", "error"]) console[level] = (...args) => send(level, args);
  console.debug = console.log;
  console.table = (data) => send("log", [data]);
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "importScripts", "Worker", "SharedWorker", "indexedDB", "caches", "BroadcastChannel", "WebTransport"]) {
    try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch {}
  }
  self.addEventListener("unhandledrejection", (e) => send("error", ["Uncaught (in promise)", e.reason]));
})();`;

const FRAME = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:">
</head><body><script>
addEventListener("message", (event) => {
  if (event.source !== parent || !event.data || typeof event.data.code !== "string") return;
  const { code, prelude, token } = event.data;
  const post = (data) => parent.postMessage(Object.assign({ token }, data), "*");
  let worker;
  try {
    const url = URL.createObjectURL(new Blob([prelude, "\\n", code, "\\n;postMessage({ kind: 'ran' });"], { type: "text/javascript" }));
    worker = new Worker(url);
  } catch (error) {
    post({ kind: "unavailable", text: String(error) });
    return;
  }
  worker.onmessage = (m) => post(m.data);
  worker.onerror = (e) => { e.preventDefault(); post({ kind: "error", text: e.message, line: e.lineno }); };
  post({ kind: "started" });
}, { once: true });
</script></body></html>`;

/** Starts running the code; output arrives through onLine. Call stop() to end it early. */
function runJavaScript(code: string, onLine: (line: RunLine) => void, timeoutMs = 3000): { done: Promise<RunOutcome>; stop: () => void } {
  const token = crypto.randomUUID();
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = FRAME;

  const lines: RunLine[] = [];
  let chars = 0;
  let truncated = false;
  let finish: (status: RunOutcome["status"]) => void = () => undefined;

  const done = new Promise<RunOutcome>((resolve) => {
    let settled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    finish = (status) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("message", onMessage);
      frame.remove();
      resolve({ status, lines, truncated });
    };
    const add = (line: RunLine) => {
      if (lines.length >= MAX_LINES || chars >= MAX_CHARS) {
        truncated = true;
        finish("stopped");
        return;
      }
      const text = line.text.slice(0, MAX_CHARS - chars);
      chars += text.length;
      lines.push({ ...line, text });
      onLine({ ...line, text });
    };
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.data?.token !== token) return;
      const data = event.data as { kind: string; level?: Level; text?: string; line?: number };
      if (data.kind === "line") add({ level: data.level ?? "log", text: String(data.text ?? "") });
      else if (data.kind === "ran") timers.push(setTimeout(() => finish("done"), SETTLE_MS));
      else if (data.kind === "error") {
        // The prelude takes the first line, so the learner's line numbers are one lower.
        const at = data.line && data.line > 1 ? ` (line ${data.line - 1})` : "";
        add({ level: "error", text: `${String(data.text ?? "Error")}${at}` });
        finish("error");
      } else if (data.kind === "unavailable") finish("unavailable");
    }
    window.addEventListener("message", onMessage);
    timers.push(setTimeout(() => finish("timeout"), timeoutMs));
    frame.addEventListener("load", () => frame.contentWindow?.postMessage({ code, prelude: PRELUDE, token }, "*"), { once: true });
  });

  document.body.append(frame);
  return { done, stop: () => finish("stopped") };
}

export { runJavaScript };
export type { RunLine, RunOutcome };
