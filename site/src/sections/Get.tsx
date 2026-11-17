// 8. Get it: the repository, the README's own run-from-source commands, and honest requirements.  9. The footer.
import { useRef } from "react";
import { StaticBlock, sim } from "../live";
import { useNear } from "../motion";
import { OwlStop, useOwlZone } from "../owl";
import { site } from "../site.config";

// The commands from README.md ("Develop"), after cloning.
const commands = sim.show({
  id: "site-commands",
  intent: "example",
  type: "code",
  title: "Run it from source",
  language: "bash",
  code: `git clone ${site.repositoryUrl}\ncd sloodle\npnpm install\n(cd sidecar && bun install)\npnpm tauri dev`,
  runnable: false,
});

export function Get() {
  const { zone, stop } = useOwlZone("get", "wave");
  const codeRef = useRef<HTMLDivElement>(null);
  const near = useNear(codeRef);
  return (
    <section ref={zone} data-owl-zone="get" id="get" className="beat get" aria-labelledby="get-title">
      <div className="get-copy">
        <h2 id="get-title" className="display">
          Get <span className="accent">sloodle.</span>
        </h2>
        <p className="lede">It's free and open source. Today you run it from source; it takes a few minutes.</p>
        <div className="cta-row">
          <a className="big" data-slot="button" data-variant="solid" href={site.repositoryUrl}>
            View on GitHub
          </a>
          {site.downloadUrl && (
            <a className="big" data-slot="button" href={site.downloadUrl}>
              Download
            </a>
          )}
        </div>
        <dl className="needs">
          <div>
            <dt>A desktop computer</dt>
            <dd>Built and tested on Linux. macOS and Windows are not tested yet. There is no mobile app.</dd>
          </div>
          <div>
            <dt>A Claude subscription</dt>
            <dd>With Claude Code installed and signed in. Or an Anthropic API key, entered in Settings.</dd>
          </div>
          <div>
            <dt>The tools to build it</dt>
            <dd>
              Node with pnpm, Bun, Rust and the <a href="https://tauri.app/start/prerequisites/">Tauri prerequisites</a>. Sloo's voice models download once, the first time it speaks.
            </dd>
          </div>
        </dl>
      </div>
      <div className="get-side">
        <OwlStop id="get" stopRef={stop} cushion className="stop-get" />
        <div ref={codeRef} className="float-card get-code">
          {near ? <StaticBlock component={commands} /> : <div className="code-placeholder small" />}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <img src="./sloo/mark.webp" alt="" width={56} height={66} loading="lazy" />
        <div>
          <p className="footer-word">sloodle</p>
          <p className="muted">Learn anything.</p>
        </div>
      </div>
      <nav aria-label="Footer">
        <a href={site.repositoryUrl}>Source code</a>
        <a href="#film">The ad</a>
        <a href="#get">Run it</a>
      </nav>
      <p className="muted footer-small">
        Open source under the {site.licence} licence. Runs on your computer; this page sets no cookies and loads nothing from anywhere else.
      </p>
    </footer>
  );
}
