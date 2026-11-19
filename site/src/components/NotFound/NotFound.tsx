// An address with nothing on it: the end of the tape, and the way back.

import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="state">
      <h1>end of side A</h1>
      <p>Nothing was recorded at this address. The link may be mistyped, or the page may have moved.</p>
      <div className="actions">
        <Link className="btn primary" to="/">
          ⏮ Rewind to Compare
        </Link>
        <Link className="btn" to="/results">
          All results
        </Link>
      </div>
    </div>
  );
}
