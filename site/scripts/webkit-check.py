#!/usr/bin/env python3
# Looks at the page in WebKitGTK (the Safari-class engine on Linux): Sloo's video path, the live components and
# screenshots. python3 scripts/webkit-check.py http://localhost:1441/ out-dir [width]
import json
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

url, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1280
height = 860

window = Gtk.Window(title="sloodle site check (closes itself)")
window.set_default_size(width, height)
settings = WebKit2.Settings(enable_webgl=True, enable_media=True, media_playback_requires_user_gesture=False, enable_write_console_messages_to_stdout=True)
view = WebKit2.WebView(settings=settings)
view.set_size_request(width, height)
window.add(view)
window.show_all()

steps = []
results = {}


def js(code, done):
    def finished(webview, result):
        try:
            value = webview.evaluate_javascript_finish(result)
            done(json.loads(value.to_string()) if value and not value.is_undefined() else None)
        except Exception as error:  # noqa: BLE001
            done(f"error: {error}")

    view.evaluate_javascript(f"JSON.stringify((() => {{ {code} }})())", -1, None, None, None, finished)


def shot(name, done):
    def finished(webview, result):
        surface = webview.get_snapshot_finish(result)
        surface.write_to_png(f"{out}/webkit-{width}-{name}.png")
        done(None)

    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, finished)


def later(ms, fn):
    GLib.timeout_add(ms, lambda: (fn(), False)[1])


def run(i=0):
    if i >= len(steps):
        print(json.dumps(results, indent=1))
        Gtk.main_quit()
        return
    kind, arg, wait = steps[i]
    nxt = lambda *_: later(wait, lambda: run(i + 1))  # noqa: E731
    if kind == "js":
        name, code = arg
        js(code, lambda value: (results.__setitem__(name, value), nxt()))
    elif kind == "shot":
        shot(arg, nxt)


def scroll(selector):
    return ("js", ("scroll " + selector, f"const el = document.querySelector('{selector}'); el && el.scrollIntoView({{block: 'center'}}); return !!el;"), 3500)


steps = [
    ("js", ("sloo", "const s = document.querySelector('.owl .sloo'); return s && {kind: s.dataset.kind, ready: 'ready' in s.dataset, canvas: !!s.querySelector('canvas'), video: !!s.querySelector('video.sloo-clip')};"), 500),
    ("shot", "hero", 300),
    ("js", ("load below", "document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('build').scrollIntoView(); return true;"), 2500),
    ("js", ("near blocks", "document.querySelector('[data-owl-zone=blocks]').scrollIntoView(); return true;"), 2500),
    scroll(".c-code"),
    ("js", ("code output", "return [window.scrollY, document.querySelector('.c-code').getBoundingClientRect().top, document.querySelector('.c-code .block-code-output').textContent];"), 300),
    ("js", ("run again", "const b = [...document.querySelectorAll('.c-code button')].find(b => /^Run/.test(b.textContent)); b && b.click(); return b && b.textContent;"), 2500),
    ("js", ("code output 2", "return document.querySelector('.c-code .block-code-output').textContent;"), 300),
    ("shot", "code", 300),
    scroll(".c-flash"),
    ("js", ("flip", "const b = [...document.querySelectorAll('.c-flash button')].find(b => b.textContent.includes('flip')); b && b.click(); return !!b;"), 1500),
    ("js", ("back", "return [...document.querySelectorAll('.c-flash .flip-face')].find(f => !f.inert).textContent.slice(0, 80);"), 300),
    ("shot", "flash", 300),
    scroll(".c-diagram"),
    ("js", ("diagram", "return !!document.querySelector('.c-diagram svg');"), 300),
    ("shot", "diagram", 300),
    scroll(".lesson .float-card"),
    ("js", ("sloo later", "const s = document.querySelector('.owl .sloo'); return s && {kind: s.dataset.kind, ready: 'ready' in s.dataset, canvas: !!s.querySelector('canvas'), mood: s.dataset.mood};"), 300),
    ("shot", "teach", 300),
    scroll(".film-player"),
    ("js", ("video", "const v = document.querySelector('.film-player video'); v.muted = true; v.play(); return v.canPlayType('video/mp4; codecs=\"avc1.64001F, mp4a.40.2\"');"), 4000),
    ("js", ("video time", "return document.querySelector('.film-player video').currentTime;"), 300),
    ("shot", "film", 300),
]


def loaded(webview, event):
    if event == WebKit2.LoadEvent.FINISHED:
        later(4000, run)


view.connect("load-changed", loaded)
view.load_uri(url)
GLib.timeout_add_seconds(120, lambda: (Gtk.main_quit(), False)[1])
Gtk.main()
