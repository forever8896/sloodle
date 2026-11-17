// Draws Mermaid diagrams from course text, which may come from an imported course and so is untrusted.
//
// - Mermaid loads on the first diagram, in its own chunks; nothing of it is in the app's main bundle.
// - securityLevel "strict" (labels are text, click handlers off) and htmlLabels off, so labels are SVG text and no
//   HTML is rendered inside the diagram. Init directives, styling, class and click lines are removed from the source
//   first, so course text cannot change the configuration, add CSS, or link anywhere.
// - The SVG is sanitised again: no foreignObject, images, links or scripts, and no url() that points outside the SVG.
// - Colours come from the app's tokens as they resolve right now, so a diagram matches light and dark mode.

import DOMPurify from "dompurify";

type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let next = 0;

/** Lines that configure, style or link rather than describe; course text never needs them. */
const UNSAFE_LINE = /^\s*(%%\{|classDef\b|class\b|style\b|linkStyle\b|click\b|callback\b|href\b)/i;

function cleanSource(source: string): string {
  return source
    .split("\n")
    .filter((line) => !UNSAFE_LINE.test(line))
    .map((line) => line.replace(/:::[\w-]+/g, "").replace(/@\{[^}]*\}/g, ""))
    .join("\n")
    .replace(/%%\{[\s\S]*?\}%%/g, "");
}

/** A token's value as the browser resolves it at this element, light or dark. */
function resolve(el: Element, property: "color" | "fontFamily", token: string): string {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;${property === "color" ? "color" : "font-family"}:var(${token})`;
  el.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

function isDark(rgb: string): boolean {
  const [r = 255, g = 255, b = 255] = (rgb.match(/[\d.]+/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Changes whenever the app's colours change (the Appearance setting or the system's light and dark). */
function schemeKey(el: Element): string {
  return resolve(el, "color", "--surface") + resolve(el, "color", "--text");
}

function themeVariables(el: Element): Record<string, string> {
  const c = (token: string) => resolve(el, "color", token);
  const surface = c("--surface");
  const text = c("--text");
  const lavender = c("--lavender");
  const soft = c("--lavender-soft");
  const muted = c("--muted");
  const sunk = c("--sunk");
  const green = c("--green-soft");
  const note = c("--partial-soft");
  return {
    darkMode: String(isDark(surface)),
    background: surface,
    fontFamily: resolve(el, "fontFamily", "--font-text"),
    fontSize: "16px",
    primaryColor: soft,
    primaryTextColor: text,
    primaryBorderColor: lavender,
    secondaryColor: green,
    secondaryTextColor: text,
    secondaryBorderColor: lavender,
    tertiaryColor: sunk,
    tertiaryTextColor: text,
    tertiaryBorderColor: muted,
    mainBkg: soft,
    nodeBorder: lavender,
    nodeTextColor: text,
    textColor: text,
    lineColor: muted,
    clusterBkg: sunk,
    clusterBorder: muted,
    edgeLabelBackground: surface,
    titleColor: text,
    actorBkg: soft,
    actorBorder: lavender,
    actorTextColor: text,
    actorLineColor: muted,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: soft,
    labelBoxBorderColor: lavender,
    labelTextColor: text,
    loopTextColor: text,
    noteBkgColor: note,
    noteBorderColor: muted,
    noteTextColor: text,
    activationBkgColor: green,
    activationBorderColor: lavender,
  };
}

function sanitise(svg: string): string {
  const outside = /url\(\s*(?!['"]?#)[^)]*\)/gi;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") data.attrValue = data.attrValue.replace(outside, "none");
    if ((data.attrName === "href" || data.attrName === "xlink:href") && !data.attrValue.startsWith("#")) data.keepAttr = false;
  });
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && node.textContent) node.textContent = node.textContent.replace(outside, "none").replace(/@import[^;]*;?/gi, "");
  });
  try {
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["style"],
      FORBID_TAGS: ["foreignObject", "image", "a", "script", "use"],
      FORBID_ATTR: ["onload", "onerror", "onclick"],
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute");
    DOMPurify.removeHook("uponSanitizeElement");
  }
}

/** Renders one diagram to sanitised SVG, themed for where it will be shown. Throws a readable message when it cannot. */
function renderDiagram(source: string, where: Element): Promise<string> {
  loading ??= import("mermaid").then((module) => module.default);
  const job = queue.then(async () => {
    const mermaid = await loading!;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: themeVariables(where),
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
      sequence: { useMaxWidth: true },
      maxTextSize: 5000,
      maxEdges: 200,
      suppressErrorRendering: true,
      secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges", "suppressErrorRendering", "htmlLabels", "flowchart", "themeVariables", "themeCSS", "theme", "fontFamily"],
    });
    const clean = cleanSource(source);
    await mermaid.parse(clean);
    const { svg } = await mermaid.render(`sloodle-diagram-${++next}`, clean);
    return sanitise(svg);
  });
  queue = job.catch(() => undefined);
  return job.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.split("\n").slice(0, 4).join(" ").replace(/\s+/g, " ").slice(0, 300) || "The diagram could not be drawn.");
  });
}

export { cleanSource, renderDiagram, schemeKey };
