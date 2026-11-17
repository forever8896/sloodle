// The visitor's two page settings, kept in this browser only: light or dark, and whether the app's sounds play.
type Theme = "light" | "dark";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies until the page is closed.
  }
}

export function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function chosenTheme(): Theme | undefined {
  const saved = read("sloodle-site-theme");
  return saved === "light" || saved === "dark" ? saved : undefined;
}

/** Sets the root's colour scheme: the visitor's choice if there is one, otherwise the system's (and follows it). */
export function applyTheme(theme = chosenTheme()): void {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function chooseTheme(theme: Theme): void {
  write("sloodle-site-theme", theme);
  applyTheme(theme);
}

export function soundsWanted(): boolean {
  return read("sloodle-site-sound") === "on";
}

export function setSoundsWanted(on: boolean): void {
  write("sloodle-site-sound", on ? "on" : "off");
}
