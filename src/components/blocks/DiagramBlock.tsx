import { useEffect, useRef, useState } from "react";
import { Markdown } from "../Markdown";
import { renderDiagram, schemeKey } from "./diagram";
import { BlockHeader, type BlockProps } from "./parts";

const kindName = { flowchart: "Flowchart", sequence: "Sequence diagram", concept: "Concept map" } as const;

/** Changes when the app's colours do, so a diagram is redrawn for light or dark. */
function useScheme(ref: React.RefObject<HTMLElement | null>): string {
  const [key, setKey] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setKey(schemeKey(el));
    check();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme", "data-appearance"] });
    return () => {
      media.removeEventListener("change", check);
      observer.disconnect();
    };
  }, [ref]);
  return key;
}

function DiagramBlock({ component, progress, act }: BlockProps<"diagram">) {
  const ref = useRef<HTMLElement>(null);
  const scheme = useScheme(ref);
  const [svg, setSvg] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const reported = useRef(progress.problem !== undefined);
  const report = useRef(act);
  report.current = act;

  useEffect(() => {
    if (!scheme || !ref.current) return;
    let cancelled = false;
    renderDiagram(component.source, ref.current).then(
      (drawn) => {
        if (cancelled) return;
        setSvg(drawn);
        setFailure(undefined);
      },
      (error: Error) => {
        if (cancelled) return;
        setFailure(error.message);
        // Tell the tutor once, so it can offer a simpler picture.
        if (!reported.current) {
          reported.current = true;
          report.current({ do: "report", problem: error.message }).catch(() => undefined);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [component.source, scheme]);

  return (
    <figure className="content-card block block-diagram" ref={ref}>
      <BlockHeader component={component} />
      {failure ? (
        <div className="block-fallback" role="note">
          <p className="chip" data-tone="partial">
            This picture couldn't be drawn, so here it is in words
          </p>
          <Markdown text={component.description} />
        </div>
      ) : (
        <>
          <div className="block-diagram-canvas" role="img" aria-label={`${kindName[component.kind]}: ${component.description}`} aria-busy={svg === undefined} {...(svg ? { dangerouslySetInnerHTML: { __html: svg } } : {})}>
            {svg ? undefined : <span className="block-loading">Drawing…</span>}
          </div>
          <details className="block-describe">
            <summary>Describe it in words</summary>
            <Markdown text={component.description} />
          </details>
        </>
      )}
      {component.caption && (
        <figcaption>
          <Markdown text={component.caption} />
        </figcaption>
      )}
    </figure>
  );
}

export { DiagramBlock };
