'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Address field backed by Google Places Autocomplete.
 *
 * Degrades to a plain text input when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not
 * set, or if the script fails to load. An application form that silently
 * breaks because a key is missing would be far worse than one without
 * suggestions, so the field always works and only the suggestions are
 * conditional.
 *
 * Uses the classic Autocomplete widget, which needs no billing-heavy session
 * handling and works from a single script tag.
 */

let scriptPromise: Promise<void> | null = null;

function loadPlaces(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function AddressField({
  id, value, onChange, placeholder, required,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!key || !ref.current) return;
    let widget: any;
    let cancelled = false;

    loadPlaces(key)
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        widget = new g.maps.places.Autocomplete(ref.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['formatted_address'],
        });
        widget.addListener('place_changed', () => {
          const place = widget.getPlace();
          if (place?.formatted_address) onChange(place.formatted_address);
        });
        setReady(true);
      })
      .catch(() => setReady(false));

    return () => {
      cancelled = true;
      if (widget && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(widget);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      <input
        id={id}
        ref={ref}
        className="field"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        // Chrome's own autofill dropdown fights the Places one
        onFocus={e => e.currentTarget.setAttribute('autocomplete', 'new-password')}
      />
      {key && !ready && (
        <span className="muted" style={{ fontSize: 11.5 }}>Type the full address.</span>
      )}
    </>
  );
}
