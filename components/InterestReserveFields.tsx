'use client';

import { useState } from 'react';
import { money } from '@/lib/format';

/**
 * Interest reserve on the new and edit loan forms: how many months were
 * collected at closing, and how much each month covers. The monthly amount
 * starts as the interest on the acquisition amount (what is usual) and can be
 * changed for a loan that was set up differently.
 */
export default function InterestReserveFields({
  acquisition, ratePct, defaultMonths, defaultMonthly,
}: {
  acquisition: number;
  ratePct: number;              // 12 = 12%
  defaultMonths?: number | null;
  defaultMonthly?: number | null;
}) {
  const suggested = Math.round((acquisition || 0) * ((ratePct || 0) / 100 / 12) * 100) / 100;
  const [months, setMonths] = useState(String(Number(defaultMonths) || 0));
  const [monthly, setMonthly] = useState(Number(defaultMonthly) > 0 ? String(defaultMonthly) : '');
  const n = Math.max(0, Math.floor(Number(months) || 0));
  const each = Number(monthly) || 0;

  return (
    <>
      <div className="field-wrap">
        <label>Interest Reserve (months)</label>
        <input
          className="field" type="number" min={0} max={60} step={1} name="interest_reserve_months"
          value={months}
          onChange={e => {
            setMonths(e.target.value);
            // First time a reserve is set, start from the usual monthly amount.
            if (Number(e.target.value) > 0 && !monthly && suggested > 0) setMonthly(suggested.toFixed(2));
          }}
        />
        <span className="muted hint">Months of interest collected at closing. 0 = none.</span>
      </div>
      <div className="field-wrap">
        <label>Reserve per Month</label>
        <input
          className="field" type="number" min={0} step="0.01" name="interest_reserve_monthly"
          value={n > 0 ? monthly : ''} disabled={n === 0}
          onChange={e => setMonthly(e.target.value)}
          placeholder={suggested > 0 ? suggested.toFixed(2) : '0.00'}
          style={n === 0 ? { background: 'var(--pale)' } : undefined}
        />
        <span className="muted hint">
          {n > 0
            ? <>Total reserve {money(n * each)}.{' '}
                {suggested > 0 && Math.abs(each - suggested) > 0.005 && (
                  <button type="button" className="linklike" onClick={() => setMonthly(suggested.toFixed(2))}
                    style={{ background: 'none', border: 0, padding: 0, color: 'var(--navy)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                    Use {money(suggested)} (interest on acquisition)
                  </button>
                )}</>
            : 'Usually the monthly interest on the acquisition amount.'}
        </span>
      </div>
    </>
  );
}
