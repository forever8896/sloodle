import { Markdown } from "../Markdown";
import type { BlockProps } from "./parts";

const tones = {
  tip: { label: "Tip", icon: "★" },
  warning: { label: "Warning", icon: "!" },
  "key-idea": { label: "Key idea", icon: "◆" },
  "common-mistake": { label: "Common mistake", icon: "✕" },
} as const;

function CalloutBlock({ component }: BlockProps<"callout">) {
  const tone = tones[component.tone];
  return (
    <aside className="block block-callout" data-tone={component.tone} aria-label={component.title ? `${tone.label}: ${component.title}` : tone.label}>
      <span className="block-callout-icon" aria-hidden="true">
        {tone.icon}
      </span>
      <div className="block-callout-body">
        <p className="eyebrow">{tone.label}</p>
        {component.title && <h3 className="block-title">{component.title}</h3>}
        <Markdown text={component.body} />
      </div>
    </aside>
  );
}

export { CalloutBlock };
