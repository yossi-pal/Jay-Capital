'use server';

import { revalidatePath } from 'next/cache';
import { run } from '@/lib/result';
import { serverClient } from '@/lib/supabase-server';
import { formatAddress } from '@/lib/formatting';

/**
 * Brokerage: a separate list of deals funded elsewhere. It has nothing to do
 * with the loan system (no interest, statements, draws or portal access).
 * Admins add, edit and delete; staff can view. Row level security enforces
 * the same rule in the database.
 */

export interface BrokerageInput {
  property: string;
  loanAmount: string;
  closingDate: string;
  borrowerName: string;
  lender: string;
}

async function requireAdmin() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Admin only');
  return { supabase, userId: user.id };
}

function clean(input: BrokerageInput) {
  const property = formatAddress(String(input.property || '').trim());
  const borrower_name = String(input.borrowerName || '').trim() || null;
  const loan_amount = Math.round(Number(String(input.loanAmount ?? '').replace(/[$,\s]/g, '')) * 100) / 100;
  const closing_date = String(input.closingDate || '').trim();
  const lender = String(input.lender || '').trim() || null;

  if (!property) throw new Error('Please enter the property address.');
  if (borrower_name && borrower_name.length > 200) throw new Error('Please keep the borrower name under 200 characters.');
  if (!Number.isFinite(loan_amount) || loan_amount <= 0) throw new Error('Please enter a loan amount greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing_date)) throw new Error('Please choose the closing date.');
  if (lender && lender.length > 200) throw new Error('Please keep the lender name under 200 characters.');
  return { property, borrower_name, loan_amount, closing_date, lender };
}

export async function createBrokerageLoan(input: BrokerageInput) {
  return run(async () => {
    const { supabase, userId } = await requireAdmin();
    const row = clean(input);
    const { error } = await supabase.from('brokerage_loans').insert({ ...row, created_by: userId });
    if (error) throw error;
    revalidatePath('/admin/brokerage');
    return { message: 'Loan added.' };
  });
}

export async function updateBrokerageLoan(id: string, input: BrokerageInput) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const row = clean(input);
    const { data, error } = await supabase.from('brokerage_loans').update(row).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('That loan could not be found. It may have been deleted.');
    revalidatePath('/admin/brokerage');
    return { message: 'Loan updated.' };
  });
}

export async function deleteBrokerageLoan(id: string) {
  return run(async () => {
    const { supabase } = await requireAdmin();
    const { error } = await supabase.from('brokerage_loans').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/brokerage');
    return { message: 'Loan deleted.' };
  });
}
