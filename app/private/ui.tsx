'use client';

import { useEffect } from 'react';

/** Small line icons for the private area (no extra packages needed). */
const paths: Record<string, React.ReactNode> = {
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M15.5 12H17M12 15.5V17M8.5 12H7" /></>,
  ledger: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  folderPlus: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10v6M9 13h6" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  open: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  rename: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  cut: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8 16L19 4M16 16L5 4" /></>,
  paste: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6" /></>,
  move: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M10 13h6M13 10l3 3-3 3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  more: <><circle cx="12" cy="5" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="12" cy="19" r="1.3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  up: <path d="M6 15l6-6 6 6" />,
  downArrow: <path d="M6 9l6 6 6-6" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>,
};

export function Icon({ name, className }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name] ?? paths.file}
    </svg>
  );
}

/** Coloured file-type badge for the file list. */
export function FileGlyph({ name, folder }: { name: string; folder?: boolean }) {
  if (folder) {
    return (
      <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
        <path d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.2l2 2h8.8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="var(--pv-folder)" />
        <path d="M2.5 9h19v8.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="#DDB862" />
      </svg>
    );
  }
  const ext = (name.includes('.') ? name.split('.').pop() || '' : '').toLowerCase();
  const color =
    ext === 'pdf' ? '#D14B3F'
    : ['xls', 'xlsx', 'csv', 'numbers'].includes(ext) ? '#2E8B57'
    : ['doc', 'docx', 'txt', 'rtf', 'pages', 'md'].includes(ext) ? '#3B6FD4'
    : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg', 'bmp', 'tif', 'tiff'].includes(ext) ? '#8E5BD6'
    : ['zip', 'rar', '7z', 'gz', 'tar'].includes(ext) ? '#8A7A5C'
    : ['mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'm4a'].includes(ext) ? '#D2742C'
    : '#8B8B86';
  return (
    <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
      <path d="M6 2.5h8l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11.5A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5z" fill="#fff" stroke="#D6D5D0" />
      <path d="M14 2.5v5h5" fill="none" stroke="#D6D5D0" />
      <rect x="3" y="12.5" width="13" height="6" rx="1.2" fill={color} />
      <text x="9.5" y="17" textAnchor="middle" fontSize="4.3" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        {(ext || 'file').slice(0, 4).toUpperCase()}
      </text>
    </svg>
  );
}

/** The private area's own modal (themed; never a browser popup). */
export function PvModal({
  open, title, onClose, children, footer, width = 420,
}: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pv-modal-back" onMouseDown={onClose}>
      <div className="pv-modal" style={{ maxWidth: width }} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pv-modal-head">{title}</div>
        <div className="pv-modal-body">{children}</div>
        {footer && <div className="pv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
