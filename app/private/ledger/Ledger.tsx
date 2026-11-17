'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { todayInAppTz } from '@/lib/format';
import type { LedgerAccount, LedgerEntry } from '@/lib/personal-ledger';
import { Icon, PvModal } from '../ui';
import {
  addEntryAction, createAccountAction, deleteAccountAction, deleteEntryAction,
  setClearedAction, updateAccountAction, updateEntryAction,
} from './actions';

type Draft = { entry_date: string; type: string; description: string; withdrawal: string; deposit: string; cleared: boolean };
type Row = LedgerEntry & { total: number };

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n: number | null | undefined) => (n == null ? '' : usd.format(n));
/** Whole cents, so long registers never drift by a penny. */
const c = (n: number | null | undefined) => Math.round((n ?? 0) * 100);

function todayIso(): string {
  const d = todayInAppTz();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** 2026-11-08 -> 11/8/2026, like the spreadsheet. */
function showDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
const blankDraft = (): Draft => ({ entry_date: todayIso(), type: '', description: '', withdrawal: '', deposit: '', cleared: false });
const amountText = (n: number | null) => (n == null ? '' : n.toFixed(2));

export function Ledger({ accounts, entries }: { accounts: LedgerAccount[]; entries: LedgerEntry[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [month, setMonth] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [entryDlg, setEntryDlg] = useState<{ id?: string; draft: Draft; error?: string } | null>(null);
  const [acctDlg, setAcctDlg] = useState<{ id?: string; name: string; opening: string; error?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null);
  const [quick, setQuick] = useState<Draft>(blankDraft);
  const [quickErr, setQuickErr] = useState('');
  const [clearedOverride, setClearedOverride] = useState<Record<string, boolean>>({});
  const quickDesc = useRef<HTMLInputElement>(null);

  // Keep a valid account selected when accounts change.
  useEffect(() => {
    if (!accounts.some(a => a.id === accountId)) setAccountId(accounts[0]?.id ?? null);
  }, [accounts, accountId]);
  // Fresh data from the server replaces any ✓ clicks still in flight.
  useEffect(() => { setClearedOverride({}); }, [entries]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.err ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const account = accounts.find(a => a.id === accountId) ?? null;

  // Running total over the whole account, oldest first, like the sheet.
  const rows: Row[] = useMemo(() => {
    if (!account) return [];
    let bal = c(account.opening_balance);
    return entries
      .filter(e => e.account_id === account.id)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.seq - b.seq)
      .map(e => {
        bal += c(e.deposit) - c(e.withdrawal);
        return { ...e, cleared: clearedOverride[e.id] ?? e.cleared, total: bal / 100 };
      });
  }, [entries, account, clearedOverride]);

  const months = useMemo(() => Array.from(new Set(rows.map(r => r.entry_date.slice(0, 7)))).sort().reverse(), [rows]);
  useEffect(() => { if (month !== 'all' && !months.includes(month)) setMonth('all'); }, [months, month]);

  const q = query.trim().toLowerCase();
  // Typing a number also finds amounts: "102" finds $102.00 and $102.50 (not
  // $1,020), "102.5" finds $102.50, "1,500" or "$1500" finds $1,500.00.
  const qAmount = q.replace(/[$,\s]/g, '').replace(/^[-+−]/, '');
  const amountSearch = /^\d+(\.\d{0,2})?$/.test(qAmount);
  const amountMatches = (n: number | null) => {
    if (n == null) return false;
    return qAmount.includes('.')
      ? n.toFixed(2).startsWith(qAmount)
      : Math.trunc(n) === Number(qAmount);
  };
  const shown = rows.filter(r =>
    (month === 'all' || r.entry_date.startsWith(month)) &&
    (!q || r.description.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) ||
      (amountSearch && (amountMatches(r.withdrawal) || amountMatches(r.deposit)))));

  const balance = rows.length ? rows[rows.length - 1].total : account?.opening_balance ?? 0;

  // Suggestions for the Type and Description boxes, from what was typed before.
  // Each account suggests only what was typed in that account before.
  const accountEntries = useMemo(() => entries.filter(e => e.account_id === accountId), [entries, accountId]);
  const typeHints = useMemo(() => Array.from(new Set(accountEntries.map(e => e.type).filter(Boolean))).sort(), [accountEntries]);
  const descHints = useMemo(() => Array.from(new Set(accountEntries.map(e => e.description).filter(Boolean))).sort(), [accountEntries]);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string): Promise<string | null> {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) return res.error || 'Something went wrong.';
      if (success) setToast({ text: success });
      router.refresh();
      return null;
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    } finally {
      setBusy(false);
    }
  }

  async function toggleCleared(r: Row) {
    const next = !r.cleared;
    setClearedOverride(o => ({ ...o, [r.id]: next }));
    const err = await act(() => setClearedAction(r.id, next));
    if (err) {
      setClearedOverride(o => { const n = { ...o }; delete n[r.id]; return n; });
      setToast({ text: err, err: true });
    }
  }

  async function saveQuick(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setQuickErr('');
    const err = await act(() => addEntryAction(account.id, quick), 'Entry added.');
    if (err) { setQuickErr(err); return; }
    // Keep the date and start a new line, ready for the next one.
    setQuick({ ...blankDraft(), entry_date: quick.entry_date });
    quickDesc.current?.focus();
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!entryDlg || !account) return;
    const { id, draft } = entryDlg;
    const err = await act(
      () => (id ? updateEntryAction(id, draft) : addEntryAction(account.id, draft)),
      id ? 'Entry saved.' : 'Entry added.');
    if (err) setEntryDlg({ ...entryDlg, error: err });
    else setEntryDlg(null);
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!acctDlg) return;
    const { id, name, opening } = acctDlg;
    let newId: string | undefined;
    const err = await act(async () => {
      if (id) return updateAccountAction(id, name, opening);
      const res = await createAccountAction(name, opening);
      newId = (res as any).accountId;
      return res;
    }, id ? 'Account saved.' : 'Account created.');
    if (err) { setAcctDlg({ ...acctDlg, error: err }); return; }
    setAcctDlg(null);
    if (newId) { setAccountId(newId); setMonth('all'); }
  }

  const openEdit = (r: Row) => setEntryDlg({
    id: r.id,
    draft: {
      entry_date: r.entry_date, type: r.type, description: r.description,
      withdrawal: amountText(r.withdrawal), deposit: amountText(r.deposit), cleared: r.cleared,
    },
  });

  const setDraft = (patch: Partial<Draft>) => entryDlg && setEntryDlg({ ...entryDlg, draft: { ...entryDlg.draft, ...patch }, error: undefined });

  // --- no accounts yet -------------------------------------------------------------
  if (!account) {
    return (
      <div className="pv-page">
        <div className="pv-page-head"><h1>Ledger</h1></div>
        <div className="pv-card pv-empty">
          <b>No accounts yet</b>
          <p style={{ margin: '0 0 14px' }}>Add an account (for example Checking) to start tracking.</p>
          <button className="pv-btn primary" type="button" onClick={() => setAcctDlg({ name: '', opening: '' })}>Add account</button>
        </div>
        {acctDlg && <AccountModal dlg={acctDlg} setDlg={setAcctDlg} busy={busy} onSave={saveAccount} />}
      </div>
    );
  }

  return (
    <div className="pv-page">
      <div className="pv-page-head">
        <h1>Ledger</h1>
        <button className="pv-btn primary" type="button" onClick={() => setEntryDlg({ draft: blankDraft() })}>
          <Icon name="plus" />Add entry
        </button>
      </div>

      {/* Account tabs (the sheet's tabs) */}
      <div className="pv-tabs" role="tablist">
        {accounts.map(a => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === account.id}
            className={a.id === account.id ? 'on' : ''}
            onClick={() => { setAccountId(a.id); setMonth('all'); setQuery(''); }}>
            {a.name}
          </button>
        ))}
        <button type="button" className="add" onClick={() => setAcctDlg({ name: '', opening: '' })}>
          <Icon name="plus" />Account
        </button>
      </div>

      <div className="pv-stats">
        <div className="pv-stat">
          <span>Balance</span>
          <b className={balance < 0 ? 'neg' : ''}>{money(balance)}</b>
        </div>
      </div>

      <div className="pv-toolbar">
        <select className="pv-input pv-select" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
          <option value="all">All entries</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button className="pv-btn" type="button" onClick={() => setAcctDlg({ id: account.id, name: account.name, opening: amountText(account.opening_balance) })}>
          <Icon name="rename" />Account settings
        </button>
        <div className="pv-search">
          <Icon name="search" />
          <input className="pv-input" placeholder="Search description or amount" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="pv-ledger">
        <div className="lg-row lg-head">
          <div className="lg-type">Type</div>
          <div className="lg-date">Date</div>
          <div className="lg-desc">Description</div>
          <div className="lg-num">Withdrawal</div>
          <div className="lg-num">Deposit</div>
          <div className="lg-ok">✓</div>
          <div className="lg-num">Total</div>
        </div>

        {month === 'all' && !q && (
          <div className="lg-row lg-open">
            <div className="lg-type" />
            <div className="lg-date" />
            <div className="lg-desc">Starting balance</div>
            <div className="lg-num" />
            <div className="lg-num" />
            <div className="lg-ok" />
            <div className="lg-num lg-total">{money(account.opening_balance)}</div>
          </div>
        )}

        {shown.length === 0 && (
          <div className="pv-empty" style={{ padding: '36px 16px' }}>
            {rows.length ? 'No entries match.' : 'No entries yet. Add your first one below.'}
          </div>
        )}

        {shown.map(r => (
          <div key={r.id} className={`lg-row lg-item${r.cleared ? ' ok' : ''}`} onClick={() => openEdit(r)}>
            <div className="lg-type">{r.type}</div>
            <div className="lg-date">{showDate(r.entry_date)}</div>
            <div className="lg-desc">
              <span className="d" dir="auto">{r.description}</span>
              <span className="m">{showDate(r.entry_date)}{r.type ? ` · ${r.type}` : ''}</span>
            </div>
            <div className="lg-num out">{money(r.withdrawal)}</div>
            <div className="lg-num in">{money(r.deposit)}</div>
            <div className="lg-ok" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={r.cleared} aria-label="Cleared" onChange={() => toggleCleared(r)} />
            </div>
            <div className={`lg-num lg-total${r.total < 0 ? ' neg' : ''}`}>
              <span className="amt">{r.withdrawal ? `−${money(r.withdrawal)}` : `+${money(r.deposit)}`}</span>
              <span className="bal">{money(r.total)}</span>
            </div>
          </div>
        ))}

        {/* Quick entry line at the bottom, like typing into the next sheet row (computers only) */}
        <form className="lg-row lg-quick" onSubmit={saveQuick}>
          <div className="lg-type"><input className="pv-input" placeholder="Type" list="lg-types" value={quick.type} onChange={e => setQuick({ ...quick, type: e.target.value })} /></div>
          <div className="lg-date"><input className="pv-input" type="date" required value={quick.entry_date} onChange={e => setQuick({ ...quick, entry_date: e.target.value })} /></div>
          <div className="lg-desc"><input ref={quickDesc} className="pv-input" dir="auto" placeholder="Description" list="lg-descs" value={quick.description} onChange={e => setQuick({ ...quick, description: e.target.value })} /></div>
          <div className="lg-num"><input className="pv-input" inputMode="decimal" placeholder="0.00" value={quick.withdrawal} onChange={e => setQuick({ ...quick, withdrawal: e.target.value })} /></div>
          <div className="lg-num"><input className="pv-input" inputMode="decimal" placeholder="0.00" value={quick.deposit} onChange={e => setQuick({ ...quick, deposit: e.target.value })} /></div>
          <div className="lg-ok"><input type="checkbox" checked={quick.cleared} aria-label="Cleared" onChange={e => setQuick({ ...quick, cleared: e.target.checked })} /></div>
          <div className="lg-num"><button className="pv-btn primary" type="submit" disabled={busy}>Add</button></div>
        </form>
        {quickErr && <p className="pv-err lg-quick-err">{quickErr}</p>}
      </div>

      <datalist id="lg-types">{typeHints.map(t => <option key={t} value={t} />)}</datalist>
      <datalist id="lg-descs">{descHints.map(t => <option key={t} value={t} />)}</datalist>

      {/* Add / edit entry */}
      <PvModal open={!!entryDlg} title={entryDlg?.id ? 'Edit entry' : `Add entry · ${account.name}`} onClose={() => setEntryDlg(null)}>
        {entryDlg && (
          <form onSubmit={saveEntry} className="pv-form-grid">
            {entryDlg.error && <p className="pv-err">{entryDlg.error}</p>}
            <div className="two">
              <label>Date<input className="pv-input" type="date" required value={entryDlg.draft.entry_date} onChange={e => setDraft({ entry_date: e.target.value })} /></label>
              <label>Type<input className="pv-input" list="lg-types" placeholder="Check #, Zelle…" value={entryDlg.draft.type} onChange={e => setDraft({ type: e.target.value })} /></label>
            </div>
            <label>Description<input className="pv-input" dir="auto" list="lg-descs" autoFocus={!entryDlg.id} value={entryDlg.draft.description} onChange={e => setDraft({ description: e.target.value })} /></label>
            <div className="two">
              <label>Withdrawal<input className="pv-input" inputMode="decimal" placeholder="0.00" value={entryDlg.draft.withdrawal} onChange={e => setDraft({ withdrawal: e.target.value })} /></label>
              <label>Deposit<input className="pv-input" inputMode="decimal" placeholder="0.00" value={entryDlg.draft.deposit} onChange={e => setDraft({ deposit: e.target.value })} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={entryDlg.draft.cleared} onChange={e => setDraft({ cleared: e.target.checked })} />Cleared ✓ (shows on the bank statement)</label>
            <div className="pv-modal-foot" style={{ padding: '6px 0 8px' }}>
              {entryDlg.id && (
                <button className="pv-btn" type="button" style={{ color: 'var(--pv-danger)', marginRight: 'auto' }}
                  onClick={() => {
                    const id = entryDlg.id!;
                    setEntryDlg(null);
                    setConfirm({
                      title: 'Delete entry',
                      text: `Delete "${entryDlg.draft.description}"? This cannot be undone.`,
                      run: async () => {
                        const err = await act(() => deleteEntryAction(id), 'Entry deleted.');
                        if (err) setToast({ text: err, err: true });
                      },
                    });
                  }}>
                  <Icon name="trash" />Delete
                </button>
              )}
              <button className="pv-btn" type="button" onClick={() => setEntryDlg(null)}>Cancel</button>
              <button className="pv-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </PvModal>

      {acctDlg && (
        <AccountModal dlg={acctDlg} setDlg={setAcctDlg} busy={busy} onSave={saveAccount}
          onDelete={acctDlg.id ? () => {
            const id = acctDlg.id!;
            const n = entries.filter(e => e.account_id === id).length;
            setAcctDlg(null);
            setConfirm({
              title: 'Delete account',
              text: `Delete the "${account.name}" account and all ${n} of its entries? This cannot be undone.`,
              run: async () => {
                const err = await act(() => deleteAccountAction(id), 'Account deleted.');
                if (err) setToast({ text: err, err: true });
              },
            });
          } : undefined} />
      )}

      <PvModal open={!!confirm} title={confirm?.title ?? ''} onClose={() => setConfirm(null)}
        footer={<>
          <button className="pv-btn" type="button" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="pv-btn danger" type="button" disabled={busy}
            onClick={async () => { const run = confirm!.run; await run(); setConfirm(null); }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </>}>
        <p>{confirm?.text}</p>
      </PvModal>

      {toast && <div className={`pv-toast${toast.err ? ' err' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}

function AccountModal({
  dlg, setDlg, busy, onSave, onDelete,
}: {
  dlg: { id?: string; name: string; opening: string; error?: string };
  setDlg: (d: { id?: string; name: string; opening: string; error?: string } | null) => void;
  busy: boolean;
  onSave: (e: React.FormEvent) => void;
  onDelete?: () => void;
}) {
  return (
    <PvModal open title={dlg.id ? 'Account settings' : 'New account'} onClose={() => setDlg(null)}>
      <form onSubmit={onSave} className="pv-form-grid">
        {dlg.error && <p className="pv-err">{dlg.error}</p>}
        <label>Account name<input className="pv-input" autoFocus={!dlg.id} placeholder="Checking" value={dlg.name}
          onChange={e => setDlg({ ...dlg, name: e.target.value, error: undefined })} /></label>
        <label>Starting balance<input className="pv-input" inputMode="decimal" placeholder="0.00" value={dlg.opening}
          onChange={e => setDlg({ ...dlg, opening: e.target.value, error: undefined })} />
          <small>The balance before the first entry in this account.</small>
        </label>
        <div className="pv-modal-foot" style={{ padding: '6px 0 8px' }}>
          {onDelete && (
            <button className="pv-btn" type="button" style={{ color: 'var(--pv-danger)', marginRight: 'auto' }} onClick={onDelete}>
              <Icon name="trash" />Delete account
            </button>
          )}
          <button className="pv-btn" type="button" onClick={() => setDlg(null)}>Cancel</button>
          <button className="pv-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </PvModal>
  );
}
