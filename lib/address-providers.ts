/**
 * Address suggestion providers.
 *
 * Kept separate from the field so the provider can be swapped with an
 * environment variable rather than a code change. All of these are used from
 * the browser with a PUBLISHABLE key, which is what each vendor intends --
 * restrict the key to the site's domain in their dashboard.
 *
 * Chosen automatically from whichever key is present, or forced with
 * NEXT_PUBLIC_ADDRESS_PROVIDER.
 */

export interface AddressValue { street: string; city: string; state: string; zip: string }
export interface Suggestion { label: string; value: AddressValue }

export type ProviderName = 'radar' | 'mapbox' | 'google' | 'photon';

export function formatAddress(a: AddressValue): string {
  const tail = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.street, tail].filter(Boolean).join(', ');
}

const RADAR_KEY = process.env.NEXT_PUBLIC_RADAR_KEY;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Which provider is in play. Explicit setting wins, else first key found. */
export function activeProvider(): ProviderName {
  const forced = (process.env.NEXT_PUBLIC_ADDRESS_PROVIDER || '').toLowerCase();
  if (forced === 'radar' || forced === 'mapbox' || forced === 'google' || forced === 'photon') {
    return forced;
  }
  if (RADAR_KEY) return 'radar';
  if (MAPBOX_TOKEN) return 'mapbox';
  if (GOOGLE_KEY) return 'google';
  return 'photon';
}

export function providerCredit(p: ProviderName): string {
  return p === 'radar' ? 'Suggestions from Radar'
    : p === 'mapbox' ? 'Suggestions from Mapbox'
    : p === 'photon' ? 'Suggestions from OpenStreetMap'
    : '';
}

const US_STATES: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
  'connecticut':'CT','delaware':'DE','district of columbia':'DC','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
};

export function stateCode(name: string): string {
  const n = String(name ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  return US_STATES[n.toLowerCase()] ?? '';
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of list) {
    if (!s.value.street || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push(s);
  }
  return out;
}

/** Radar: US address coverage is its selling point, and the shape is flat. */
async function radar(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = 'https://api.radar.io/v1/search/autocomplete'
    + `?query=${encodeURIComponent(query)}&countryCode=US&layers=address&limit=8`;
  const res = await fetch(url, { signal, headers: { Authorization: RADAR_KEY! } });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();

  return dedupe((data?.addresses ?? []).map((a: any) => {
    const street = [a.number, a.street].filter(Boolean).join(' ').trim()
      || String(a.addressLabel ?? '').trim();
    const value: AddressValue = {
      street,
      city: a.city || a.borough || a.county || '',
      state: stateCode(a.stateCode || a.state || ''),
      zip: a.postalCode || '',
    };
    return { label: formatAddress(value), value };
  }));
}

/** Mapbox Geocoding v6. Parts live in properties.context. */
async function mapbox(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = 'https://api.mapbox.com/search/geocode/v6/forward'
    + `?q=${encodeURIComponent(query)}&country=us&types=address&autocomplete=true&limit=8`
    + `&access_token=${encodeURIComponent(MAPBOX_TOKEN!)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();

  return dedupe((data?.features ?? []).map((f: any) => {
    const p = f?.properties ?? {};
    const ctx = p.context ?? {};
    const street = [p.address_number ?? ctx.address?.address_number, ctx.street?.name ?? p.name]
      .filter(Boolean).join(' ').trim();
    const value: AddressValue = {
      street: street || String(p.name ?? '').trim(),
      city: ctx.place?.name || ctx.locality?.name || ctx.district?.name || '',
      state: stateCode(ctx.region?.region_code || ctx.region?.name || ''),
      zip: ctx.postcode?.name || '',
    };
    return { label: formatAddress(value), value };
  }));
}

/** Photon: free and keyless, but OSM house-number coverage is uneven. */
async function photon(query: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}`
    + '&limit=8&lang=en&layer=house&layer=street';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();

  return dedupe((data?.features ?? [])
    .filter((f: any) => !f?.properties?.countrycode || f.properties.countrycode === 'US')
    .map((f: any) => {
      const p = f.properties ?? {};
      const value: AddressValue = {
        street: [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim(),
        city: p.city || p.town || p.village || p.county || '',
        state: stateCode(p.state || ''),
        zip: p.postcode || '',
      };
      return { label: formatAddress(value), value };
    }));
}

/**
 * Suggestions for a partial address. Never throws for an aborted request --
 * the caller aborts on every keystroke.
 */
export async function fetchSuggestions(
  provider: ProviderName, query: string, signal: AbortSignal,
): Promise<Suggestion[]> {
  if (provider === 'radar' && RADAR_KEY) return radar(query, signal);
  if (provider === 'mapbox' && MAPBOX_TOKEN) return mapbox(query, signal);
  if (provider === 'photon') return photon(query, signal);
  // 'google' is handled by its own widget; anything unconfigured falls back.
  return photon(query, signal);
}
