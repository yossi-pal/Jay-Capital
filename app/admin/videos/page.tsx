import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isVideosOwner } from '@/lib/private-videos';

export const dynamic = 'force-dynamic';

// Keep the page out of search engines even though it is behind a login.
export const metadata: Metadata = { title: 'Videos', robots: { index: false, follow: false } };

/**
 * Private videos page. Reached from the (c) in the landing-page footer and not
 * linked anywhere else. Only the owner set in PRIVATE_VIDEOS_OWNER_EMAIL can
 * open it; everyone else gets the ordinary "page not found", so the page does
 * not reveal that it exists. The admin layout has already sent signed-out
 * visitors to the login screen.
 *
 * Layout only for now: the tiles below are placeholders until the video
 * sources are connected.
 */
const PLACEHOLDERS = Array.from({ length: 6 }, (_, i) => i);

export default async function VideosPage() {
  if (!(await isVideosOwner())) notFound();

  return (
    <div className="wrap" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="grow">
          <h1>Videos</h1>
          <div className="sub">Your private feed. Only you can see this page.</div>
        </div>
      </div>

      <div className="vid-chips" role="tablist" aria-label="Filter by source">
        <span className="vid-chip on">All</span>
        <span className="vid-chip">Source one</span>
        <span className="vid-chip">Source two</span>
      </div>

      <div className="card vid-feature">
        <div className="vid-player" aria-hidden="true"><PlayIcon size={56} /></div>
        <div className="vid-feature-info">
          <span className="vid-tag">Latest</span>
          <b className="vid-feature-title">The newest video plays here</b>
          <span className="muted">Channel name · date posted</span>
          <span className="muted vid-preview-note">
            This is a preview of the layout. Once your channels are connected, new videos
            will appear here automatically.
          </span>
        </div>
      </div>

      <div className="vid-grid">
        {PLACEHOLDERS.map(i => (
          <div key={i} className="card vid-card" aria-hidden="true">
            <div className="vid-thumb"><PlayIcon size={34} /></div>
            <span className="vid-line" style={{ width: '85%' }} />
            <span className="vid-line" style={{ width: '55%' }} />
            <span className="vid-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.14)" />
      <path d="M10 8.2v7.6L16 12z" fill="#fff" />
    </svg>
  );
}
