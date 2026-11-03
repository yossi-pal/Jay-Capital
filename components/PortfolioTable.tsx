'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, pct, fmtDate, rateFraction, shortAddress } from '@/lib/format';

export interface LoanRow {
  loan_id: string;
  loan_number: string;
  borrower_name: string;
  property: string;
  loan_amount: number;
  acquisition: number;
  construction: number;
  annual_rate: number;
  closing_date: string;
  lender_name: string | null;
  lender_short_name?: string | null;
  total_disbursed: number;
  remaining_draw: number;
  accrued_interest: number;
  total_draw?: number;
  status: string;
  is_entity?: boolean | null;
  entity_name?: string | null;
}

export interface DueInfo { amount: number; date: string; deferred: boolean }

/** Dashboard view state, and the loan order the loan page pages through. */
export const VIEW_KEY = 'jcf:admin:portfolioView';
export const ORDER_KEY = 'jcf:admin:loanOrder';

type Row = LoanRow & {
  total_draw: number; late: number; due_amount: number; due_date: string;
  state: 'late' | 'active' | 'paid_off' | 'defaulted' | 'other';
  lender: string;
};
type SortKey = 'loan_number' | 'borrower_name' | 'state' | 'loan_amount' | 'total_disbursed'
  | 'annual_rate' | 'due_amount' | 'lender';

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'loan_number',     label: 'Loan' },
  { key: 'borrower_name',   label: 'Borrower & property' },
  { key: 'state',           label: 'Status' },
  { key: 'loan_amount',     label: 'Loan amount', num: true },
  { key: 'total_disbursed', label: 'Principal',   num: true },
  { key: 'annual_rate',     label: 'Rate',        num: true },
  { key: 'due_amount',      label: 'Amount due',  num: true },
  { key: 'lender',          label: 'Lender' },
];

const STATE_ORDER = { late: 0, active: 1, defaulted: 2, paid_off: 3, other: 4 };

const FILTERS: { value: string; label: string }[] = [
  { value: 'active',    label: 'Active' },
  { value: 'late',      label: 'Past due' },
  { value: 'paid_off',  label: 'Paid off' },
  { value: 'defaulted', label: 'Defaulted' },
  { value: '',          label: 'All loans' },
];

export default function PortfolioTable({
  loans, pastDue = {}, due = {},
}: {
  loans: LoanRow[]; canEdit?: boolean;
  pastDue?: Record<string, number>; due?: Record<string, DueInfo>;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [lender, setLender] = useState('');
  const [status, setStatus] = useState('active');
  const [sortKey, setSortKey] = useState<SortKey | null>('loan_number');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [restored, setRestored] = useState(false);

  // Restore the last search, filters and sort. Opening a loan and coming back
  // used to drop you on the defaults, so a filter had to be re-set every time.
  // Read after mount, never during render -- the server has no localStorage,
  // and reading it during render would not match the server-rendered markup.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.q === 'string') setQ(v.q);
        if (typeof v.lender === 'string') setLender(v.lender);
        if (typeof v.status === 'string') setStatus(v.status);
        if (v.sortKey === null || COLUMNS.some(c => c.key === v.sortKey)) setSortKey(v.sortKey);
        if (v.sortDir === 1 || v.sortDir === -1) setSortDir(v.sortDir);
      }
    } catch { /* corrupt or unavailable: defaults are fine */ }
    // A link such as the Today page's "Past due" box asks for one view
    // (?status=late). Honour it with a clean slate so nothing hides those
    // loans, then tidy the address bar.
    try {
      const want = new URLSearchParams(window.location.search).get('status');
      if (want !== null && FILTERS.some(f => f.value === want)) {
        setStatus(want); setQ(''); setLender('');
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch { /* ignore */ }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;   // don't overwrite saved state with the defaults
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify({ q, lender, status, sortKey, sortDir }));
    } catch { /* ignore */ }
  }, [restored, q, lender, status, sortKey, sortDir]);

  const rows: Row[] = useMemo(() => loans.map(l => {
    const late = pastDue[l.loan_id] ?? 0;
    const d = due[l.loan_id];
    const state: Row['state'] =
      l.status === 'active' ? (late > 0.005 ? 'late' : 'active')
        : l.status === 'paid_off' ? 'paid_off'
        : l.status === 'defaulted' ? 'defaulted' : 'other';
    return {
      ...l,
      total_draw: Number(l.total_disbursed || 0) - Number(l.acquisition || 0),
      late, state,
      due_amount: d ? d.amount : 0,
      due_date: d ? d.date : '',
      lender: l.lender_short_name || l.lender_name || '',
    };
  }), [loans, pastDue, due]);

  const lenders = useMemo(
    () => Array.from(new Set(loans.map(l => l.lender_name).filter(Boolean))).sort() as string[],
    [loans]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { '': rows.length, active: 0, late: 0, paid_off: 0, defaulted: 0 };
    for (const r of rows) {
      if (r.status === 'active') c.active++;
      if (r.state === 'late') c.late++;
      if (r.status === 'paid_off') c.paid_off++;
      if (r.status === 'defaulted') c.defaulted++;
    }
    return c;
  }, [rows]);

  const view = useMemo(() => {
    let out = rows.filter(l => {
      if (status === 'late') { if (l.state !== 'late') return false; }
      else if (status && l.status !== status) return false;
      if (lender && l.lender_name !== lender) return false;
      if (q) {
        const hay = [
          l.loan_number, l.borrower_name, l.entity_name, l.property, l.lender_name, l.lender_short_name,
          fmtDate(l.closing_date), l.loan_amount, l.acquisition, l.construction,
          (rateFraction(l.annual_rate) * 100).toFixed(2),
          l.total_disbursed, l.total_draw, l.remaining_draw, l.status,
        ].join(' ').toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });

    if (sortKey) {
      const col = COLUMNS.find(c => c.key === sortKey);
      out = [...out].sort((a, b) => {
        if (sortKey === 'state') return (STATE_ORDER[a.state] - STATE_ORDER[b.state]) * sortDir;
        const x = a[sortKey], y = b[sortKey];
        if (col?.num) return ((Number(x) || 0) - (Number(y) || 0)) * sortDir;
        return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * sortDir;
      });
    }
    return out;
  }, [rows, q, lender, status, sortKey, sortDir]);

  const totals = useMemo(() => {
    const capital = view.reduce((s, l) => s + Number(l.loan_amount || 0), 0);
    const principal = view.reduce((s, l) => s + Number(l.total_disbursed || 0), 0);
    const dueSum = view.reduce((s, l) => s + Number(l.due_amount || 0), 0);
    return { capital, principal, dueSum };
  }, [view]);

  // Publish the order actually on screen, so Prev/Next on a loan follows the
  // list the admin is looking at rather than some unrelated global order.
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(view.map(l => l.loan_id)));
    } catch { /* ignore */ }
  }, [restored, view]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  }

  function exportCSV() {
    const cols: { label: string; get: (l: Row) => any }[] = [
      { label: 'Loan ID', get: l => l.loan_number },
      { label: 'Borrower', get: l => l.borrower_name },
      { label: 'Entity', get: l => (l.is_entity ? l.entity_name : '') },
      { label: 'Property', get: l => l.property },
      { label: 'Status', get: l => statusLabel(l.state) },
      { label: 'Loan Amount', get: l => l.loan_amount },
      { label: 'Acquisition', get: l => l.acquisition },
      { label: 'Construction', get: l => l.construction },
      { label: 'Interest Rate', get: l => (rateFraction(l.annual_rate) * 100).toFixed(2) + '%' },
      { label: 'Closing Date', get: l => fmtDate(l.closing_date) },
      { label: 'Lender', get: l => l.lender_name },
      { label: 'Total Disbursed', get: l => l.total_disbursed },
      { label: 'Total Draw', get: l => l.total_draw },
      { label: 'Remaining Draw', get: l => l.remaining_draw },
      { label: 'Amount Due', get: l => (l.due_date ? l.due_amount.toFixed(2) : '') },
      { label: 'Due Date', get: l => (l.due_date ? fmtDate(l.due_date) : '') },
      { label: 'Past Due', get: l => (l.late > 0.005 ? l.late.toFixed(2) : '') },
    ];
    const lines = [cols.map(c => c.label).join(',')];
    view.forEach(l => {
      lines.push(cols.map(c => {
        const v = String(c.get(l) ?? '');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jay_capital_portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filtered = q || lender || status !== 'active';

  return (
    <>
      <div className="chips" role="group" aria-label="Show loans">
        {FILTERS.map(f => (
          <button key={f.value || 'all'} type="button"
            className={`fchip${status === f.value ? ' on' : ''}${f.value === 'late' && counts.late ? ' alarm' : ''}`}
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}>
            {f.label} <span className="n">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="toolbar" style={{ padding: '16px 18px 0', marginBottom: 14 }}>
          <input
            className="search"
            placeholder="Search borrower, property, lender, loan #…"
            aria-label="Search loans"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select className="filter" aria-label="Lender" value={lender} onChange={e => setLender(e.target.value)}>
            <option value="">All lenders</option>
            {lenders.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {filtered && (
            <button className="btn secondary"
              onClick={() => { setQ(''); setLender(''); setStatus('active'); }}>
              Reset
            </button>
          )}
          <button className="btn secondary" onClick={exportCSV}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            Export
          </button>
        </div>

        <div className="list-sum">
          <span><b>{view.length}</b> {view.length === 1 ? 'loan' : 'loans'}</span>
          <span><b>{money(totals.capital)}</b> committed</span>
          <span><b>{money(totals.principal)}</b> principal out</span>
          <span><b>{money(totals.dueSum)}</b> due on current statements</span>
        </div>

        <div className="tablescroll loanlist">
          <table>
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th
                    key={c.key}
                    data-key={c.key}
                    className={[c.num ? 'num' : '', sortKey === c.key ? (sortDir === 1 ? 'sort-asc' : 'sort-desc') : ''].join(' ').trim()}
                    onClick={() => toggleSort(c.key)}
                    aria-sort={sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map(l => (
                <tr key={l.loan_id} className="clickable"
                  onClick={() => router.push(`/admin/loans/${l.loan_id}`)}>
                  <td className="ln">{l.loan_number}</td>
                  <td>
                    <Link href={`/admin/loans/${l.loan_id}`} className="who" onClick={e => e.stopPropagation()}>
                      <b>{l.is_entity && l.entity_name ? l.entity_name : l.borrower_name}</b>
                      <span>{l.is_entity && l.entity_name ? `${l.borrower_name} · ` : ''}{shortAddress(l.property)}</span>
                    </Link>
                  </td>
                  <td><StatusChip state={l.state} late={l.late} /></td>
                  <td className="num">{money(l.loan_amount)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(l.total_disbursed)}</td>
                  <td className="num">{pct(l.annual_rate)}</td>
                  <td className="num">
                    {l.due_date ? money(l.due_amount) : <span className="muted">—</span>}
                    {l.late > 0.005 && <span className="sub-late">{money(l.late)} past due</span>}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{l.lender}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 16 }}>No loans match</div>
            <div className="muted" style={{ marginTop: 4 }}>Try a different search, or press Reset.</div>
          </div>
        )}
      </div>
    </>
  );
}

function statusLabel(s: Row['state']) {
  return s === 'late' ? 'Past due' : s === 'active' ? 'Current' : s === 'paid_off' ? 'Paid off'
    : s === 'defaulted' ? 'Defaulted' : 'Other';
}

/** Status as a coloured label. A late active loan says so in red. */
function StatusChip({ state, late }: { state: Row['state']; late: number }) {
  if (state === 'late') return <span className="chip late" title={`${money(late)} past due`}>Past due</span>;
  if (state === 'active') return <span className="chip ok">Current</span>;
  if (state === 'defaulted') return <span className="chip late">Defaulted</span>;
  return <span className="chip">{statusLabel(state)}</span>;
}
