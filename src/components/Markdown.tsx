import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, type MouseEvent } from "react";

function openLinksOutside(event: MouseEvent<HTMLDivElement>) {
  const link = (event.target as HTMLElement).closest("a");
  if (!link?.href) return;
  event.preventDefault();
  if (isTauri()) void openUrl(link.href);
  else window.open(link.href, "_blank", "noopener");
}

function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true })), [text]);
  return <div className={`prose ${className ?? ""}`} onClick={openLinksOutside} dangerouslySetInnerHTML={{ __html: html }} />;
}

export { Markdown };
