// The shell: a dusk sky with the brand, the pages and the theme switch, a telemetry strip along its
// horizon, then the page, then the footer. Errors and loading are designed states with a way on.

import { Link, Outlet } from "@tanstack/react-router";
import { Component, Suspense, useState, type ReactNode } from "react";
import { useIndex } from "../../data/useIndex.ts";
import { applyTheme, storedTheme, type ThemeChoice } from "../../theme.ts";
import { Loading } from "../Loading/Loading.tsx";

// quiet: render nothing on error (the telemetry strip; the page below reports the error itself).
class Boundary extends Component<{ children: ReactNode; quiet?: boolean }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="state" role="alert">
        <h1>the tape snapped</h1>
        <p>Could not load the results: {this.state.error.message}</p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

const THEMES: { value: ThemeChoice; icon: string; label: string }[] = [
  { value: "system", icon: "◐", label: "Auto" },
  { value: "light", icon: "☀", label: "Light" },
  { value: "dark", icon: "☾", label: "Dark" },
];

function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={theme === t.value}
          aria-label={`${t.label} theme`}
          title={`${t.label} theme`}
          onClick={() => {
            setTheme(t.value);
            applyTheme(t.value);
          }}
        >
          <span aria-hidden="true">{t.icon}</span> <span className="label" aria-hidden="true">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// What the site holds, read like an instrument: results, machines, implementations, and the date of
// the newest measurement.
function Telemetry() {
  const index = useIndex();
  const machines = new Set(index.results.map((r) => r.machine.id)).size;
  const implementations = new Set(index.builds.map((b) => b.implementation)).size;
  const latest = index.results.map((r) => r.date).sort().at(-1);
  return (
    <ul className="telemetry wrap" aria-label="What the site holds">
      <li>
        <b>{index.results.length}</b> results
      </li>
      <li>
        <b>{machines}</b> machine{machines === 1 ? "" : "s"}
      </li>
      <li>
        <b>{implementations}</b> implementations
      </li>
      <li>
        latest run <b>{latest ?? "–"}</b>
      </li>
    </ul>
  );
}

export function Layout() {
  return (
    <>
      <header className="sky">
        <span className="sun" aria-hidden="true" />
        <span className="floor" aria-hidden="true" />
        <div className="masthead wrap">
          <Link to="/" className="brand" aria-label="Parallax results, home">
            <span className="word">Parallax</span>
            <span className="script">results</span>
          </Link>
          <nav className="tabs" aria-label="Pages">
            <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>
              Compare
            </Link>
            <Link to="/results">Results</Link>
            <Link to="/about">About</Link>
          </nav>
          <span className="spacer" />
          <ThemeSwitch />
        </div>
        <Boundary quiet>
          <Suspense fallback={<div className="telemetry wrap" aria-hidden="true" />}>
            <Telemetry />
          </Suspense>
        </Boundary>
      </header>
      <main className="wrap">
        <Boundary>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </Boundary>
      </main>
      <footer className="foot">
        <div className="wrap">
          <span>
            Measured with <a href="https://github.com/THEtheChad/parallax">Parallax</a> · verified before publishing ·{" "}
            <a href="https://github.com/THEtheChad/parallax-results">source</a>
          </span>
          <span className="spacer" />
          <Link to="/about" hash="contribute">
            Run it on your machine →
          </Link>
          <span className="caption" aria-hidden="true">
            pressed in Kansas City
          </span>
        </div>
      </footer>
    </>
  );
}
