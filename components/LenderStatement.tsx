'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveLenderStatement } from '@/lib/actions';
import { lenderFigures, type Reserve } from '@/lib/lender-statement';
import { money, pct, fmtDate, fmtDateTime } from '@/lib/format';

interface Statement {
  lender_points_pct: number | string;
  reserves: Reserve[] | null;
  notes: string | null;
  updated_at: string;
}

const line: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--navy-soft)' };
const sub: React.CSSProperties = { ...line, paddingLeft: 18, color: 'var(--muted)', fontSize: 14 };

export default function LenderStatement({ loan, statement, canEdit }: {
  loan: any; statement: Statement | null; canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!statement && canEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [points, setPoints] = useState(statement ? String(Number(statement.lender_points_pct)) : '');
  const [reserves, setReserves] = useState<{ label: string; amount: string }[]>(
    (statement?.reserves ?? []).map(r => ({ label: r.label, amount: String(r.amount) })),
  );
  const [notes, setNotes] = useState(statement?.notes ?? '');

  // On screen the figures follow what is typed; once saved they come from the stored row.
  const fig = lenderFigures({
    loan_amount: loan.loan_amount,
    acquisition: loan.acquisition,
    construction: loan.construction,
    annual_rate: loan.annual_rate,
    closing_date: loan.closing_date,
    lender_points_pct: editing ? points : statement?.lender_points_pct ?? 0,
    reserves: editing
      ? reserves.map(r => ({ label: r.label.trim(), amount: Number(r.amount) || 0 })).filter(r => r.label || r.amount)
      : statement?.reserves ?? [],
  });

  function cancel() {
    setPoints(statement ? String(Number(statement.lender_points_pct)) : '');
    setReserves((statement?.reserves ?? []).map(r => ({ label: r.label, amount: String(r.amount) })));
    setNotes(statement?.notes ?? '');
    setError('');
    if (statement) setEditing(false); else router.push(`/admin/loans/${loan.loan_id}`);
  }

  async function save() {
    setBusy(true); setError('');
    const res = await saveLenderStatement(loan.loan_id, {
      lenderPointsPct: Number(points) || 0,
      reserves: reserves.map(r => ({ label: r.label, amount: Number(r.amount) || 0 })),
      notes,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not save the lender statement.'); return; }
    setEditing(false);
    router.refresh();
  }

  const borrower = loan.is_entity && loan.entity_name ? `${loan.entity_name} (${loan.borrower_name})` : loan.borrower_name;

  return (
    <div className="wrap">
      <p className="no-print" style={{ marginBottom: 12 }}>
        <Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to loan</Link>
      </p>
      <div className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="title" style={{ margin: 0 }}>Lender Statement</h1>
            <div className="muted">{loan.loan_number} &middot; Internal: not shown to the borrower</div>
          </div>
          {statement && !editing && (
            <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>}
              <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
            </div>
          )}
        </div>
        <div className="rule" />

        <div className="summary">
          <div className="row"><span className="k">Borrower</span><span className="v">{borrower}</span></div>
          <div className="row"><span className="k">Lender</span><span className="v">{loan.lender_name ?? ''}</span></div>
          <div className="row" style={{ gridColumn: '1 / -1' }}><span className="k">Property</span><span className="v" style={{ textAlign: 'right' }}>{loan.property}</span></div>
          <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(loan.closing_date)}</span></div>
          <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
        </div>

        {!statement && !canEdit && (
          <div className="alert info">No lender statement has been created for this loan yet. An admin can create one.</div>
        )}

        {editing && (
          <div className="no-print" style={{ background: 'var(--pale)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            {error && <div className="alert error">{error}</div>}
            <div className="form-grid">
              <div className="field-wrap">
                <label>Points to Lender (%)</label>
                <input className="field" type="number" step="0.001" min="0" max="100" inputMode="decimal"
                  value={points} onChange={e => setPoints(e.target.value)} placeholder="2" />
                <span className="muted" style={{ fontSize: 12 }}>Charged on the acquisition ({money(fig.acquisition)}) only.</span>
              </div>
            </div>

            <div className="field-wrap" style={{ marginTop: 16 }}>
              <label>Construction Reserves</label>
              {reserves.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input className="field" style={{ flex: '2 1 200px', width: 'auto' }} placeholder="Description"
                    value={r.label} onChange={e => setReserves(rs => rs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <input className="field" style={{ flex: '1 1 120px', width: 'auto' }} type="number" step="0.01" min="0" inputMode="decimal" placeholder="Amount"
                    value={r.amount} onChange={e => setReserves(rs => rs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <button type="button" className="btn secondary" onClick={() => setReserves(rs => rs.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <div>
                <button type="button" className="btn secondary" onClick={() => setReserves(rs => [...rs, { label: '', amount: '' }])}>
                  + Add construction reserve
                </button>
              </div>
            </div>

            <div className="field-wrap" style={{ marginTop: 16 }}>
              <label>Notes</label>
              <textarea className="field" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        {(statement || editing) && (
          <div>
            <div style={{ ...line, fontWeight: 700, color: 'var(--navy)' }}><span>Total Loan Amount</span><span>{money(fig.loanAmount)}</span></div>
            <div style={sub}><span>Acquisition</span><span>{money(fig.acquisition)}</span></div>
            <div style={sub}><span>Construction</span><span>{money(fig.construction)}</span></div>
            <div style={line}><span>Less: Construction Holdback</span><span>({money(fig.construction)})</span></div>
            <div style={line}>
              <span>Less: Points to Lender ({fig.pointsPct}% of acquisition)</span>
              <span>({money(fig.points)})</span>
            </div>
            {fig.reserves.map((r, i) => (
              <div key={i} style={line}><span>Less: Construction Reserve{r.label ? ` · ${r.label}` : ''}</span><span>({money(r.amount)})</span></div>
            ))}
            <div style={line}>
              <span>
                Less: Daily Interest ({fig.interestDays} day{fig.interestDays === 1 ? '' : 's'} on acquisition, {fmtDate(loan.closing_date)} – {fmtDate(fig.interestThrough)})
              </span>
              <span>({money(fig.dailyInterest)})</span>
            </div>
            <div style={{ ...line, borderBottom: 'none', background: 'var(--pale)', borderRadius: 6, padding: '12px', marginTop: 8, fontWeight: 800, fontSize: 17, color: fig.netWire < 0 ? 'var(--danger)' : 'var(--navy)' }}>
              <span>Net Wire</span><span>{money(fig.netWire)}</span>
            </div>
            {!editing && statement?.notes && (
              <p style={{ whiteSpace: 'pre-wrap', marginTop: 16 }}><b>Notes:</b> {statement.notes}</p>
            )}
            {!editing && statement && (
              <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Last updated {fmtDateTime(statement.updated_at)}</p>
            )}
          </div>
        )}

        {editing && (
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={cancel}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? 'Saving...' : statement ? 'Save changes' : 'Create Lender Statement'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
