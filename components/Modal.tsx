'use client';

import { useEffect } from 'react';

/**
 * Themed modal shell. Renders a centered card over a dimmed backdrop.
 * Escape and backdrop-click close it (via onClose). Navy theme to match the app.
 */
export function Modal({
  open, onClose, title, children, maxWidth = 460,
}: {
  open: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Stop the page behind the modal from scrolling, so on phones and tablets
    // swipes move the modal's own content instead of the page underneath.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(31,56,100,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth,
          boxShadow: '0 12px 40px rgba(31,56,100,.28)', overflow: 'hidden',
          // Never taller than the screen; the body below scrolls instead.
          maxHeight: '100%', display: 'flex', flexDirection: 'column',
        }}
      >
        {title && (
          <div style={{ flexShrink: 0, background: 'var(--navy)', color: '#fff', padding: '14px 20px', fontWeight: 700, letterSpacing: '.02em' }}>
            {title}
          </div>
        )}
        <div
          className="modal-body"
          style={{
            padding: 22, overflowY: 'auto', overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch', minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Themed confirm dialog. Resolve via onConfirm/onCancel.
 * Use in place of window.confirm.
 */
export function ConfirmDialog({
  open, title = 'Please confirm', message, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', danger = false, onConfirm, onCancel,
}: {
  open: boolean; title?: string; message: string;
  confirmLabel?: string; cancelLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
        <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

/**
 * Themed alert dialog (single OK). Use in place of window.alert.
 */
export function AlertDialog({
  open, title = 'Notice', message, onClose, tone = 'info',
}: {
  open: boolean; title?: string; message: string; onClose: () => void;
  tone?: 'info' | 'error' | 'success';
}) {
  const color = tone === 'error' ? 'var(--danger)' : tone === 'success' ? 'var(--ok)' : 'var(--navy)';
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p style={{ margin: '0 0 20px', lineHeight: 1.5, color }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>OK</button>
      </div>
    </Modal>
  );
}
