'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  activeProvider, fetchSuggestions, formatAddress, providerCredit,
  type AddressValue, type Suggestion,
} from '@/lib/address-providers';

export { formatAddress, type AddressValue };

export const EMPTY_ADDRESS: AddressValue = { street: '', city: '', state: '', zip: '' };

export const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
  'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

/**
 * Street / City / State / ZIP, with suggestions on the street line that fill
 * the other three.
 *
 * Split rather than one free-text line so the parts arrive clean and can be
 * checked. Picking a suggestion populates all four; typing works throughout,
 * so a property the geocoder has never heard of is still enterable.
 *
 * Providers, chosen automatically:
 *   1. GOOGLE PLACES if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Best US
 *      house-number coverage, needs a billing account.
 *   2. PHOTON otherwise -- free, keyless, OpenStreetMap. No account at all.
 */

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

function fromPhoton(p: Record<string, any>): Suggestion | null {
  const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim();
  if (!street) return null;
  const value: AddressValue = {
    street,
    city: p.city || p.town || p.village || p.county || '',
    state: p.state ? stateCode(p.state) : '',
    zip: p.postcode || '',
  };
  return { label: formatAddress(value), value };
}

/** Photon returns full state names; the form wants the two-letter code. */
function stateCode(name: string): string {
  const n = name.trim();
  if (/^[A-Z]{2}$/.test(n)) return n;
  const map: Record<string, string> = {
    'new york': 'NY', 'new jersey': 'NJ', 'connecticut': 'CT', 'pennsylvania': 'PA',
    'florida': 'FL', 'california': 'CA', 'texas': 'TX', 'massachusetts': 'MA',
    'maryland': 'MD', 'virginia': 'VA', 'ohio': 'OH', 'illinois': 'IL',
    'north carolina': 'NC', 'south carolina': 'SC', 'georgia': 'GA', 'michigan': 'MI',
    'arizona': 'AZ', 'nevada': 'NV', 'colorado': 'CO', 'washington': 'WA',
  };
  return map[n.toLowerCase()] ?? '';
}

export default function AddressFields({
  legend, value, onChange, required,
}: {
  legend: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  required?: boolean;
}) {
  const streetRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const justChose = useRef(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const listId = useId();

  const provider = activeProvider();
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const usingGoogle = provider === 'google' && !!key;

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  // ---- Google
  useEffect(() => {
    if (!usingGoogle || !streetRef.current) return;
    let widget: any;
    let cancelled = false;

    loadGoogle(key!)
      .then(() => {
        if (cancelled || !streetRef.current) return;
        const g = (window as any).google;
        widget = new g.maps.places.Autocomplete(streetRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          // Only the components we actually use. Requesting more fields moves
          // the Place Details call into a dearer SKU for no benefit here.
          fields: ['address_components'],
        });
        widget.addListener('place_changed', () => {
          const parts: any[] = widget.getPlace()?.address_components ?? [];
          const get = (t: string, short = false) => {
            const c = parts.find(p => p.types.includes(t));
            return c ? (short ? c.short_name : c.long_name) : '';
          };
          const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
          if (!street) return;
          onChange({
            street,
            city: get('locality') || get('sublocality') || get('administrative_area_level_2'),
            state: get('administrative_area_level_1', true),
            zip: get('postal_code'),
          });
        });
      })
      .catch(() => { /* plain inputs remain */ });

    return () => {
      cancelled = true;
      if (widget && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(widget);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingGoogle]);

  // ---- keyless / token providers (Radar, Mapbox, Photon)
  useEffect(() => {
    if (usingGoogle) return;
    // Picking a suggestion sets the value; that must not start a new search.
    if (justChose.current) { justChose.current = false; return; }

    const street = value.street.trim();
    if (street.length < 3) { setItems([]); setOpen(false); setSearched(false); return; }

    const controller = new AbortController();
    // 160ms: long enough to skip a keystroke, short enough that the list is
    // arriving while you are still typing.
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        // Fold in city and state once known -- "73 West Church Street" alone
        // competes with every street of that name in the country.
        const q = [street, value.city, value.state].filter(Boolean).join(', ');
        const out = await fetchSuggestions(provider, q, controller.signal);
        setItems(out);
        setOpen(true);
        setSearched(true);
        setActive(-1);
      } catch {
        // Aborted, offline, rate-limited: the field still works as plain text.
        setItems([]); setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 160);

    return () => { window.clearTimeout(t); controller.abort(); setLoading(false); };
  }, [value.street, value.city, value.state, usingGoogle, provider]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(s: Suggestion) {
    justChose.current = true;
    onChange(s.value);
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
    <fieldset className="lp-fieldset">
      <legend className="lp-legend">{legend}</legend>

      <div ref={boxRef} className="lp-field" style={{ position: 'relative' }}>
        <span>Street</span>
        <input
          ref={streetRef}
          value={value.street}
          onChange={e => set({ street: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder="Start typing…"
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
            {items.map((s, i) => (
              <li key={s.label} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => choose(s)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                    background: i === active ? 'var(--pale)' : 'transparent',
                    padding: '9px 11px', borderRadius: 6, cursor: 'pointer',
                    font: 'inherit', fontSize: 14, color: 'var(--ink)',
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))}

            {items.length === 0 && searched && !loading && (
              <li style={{ padding: '10px 11px', fontSize: 13, color: 'var(--muted)' }}>
                No match found — just type the address in yourself.
              </li>
            )}

            <li style={{ padding: '6px 11px 4px', fontSize: 11, color: 'var(--muted)' }}>
              {loading ? 'Searching…' : providerCredit(provider)}
            </li>
          </ul>
        )}
      </div>

      <div className="lp-addr-grid">
        <label className="lp-field">
          <span>City</span>
          <input value={value.city} onChange={e => set({ city: e.target.value })}
            required={required} autoComplete="off" />
        </label>
        <label className="lp-field">
          <span>State</span>
          <select value={value.state} onChange={e => set({ state: e.target.value })} required={required}>
            <option value="">—</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
        <label className="lp-field">
          <span>ZIP</span>
          <input value={value.zip} inputMode="numeric" maxLength={10}
            onChange={e => set({ zip: e.target.value.replace(/[^\d-]/g, '').slice(0, 10) })}
            required={required} autoComplete="off" />
        </label>
      </div>
    </fieldset>
  );
}
