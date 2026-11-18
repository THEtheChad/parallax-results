import { Link, Outlet } from "@tanstack/react-router";
import { Component, Suspense, useState, type ReactNode } from "react";
import { applyTheme, storedTheme, type ThemeChoice } from "../../theme.ts";

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? <p className="empty">Could not load the results: {this.state.error.message}</p> : this.props.children;
  }
}

export function Layout() {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);
  return (
    <div className="page">
      <header className="header">
        <h1>Parallax results</h1>
        <nav aria-label="Pages">
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>
            Compare
          </Link>
          <Link to="/results">Results</Link>
          <Link to="/about">About</Link>
        </nav>
        <span className="spacer" />
        <label className="theme">
          <span className="sr-only">Theme </span>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) => {
              const t = e.target.value as ThemeChoice;
              setTheme(t);
              applyTheme(t);
            }}
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <Boundary>
        <Suspense fallback={<p className="empty">Loading results…</p>}>
          <Outlet />
        </Suspense>
      </Boundary>
    </div>
  );
}
