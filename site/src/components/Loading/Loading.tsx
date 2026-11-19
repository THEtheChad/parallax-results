// While data/index.json loads: two tape reels turning (still under reduced motion), and the words.

export function Loading() {
  return (
    <div className="state" role="status">
      <div className="reels" aria-hidden="true">
        <span className="reel" />
        <span className="reel" />
      </div>
      <h1 className="quiet">Loading results…</h1>
    </div>
  );
}
