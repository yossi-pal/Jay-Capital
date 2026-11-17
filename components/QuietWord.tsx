'use client';

/**
 * A word that looks exactly like the text around it but opens /private when
 * clicked. Deliberately not an <a>: a real link would show its address at the
 * bottom of the browser on hover and get picked up by crawlers.
 */
export default function QuietWord({ children }: { children: React.ReactNode }) {
  return (
    <span onClick={() => { window.location.href = '/private'; }} style={{ cursor: 'inherit' }}>
      {children}
    </span>
  );
}
