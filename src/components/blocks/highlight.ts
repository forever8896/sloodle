// Syntax highlighting with highlight.js core and only the languages a course can name (about 60 KB minified), loaded
// with the first code block. Its output is escaped text in <span class="hljs-…">, and is sanitised again before use.
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import type { CodeLanguage } from "../../api";

const languages = { bash, c, cpp, csharp, css, go, java, javascript, json, kotlin, php, python, ruby, rust, sql, swift, typescript, html: xml };
for (const [name, language] of Object.entries(languages)) hljs.registerLanguage(name, language);

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function highlight(code: string, language: CodeLanguage): string {
  const html = hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escape(code);
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] });
}

export { highlight };
