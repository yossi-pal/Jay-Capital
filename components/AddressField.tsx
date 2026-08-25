'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Address field with suggestions.
 *
 * Two providers, chosen automatically:
 *
 *  1. GOOGLE PLACES, if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Best US
 *     coverage, but it needs a billing account.
 *  2. PHOTON, otherwise. A free, keyless geocoder over OpenStreetMap data,
 *     built for type-ahead. No account, no billing, no card on file.
 *
 * Either way the field is a plain text input underneath, so a failed lookup,
 * a rate limit or a missing key costs the applicant suggestions -- never the
 * ability to type their address and submit.
 *
 * Photon's public instance asks for reasonable use, hence the 350ms debounce,
 * a 3-character minimum, and one in-flight request at a time.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

let googleScript: Promise<void> | null = null;

function loadGoogle(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return googleScript;
}

/** Build a one-line address from Photon's OSM properties. */
function photonLabel(p: Record<string, any>): string {
  const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
  const city = p.city || p.town || p.village || p.county;
  const tail = [city, p.state, p.postcode].filter(Boolean).join(', ');
  return [street, tail].filter(Boolean).join(', ');
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const justChose = useRef(false);
  const listId = useId();

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const usingGoogle = !!key;

  // --- Google path
  useEffect(() => {
    if (!usingGoogle || !inputRef.current) return;
    let widget: any;
    let cancelled = false;

    loadGoogle(key!)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const g = (window as any).google;
        widget = new g.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['formatted_address'],
        });
        widget.addListener('place_changed', () => {
          const place = widget.getPlace();
          if (place?.formatted_address) onChange(place.formatted_address);
        });
      })
      .catch(() => { /* plain input remains */ });

    return () => {
      cancelled = true;
      if (widget && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(widget);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingGoogle]);

  // --- Photon path
  useEffect(() => {
    if (usingGoogle) return;
    // Picking a suggestion sets the value; that must not trigger a new search.
    if (justChose.current) { justChose.current = false; return; }

    const q = value.trim();
    if (q.length < 3) { setItems([]); setOpen(false); return; }

    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=6&lang=en`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();

        const seen = new Set<string>();
        const labels: string[] = [];
        for (const f of data?.features ?? []) {
          const p = f?.properties ?? {};
          // OSM is worldwide; this form is US lending.
          if (p.countrycode && p.countrycode !== 'US') continue;
          const label = photonLabel(p);
          if (label && !seen.has(label)) { seen.add(label); labels.push(label); }
        }
        setItems(labels);
        setOpen(labels.length > 0);
        setActive(-1);
      } catch {
        // Offline, rate-limited or an unexpected shape: the field still works.
        setItems([]); setOpen(false);
      }
    }, 350);

    return () => { window.clearTimeout(t); controller.abort(); };
  }, [value, usingGoogle]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(v: string) {
    justChose.current = true;
    onChange(v);
    setOpen(false);
    setItems([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        id={id}
        ref={inputRef}
        className="field"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={e => e.currentTarget.setAttribute('autocomplete', 'new-password')}
      />

      {!usingGoogle && open && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
            margin: 0, padding: 4, listStyle: 'none', background: '#fff',
            border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 10px 28px rgba(4,22,42,.16)', maxHeight: 260, overflowY: 'auto',
          }}
        >
          {items.map((it, i) => (
            <li key={it} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(it)}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none',
                  background: i === active ? 'var(--pale)' : 'transparent',
                  padding: '9px 11px', borderRadius: 6, cursor: 'pointer',
                  font: 'inherit', fontSize: 14, color: 'var(--ink)',
                }}
              >
                {it}
              </button>
            </li>
          ))}
          <li style={{ padding: '6px 11px 4px', fontSize: 11, color: 'var(--muted)' }}>
            Suggestions from OpenStreetMap
          </li>
        </ul>
      )}
    </div>
  );
}
