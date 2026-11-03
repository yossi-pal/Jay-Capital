'use client';

export interface AddressValue { street: string; city: string; state: string; zip: string }

export const EMPTY_ADDRESS: AddressValue = { street: '', city: '', state: '', zip: '' };

export const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
  'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export function formatAddress(a: AddressValue): string {
  const tail = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.street, tail].filter(Boolean).join(', ');
}

/**
 * Street / City / State / ZIP as plain fields.
 *
 * There used to be type-ahead address suggestions here; the free provider
 * often missed or mangled US house numbers, so it was removed. The fields
 * carry standard autocomplete hints instead, so the browser's own saved
 * addresses can still fill them in one tap. `section` keeps two address
 * blocks on the same form from being filled with the same saved address.
 */
export default function AddressFields({
  legend, value, onChange, required, section,
}: {
  legend: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  required?: boolean;
  section?: string;
}) {
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const ac = (token: string) => (section ? `section-${section} ${token}` : token);

  return (
    <fieldset className="lp-fieldset">
      <legend className="lp-legend">{legend}</legend>

      <label className="lp-field">
        <span>Street</span>
        <input
          value={value.street}
          onChange={e => set({ street: e.target.value })}
          placeholder="123 Main Street"
          required={required}
          autoComplete={ac('address-line1')}
        />
      </label>

      <div className="lp-addr-grid">
        <label className="lp-field">
          <span>City</span>
          <input value={value.city} onChange={e => set({ city: e.target.value })}
            required={required} autoComplete={ac('address-level2')} />
        </label>
        <label className="lp-field">
          <span>State</span>
          <select value={value.state} onChange={e => set({ state: e.target.value })}
            required={required} autoComplete={ac('address-level1')}>
            <option value="">—</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
        <label className="lp-field">
          <span>ZIP</span>
          <input value={value.zip} inputMode="numeric" maxLength={10}
            onChange={e => set({ zip: e.target.value.replace(/[^\d-]/g, '').slice(0, 10) })}
            required={required} autoComplete={ac('postal-code')} />
        </label>
      </div>
    </fieldset>
  );
}
