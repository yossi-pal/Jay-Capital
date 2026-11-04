/**
 * Placeholder shown the instant a link is clicked, while the server gathers
 * the page. Without it the old page just sits there until the new one is
 * ready, which reads as the click not having worked.
 */
export default function PageSkeleton() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ width: 240, height: 28, marginBottom: 10 }} />
      <div className="skel" style={{ width: 360, maxWidth: '80%', height: 14, marginBottom: 28 }} />
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="skel-grid">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skel" style={{ height: 18 }} />)}
        </div>
      </div>
      <div className="card">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skel" style={{ height: 16, marginBottom: 16, width: `${92 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
