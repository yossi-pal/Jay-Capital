'use client';

import { useState } from 'react';
import { money } from '@/lib/format';
import { reserveShares } from '@/lib/ledger';

/**
 * Interest reserve on the new and edit loan forms: how many months of
 * interest were collected at closing, and the total actually collected.
 *
 * The total starts as that many months of interest on the total loan amount
 * and follows the months and figures above it until it is typed over. It is
 * split evenly across the months, any leftover cent on the last, so the
 * months always add back up to exactly what was collected.
 */
export default function InterestReserveFields({
  loanAmount, acquisition, ratePct, defaultMonths, defaultTotal,
}: {
  loanAmount: number;
  acquisition: number;
  ratePct: number;              // 12 = 12%
  defaultMonths?: number | null;
  defaultTotal?: number | null;
}) {
  const [months, setMonths] = useState(String(Number(defaultMonths) || 0));
  // Saved figures are kept as they are; a new reserve follows the suggestion.
  const [typed, setTyped] = useState<string | null>(Number(defaultTotal) > 0 ? String(defaultTotal) : null);

  const n = Math.max(0, Math.floor(Number(months) || 0));
  const monthlyOn = (base: number) => (base || 0) * ((ratePct || 0) / 100 / 12);
  const round = (v: number) => Math.round(v * 100) / 100;
  const onLoan = round(monthlyOn(loanAmount) * n);
  const onAcquisition = round(monthlyOn(acquisition) * n);
  const total = typed ?? (n > 0 && onLoan > 0 ? onLoan.toFixed(2) : '');
  const shares = reserveShares(Number(total) || 0, n);

  const linkStyle = {
    background: 'none', border: 0, padding: 0, color: 'var(--navy)',
    textDecoration: 'underline', cursor: 'pointer', font: 'inherit',
  } as const;

  return (
    <>
      <div className="field-wrap">
        <label>Interest Reserve (months)</label>
        <input
          className="field" type="number" min={0} max={60} step={1} name="interest_reserve_months"
          value={months} onChange={e => setMonths(e.target.value)}
        />
        <span className="muted hint">Months of interest collected at closing. Leave at 0 if none was collected.</span>
      </div>
      <div className="field-wrap">
        <label>Total Reserve Collected</label>
        <input
          className="field" type="number" min={0} step="0.01" name="interest_reserve_total"
          value={n > 0 ? total : ''} disabled={n === 0}
          onChange={e => setTyped(e.target.value)}
          placeholder="0.00"
          style={n === 0 ? { background: 'var(--pale)' } : undefined}
        />
        <span className="muted hint">
          {n === 0 ? 'The amount actually collected at closing.' : <>
            {shares.length <= 6
              ? <>Applied {shares.map(s => money(s)).join(' + ')}.</>
              : <>About {money(shares[0] ?? 0)} a month.</>}{' '}
            {onLoan > 0 && Math.abs((Number(total) || 0) - onLoan) > 0.005 && (
              <button type="button" style={linkStyle} onClick={() => setTyped(onLoan.toFixed(2))}>
                Use {money(onLoan)} (total loan)
              </button>
            )}
            {onAcquisition > 0 && Math.abs(onAcquisition - onLoan) > 0.005 && Math.abs((Number(total) || 0) - onAcquisition) > 0.005 && (
              <>{' '}<button type="button" style={linkStyle} onClick={() => setTyped(onAcquisition.toFixed(2))}>
                Use {money(onAcquisition)} (acquisition only)
              </button></>
            )}
          </>}
        </span>
      </div>
    </>
  );
}
