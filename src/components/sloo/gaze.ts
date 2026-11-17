// One set of window listeners for every Sloo on screen: where the pointer is, and which text field has focus.

type Apply = (x: number, y: number) => void;

interface Watcher {
  element: Element;
  wantsField: () => boolean;
  apply: Apply;
  last: [number, number];
}

const watchers = new Set<Watcher>();
let pointer: { x: number; y: number; at: number } | undefined;
let field: HTMLInputElement | HTMLTextAreaElement | undefined;
let frame = 0;
let settle: ReturnType<typeof setTimeout> | undefined;
const LOOK_AWAY_MS = 3500;

function target(watcher: Watcher): { x: number; y: number } | undefined {
  if (field && watcher.wantsField()) {
    const rect = field.getBoundingClientRect();
    // Follow the text as it is typed: from the left of the field towards the right as the caret moves along a line.
    const caret = field.selectionStart ?? field.value.length;
    const column = (caret - field.value.lastIndexOf("\n", caret - 1) - 1) % 60;
    return { x: rect.left + Math.min(0.9, 0.1 + column / 60) * rect.width, y: rect.top + rect.height / 2 };
  }
  if (pointer && performance.now() - pointer.at < LOOK_AWAY_MS) return pointer;
  return undefined;
}

function update(): void {
  frame = 0;
  for (const watcher of watchers) {
    const point = target(watcher);
    let x = 0;
    let y = 0;
    if (point) {
      const rect = watcher.element.getBoundingClientRect();
      if (rect.width === 0) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.45;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const distance = Math.hypot(dx, dy);
      // Within the character the eyes barely move; they reach the edge of their range a few body widths away.
      const reach = Math.min(1, distance / (rect.width * 2.5));
      x = distance ? (dx / distance) * reach : 0;
      y = distance ? (dy / distance) * reach : 0;
    }
    x = Math.round(x * 20) / 20;
    y = Math.round(y * 20) / 20;
    if (x === watcher.last[0] && y === watcher.last[1]) continue;
    watcher.last = [x, y];
    watcher.apply(x, y);
  }
}

function schedule(): void {
  if (!frame) frame = requestAnimationFrame(update);
  clearTimeout(settle);
  settle = setTimeout(() => {
    if (!frame) frame = requestAnimationFrame(update);
  }, LOOK_AWAY_MS + 50);
}

function onPointer(event: PointerEvent): void {
  pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  schedule();
}

function onFocus(): void {
  const active = document.activeElement;
  field = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type === "text") ? active : undefined;
  schedule();
}

function listen(on: boolean): void {
  const method = on ? addEventListener : removeEventListener;
  method("pointermove", onPointer as EventListener, { passive: true });
  method("focusin", onFocus);
  method("focusout", onFocus);
  method("input", schedule, { passive: true });
  method("selectionchange", schedule);
  if (!on) {
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    frame = 0;
  }
}

/** Calls `apply` with where the eyes should look, each from -1 to 1, until the returned function is called. */
function watchGaze(element: Element, wantsField: () => boolean, apply: Apply): () => void {
  const watcher: Watcher = { element, wantsField, apply, last: [0, 0] };
  if (watchers.size === 0) {
    listen(true);
    onFocus();
  }
  watchers.add(watcher);
  schedule();
  return () => {
    watchers.delete(watcher);
    if (watchers.size === 0) listen(false);
  };
}

/** Re-aims every watcher now (for example when Sloo starts or stops listening). */
function refreshGaze(): void {
  if (watchers.size) schedule();
}

export { refreshGaze, watchGaze };
