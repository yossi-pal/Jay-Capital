import { serviceClient } from '@/lib/supabase';

/**
 * Personal checkbook register for the private site. Server-only.
 * Every caller must check the PIN pass first (see ledger actions).
 *
 * Not related to the loan ledger (lib/ledger.ts) in any way.
 */

export interface LedgerAccount {
  id: string;
  name: string;
  opening_balance: number;
  sort_order: number;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  seq: number;
  entry_date: string;      // YYYY-MM-DD
  type: string;
  description: string;
  withdrawal: number | null;
  deposit: number | null;
  cleared: boolean;
}

export interface EntryInput {
  entry_date: string;
  type: string;
  description: string;
  withdrawal: string | number | null;
  deposit: string | number | null;
  cleared?: boolean;
}

const db = () => serviceClient();
const now = () => new Date().toISOString();

const toNum = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

export async function loadLedger(): Promise<{ accounts: LedgerAccount[]; entries: LedgerEntry[] }> {
  const { data: acc, error: accErr } = await db()
    .from('personal_ledger_accounts')
    .select('id,name,opening_balance,sort_order')
    .order('sort_order').order('created_at');
  if (accErr) throw new Error(accErr.message);

  const entries: LedgerEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('personal_ledger_entries')
      .select('id,account_id,seq,entry_date,type,description,withdrawal,deposit,cleared')
      .order('entry_date').order('seq')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      entries.push({
        ...(r as any),
        seq: Number(r.seq),
        withdrawal: toNum(r.withdrawal),
        deposit: toNum(r.deposit),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return {
    accounts: (acc ?? []).map((a: any) => ({ ...a, opening_balance: Number(a.opening_balance) })),
    entries,
  };
}

// --- validation ------------------------------------------------------------

/** "$1,234.50" / "1234.5" -> 1234.5 ; blank -> null. Two decimals at most. */
export function parseAmount(raw: unknown, label: string): number | null {
  const s = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) throw new Error(`${label} must be an amount like 125.50.`);
  const n = Number(s);
  if (n > 999_999_999) throw new Error(`${label} is too large.`);
  return n;
}

function cleanEntry(input: EntryInput) {
  const date = String(input.entry_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T12:00:00').getTime())) {
    throw new Error('Please enter a valid date.');
  }
  const withdrawal = parseAmount(input.withdrawal, 'Withdrawal');
  const deposit = parseAmount(input.deposit, 'Deposit');
  if (!withdrawal && !deposit) throw new Error('Enter a withdrawal or a deposit amount.');
  if (withdrawal && deposit) throw new Error('Enter either a withdrawal or a deposit, not both.');
  const description = String(input.description ?? '').trim().slice(0, 300);
  if (!description) throw new Error('Please enter a description.');
  return {
    entry_date: date,
    type: String(input.type ?? '').trim().slice(0, 40),
    description,
    withdrawal: withdrawal || null,
    deposit: deposit || null,
    cleared: !!input.cleared,
  };
}

function cleanAccountName(raw: string): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Please enter an account name.');
  if (name.length > 60) throw new Error('That name is too long (60 characters at most).');
  return name;
}

// --- accounts ----------------------------------------------------------------

export async function createAccount(rawName: string, opening: string) {
  const name = cleanAccountName(rawName);
  const opening_balance = parseAmount(opening, 'Starting balance') ?? 0;
  const { data: last } = await db().from('personal_ledger_accounts').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db().from('personal_ledger_accounts')
    .insert({ name, opening_balance, sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateAccount(id: string, rawName: string, opening: string) {
  const name = cleanAccountName(rawName);
  const opening_balance = parseAmount(opening, 'Starting balance') ?? 0;
  const { error } = await db().from('personal_ledger_accounts')
    .update({ name, opening_balance, updated_at: now() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAccount(id: string) {
  const { error } = await db().from('personal_ledger_accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- entries -----------------------------------------------------------------

export async function addEntry(accountId: string, input: EntryInput) {
  const row = cleanEntry(input);
  const { error } = await db().from('personal_ledger_entries').insert({ account_id: accountId, ...row });
  if (error) throw new Error(/foreign key/i.test(error.message) ? 'That account no longer exists. Refresh the page.' : error.message);
}

export async function updateEntry(id: string, input: EntryInput) {
  const row = cleanEntry(input);
  const { error } = await db().from('personal_ledger_entries').update({ ...row, updated_at: now() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setCleared(id: string, cleared: boolean) {
  const { error } = await db().from('personal_ledger_entries').update({ cleared, updated_at: now() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteEntry(id: string) {
  const { error } = await db().from('personal_ledger_entries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
