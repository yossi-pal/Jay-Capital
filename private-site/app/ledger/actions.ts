'use server';

import { run, type ActionResult } from '@/lib/result';
import { isPrivateSignedIn } from '@/lib/private-auth';
import * as ledger from '@/lib/personal-ledger';
import type { EntryInput } from '@/lib/personal-ledger';

/** Every Ledger action needs the PIN pass. */
async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  if (!(await isPrivateSignedIn())) return { ok: false, error: 'Your session expired. Please sign in again.' };
  return run(fn);
}

export async function createAccountAction(name: string, opening: string) {
  return guard(async () => ({ accountId: await ledger.createAccount(name, opening) }));
}
export async function updateAccountAction(id: string, name: string, opening: string) {
  return guard(async () => { await ledger.updateAccount(String(id), name, opening); });
}
export async function deleteAccountAction(id: string) {
  return guard(async () => { await ledger.deleteAccount(String(id)); });
}
export async function addEntryAction(accountId: string, input: EntryInput) {
  return guard(async () => { await ledger.addEntry(String(accountId), input); });
}
export async function updateEntryAction(id: string, input: EntryInput) {
  return guard(async () => { await ledger.updateEntry(String(id), input); });
}
export async function setClearedAction(id: string, cleared: boolean) {
  return guard(async () => { await ledger.setCleared(String(id), !!cleared); });
}
export async function deleteEntryAction(id: string) {
  return guard(async () => { await ledger.deleteEntry(String(id)); });
}
