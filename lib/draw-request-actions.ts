'use server';

import { revalidatePath } from 'next/cache';
import { run } from '@/lib/result';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { sendMail, brandShell, button, BRAND } from '@/lib/mailer';
import { logActivity } from '@/lib/activity';
import { money, fmtDate, fmtDateTime, shortAddress } from '@/lib/format';

/**
 * Draw requests: a borrower asks for a construction draw from the portal, an
 * admin approves it (which records an ordinary draw, the same row "Add draw"
 * writes) or declines it. Every action returns { ok, error } via run().
 *
 * Borrowers have no write access to draw_requests in the database. Their two
 * actions first read the loan AS THE BORROWER, so row level security decides
 * whether it is theirs, and only then write with the service client.
 */

const esc = (v: unknown) =>
  String(v ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

function cents(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function site(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

/** Where new-request alerts go. */
function teamInbox(): string {
  return process.env.DRAW_REQUEST_NOTIFY_EMAIL || BRAND.email;
}

/** Email never decides whether the request was saved; a failure is logged. */
async function trySend(opts: Parameters<typeof sendMail>[0]): Promise<boolean> {
  try { await sendMail(opts); return true; }
  catch (e) { console.error('[draw-requests] email not sent:', e instanceof Error ? e.message : e); return false; }
}

async function requireAdmin() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Admin only');
  return { supabase, userId: user.id };
}

// ---------------------------------------------------------------- borrower

export async function requestDraw(loanId: string, form: FormData) {
  return run(async () => {
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');

    // Read as the borrower: if this comes back, the loan is theirs.
    const { data: loan } = await supabase.from('loan_summary')
      .select('loan_id, loan_number, property, status, remaining_draw, borrower_name, paid_off_date')
      .eq('loan_id', loanId).maybeSingle();
    if (!loan) throw new Error('We could not find that loan on your account.');
    if (loan.status !== 'active' || loan.paid_off_date) throw new Error('Draws can only be requested on an active loan.');

    const amount = cents(form.get('amount'));
    const note = String(form.get('note') || '').trim();
    const available = Number(loan.remaining_draw || 0);

    if (!(amount > 0)) throw new Error('Please enter the amount you need.');
    if (amount > available + 0.005) {
      throw new Error(`That is more than is left to draw on this loan (${money(available)}).`);
    }
    if (!note) throw new Error('Please tell us briefly what the draw is for.');
    if (note.length > 1000) throw new Error('Please keep the description under 1,000 characters.');

    const { data: pending } = await supabase.from('draw_requests')
      .select('amount').eq('loan_id', loanId).eq('status', 'pending').limit(1);
    if (pending && pending.length) {
      throw new Error(`You already have a request for ${money(pending[0].amount)} waiting for review. Please wait for it, or cancel it to send a new one.`);
    }

    const { error } = await serviceClient().from('draw_requests').insert({
      loan_id: loanId, amount, note, status: 'pending', requested_by: user.id,
    });
    if (error) throw new Error(error.message);

    await logActivity('draw_requested', loanId, user.id, `${money(amount)} requested`);

    const link = `${site()}/admin/loans/${loanId}`;
    await trySend({
      to: teamInbox(),
      replyTo: user.email || undefined,
      subject: `Draw request: ${money(amount)} on ${loan.loan_number}`,
      html: brandShell(`
        <h2 style="margin:0 0 12px;color:#04162A;font-size:18px">New draw request</h2>
        <p style="margin:0 0 14px;line-height:1.6">
          <b>${esc(loan.borrower_name)}</b> asked for a draw of <b>${esc(money(amount))}</b>
          on loan ${esc(loan.loan_number)} (${esc(shortAddress(loan.property))}).
        </p>
        <p style="margin:0 0 6px;line-height:1.6"><b>What it is for:</b> ${esc(note)}</p>
        <p style="margin:0 0 18px;line-height:1.6"><b>Left to draw before this:</b> ${esc(money(available))}</p>
        ${button(link, 'Review the request')}
      `),
    });

    revalidatePath('/portal');
    revalidatePath('/admin');
    return { message: 'Your draw request was sent. We will email you once it has been reviewed.' };
  });
}

export async function cancelDrawRequest(requestId: string) {
  return run(async () => {
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');

    // Visible to the borrower only if it is on one of their loans.
    const { data: req } = await supabase.from('draw_requests')
      .select('id, loan_id, amount, status').eq('id', requestId).maybeSingle();
    if (!req) throw new Error('We could not find that request.');
    if (req.status !== 'pending') throw new Error('This request has already been reviewed, so it can no longer be cancelled.');

    const { data: done, error } = await serviceClient().from('draw_requests')
      .update({ status: 'cancelled', decided_at: new Date().toISOString(), decided_by: user.id })
      .eq('id', requestId).eq('status', 'pending').select('id');
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error('This request has already been reviewed, so it can no longer be cancelled.');

    await logActivity('draw_request_cancelled', req.loan_id, user.id, `${money(req.amount)} request cancelled`);
    revalidatePath('/portal');
    revalidatePath('/admin');
    return { message: 'Your request was cancelled.' };
  });
}

// ---------------------------------------------------------------- admin

/** The request, the loan and who to tell, for an admin decision. */
async function loadForDecision(supabase: ReturnType<typeof serverClient>, requestId: string) {
  const { data: req } = await supabase.from('draw_requests')
    .select('id, loan_id, amount, status').eq('id', requestId).maybeSingle();
  if (!req) throw new Error('That draw request no longer exists.');
  if (req.status !== 'pending') throw new Error('This request has already been handled. Refresh the page to see its status.');
  const { data: loan } = await supabase.from('loan_summary')
    .select('loan_id, loan_number, property, borrower_name, borrower_email, remaining_draw')
    .eq('loan_id', req.loan_id).maybeSingle();
  if (!loan) throw new Error('Loan not found.');
  return { req, loan };
}

function firstName(name: string | null | undefined): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/**
 * A message to the borrower while the request is still waiting, e.g. "we are
 * reviewing it". The request stays pending; the borrower sees the latest
 * message on their portal (it is replaced by the final reply once the request
 * is approved or declined) and, if ticked, gets it by email.
 */
export async function sendDrawRequestUpdate(requestId: string, form: FormData) {
  return run(async () => {
    const { supabase, userId } = await requireAdmin();
    const { req, loan } = await loadForDecision(supabase, requestId);

    const message = String(form.get('message') || '').trim();
    const notify = String(form.get('notify') || '') === '1';
    if (!message) throw new Error('Please write the message to send.');
    if (message.length > 1000) throw new Error('Please keep the message under 1,000 characters.');

    const { data: done, error } = await supabase.from('draw_requests')
      .update({ decision_note: message })
      .eq('id', requestId).eq('status', 'pending').select('id');
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error('This request has already been handled. Refresh the page to see its status.');

    await logActivity('draw_request_updated', req.loan_id, userId, `Update on ${money(req.amount)} request`);

    let emailed = false;
    if (notify && loan.borrower_email) {
      emailed = await trySend({
        to: loan.borrower_email,
        subject: `Update on your draw request — ${shortAddress(loan.property)}`,
        html: brandShell(`
          <p style="margin:0 0 14px;line-height:1.6">Hi ${esc(firstName(loan.borrower_name))},</p>
          <p style="margin:0 0 14px;line-height:1.6">
            An update on your draw request of <b>${esc(money(req.amount))}</b>
            on ${esc(shortAddress(loan.property))} (loan ${esc(loan.loan_number)}):
          </p>
          <p style="margin:0 0 18px;line-height:1.6;padding:10px 14px;background:#F7F9FC;border-radius:8px">${esc(message)}</p>
          ${button(`${site()}/portal`, 'View your loan')}
        `),
      });
    }

    revalidatePath(`/admin/loans/${req.loan_id}`);
    revalidatePath('/portal');
    return {
      message: 'Update saved. The borrower will see it on their portal.'
        + (notify ? (emailed ? ' They were also emailed.' : ' The email to the borrower could not be sent.') : ''),
    };
  });
}

/**
 * Email the lender a draw request so they can fund it. Nothing about the
 * request changes; the send is recorded in the activity log. Works while the
 * request is waiting and after it is approved.
 */
export async function sendDrawRequestToLender(requestId: string, form: FormData) {
  return run(async () => {
    const { supabase, userId } = await requireAdmin();

    const { data: req } = await supabase.from('draw_requests')
      .select('id, loan_id, amount, note, status, requested_at, approved_amount').eq('id', requestId).maybeSingle();
    if (!req) throw new Error('That draw request no longer exists.');
    if (req.status === 'declined' || req.status === 'cancelled') {
      throw new Error('This request was declined or cancelled, so there is nothing to send to the lender.');
    }
    const { data: loan } = await supabase.from('loan_summary')
      .select('loan_id, loan_number, property, borrower_name, entity_name, is_entity, lender_name, loan_amount, acquisition, total_disbursed, remaining_draw')
      .eq('loan_id', req.loan_id).maybeSingle();
    if (!loan) throw new Error('Loan not found.');

    const to = Array.from(new Set(String(form.get('to') || '')
      .split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean)));
    if (to.length === 0) throw new Error('Please enter the lender\u2019s email address.');
    const bad = to.filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (bad.length) throw new Error(`That email address does not look right: ${bad.join(', ')}`);
    if (to.length > 10) throw new Error('Please send to 10 addresses or fewer.');
    const message = String(form.get('message') || '').trim();
    if (message.length > 2000) throw new Error('Please keep the message under 2,000 characters.');
    const wire = String(form.get('wire') || '').trim();
    if (wire.length > 2000) throw new Error('Please keep the wiring instructions under 2,000 characters.');
    // Construction draws only: total paid out less what was funded at closing.
    const constructionDrawn = Math.max(0, Number(loan.total_disbursed || 0) - Number(loan.acquisition || 0));

    const { data: me } = await supabase.from('profiles').select('email, full_name').eq('id', userId).maybeSingle();

    const approved = req.status === 'approved' && req.approved_amount != null;
    const amount = approved ? Number(req.approved_amount) : Number(req.amount);
    const borrower = loan.is_entity && loan.entity_name ? `${loan.entity_name} (${loan.borrower_name})` : loan.borrower_name;
    const row = (k: string, v: string) =>
      `<tr><td style="padding:7px 0;color:#6B7A90;border-top:1px solid #E4EAF3">${esc(k)}</td>`
      + `<td style="padding:7px 0;text-align:right;font-weight:600;border-top:1px solid #E4EAF3">${esc(v)}</td></tr>`;

    const html = brandShell(`
      <h2 style="margin:0 0 12px;color:#04162A;font-size:18px">Draw request${approved ? ' (approved)' : ''}: ${esc(money(amount))}</h2>
      ${message ? `<p style="margin:0 0 16px;line-height:1.6;white-space:pre-line">${esc(message)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
        ${row('Loan', String(loan.loan_number))}
        ${row('Property', String(loan.property || ''))}
        ${row('Borrower', String(borrower || ''))}
        ${row(approved ? 'Amount approved' : 'Amount requested', money(amount))}
        ${approved && Math.abs(amount - Number(req.amount)) > 0.005 ? row('Amount requested', money(req.amount)) : ''}
        ${row('Requested', fmtDateTime(req.requested_at))}
        ${row('Loan amount', money(loan.loan_amount))}
        ${row('Construction drawn so far', money(constructionDrawn))}
        ${row('Construction left to draw', money(loan.remaining_draw))}
      </table>
      ${req.note ? `<p style="margin:0 0 6px;line-height:1.6"><b>What it is for:</b> ${esc(req.note)}</p>` : ''}
      ${wire ? `<div style="margin:16px 0 0;padding:12px 14px;background:#F7F9FC;border:1px solid #E4EAF3;border-radius:8px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.04em;color:#6B7A90;margin:0 0 6px">WIRING INSTRUCTIONS</div>
        <div style="line-height:1.6;white-space:pre-line;font-size:14px">${esc(wire)}</div>
      </div>` : ''}
      <p style="margin:16px 0 0;line-height:1.6;color:#6B7A90;font-size:13px">Reply to this email with any questions.</p>
    `);

    await sendMail({
      to: to.join(', '),
      replyTo: me?.email || undefined,
      subject: `Draw request ${money(amount)} — ${loan.loan_number}, ${shortAddress(loan.property)}`,
      html,
    });

    await logActivity('draw_request_sent_to_lender', req.loan_id, userId,
      `${money(amount)} request sent to ${to.join(', ')}`);
    revalidatePath(`/admin/loans/${req.loan_id}`);
    return { message: `Sent to ${to.join(', ')}.` };
  });
}

export async function approveDrawRequest(requestId: string, form: FormData) {
  return run(async () => {
    const { supabase, userId } = await requireAdmin();
    const { req, loan } = await loadForDecision(supabase, requestId);

    const drawDate = String(form.get('draw_date') || '').trim();
    const amount = cents(form.get('amount'));
    const method = String(form.get('method') || '').trim() || null;
    const note = String(form.get('note') || '').trim() || null;
    const message = String(form.get('message') || '').trim() || null;
    const notify = String(form.get('notify') || '') === '1';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) throw new Error('Please enter the draw date.');
    if (!(amount > 0)) throw new Error('Draw amount must be greater than zero.');

    // The same row "Add draw" writes, so interest and statements treat it
    // exactly like any other construction draw.
    const { data: draw, error: drawErr } = await supabase.from('draws').insert({
      loan_id: req.loan_id, draw_date: drawDate, description: 'Construction Draw', method, note, amount,
    }).select('id').single();
    if (drawErr) throw new Error(drawErr.message);

    const { data: done, error } = await supabase.from('draw_requests').update({
      status: 'approved', approved_amount: amount, draw_id: draw.id,
      decided_by: userId, decided_at: new Date().toISOString(), decision_note: message,
    }).eq('id', requestId).eq('status', 'pending').select('id');
    if (error || !done?.length) {
      // Someone else handled it in the meantime (or the write failed): take
      // the draw back out so it is never recorded twice.
      await supabase.from('draws').delete().eq('id', draw.id);
      throw new Error(error?.message || 'This request has already been handled. Refresh the page to see its status.');
    }

    await logActivity('draw_added', req.loan_id, userId, `${money(amount)} dated ${drawDate}`);
    await logActivity('draw_request_approved', req.loan_id, userId, `${money(amount)} approved`);

    let emailed = false;
    if (notify && loan.borrower_email) {
      const changed = Math.abs(amount - Number(req.amount)) > 0.005;
      emailed = await trySend({
        to: loan.borrower_email,
        subject: `Your draw request was approved — ${shortAddress(loan.property)}`,
        html: brandShell(`
          <p style="margin:0 0 14px;line-height:1.6">Hi ${esc(firstName(loan.borrower_name))},</p>
          <p style="margin:0 0 14px;line-height:1.6">
            Good news: your draw request on ${esc(shortAddress(loan.property))} (loan ${esc(loan.loan_number)})
            was approved for <b>${esc(money(amount))}</b>${changed ? ` (you asked for ${esc(money(req.amount))})` : ''},
            dated ${esc(fmtDate(drawDate))}.
          </p>
          ${message ? `<p style="margin:0 0 14px;line-height:1.6;padding:10px 14px;background:#F7F9FC;border-radius:8px">${esc(message)}</p>` : ''}
          ${button(`${site()}/portal`, 'View your loan')}
        `),
      });
    }

    revalidatePath(`/admin/loans/${req.loan_id}`);
    revalidatePath('/admin');
    revalidatePath('/portal');
    return {
      message: `Approved. A ${money(amount)} draw was added to the loan.`
        + (notify ? (emailed ? ' The borrower was emailed.' : ' The email to the borrower could not be sent.') : ''),
    };
  });
}

export async function declineDrawRequest(requestId: string, form: FormData) {
  return run(async () => {
    const { supabase, userId } = await requireAdmin();
    const { req, loan } = await loadForDecision(supabase, requestId);

    const reason = String(form.get('message') || '').trim() || null;
    const notify = String(form.get('notify') || '') === '1';

    const { data: done, error } = await supabase.from('draw_requests').update({
      status: 'declined', decided_by: userId, decided_at: new Date().toISOString(), decision_note: reason,
    }).eq('id', requestId).eq('status', 'pending').select('id');
    if (error) throw new Error(error.message);
    if (!done?.length) throw new Error('This request has already been handled. Refresh the page to see its status.');

    await logActivity('draw_request_declined', req.loan_id, userId, `${money(req.amount)} declined`);

    let emailed = false;
    if (notify && loan.borrower_email) {
      emailed = await trySend({
        to: loan.borrower_email,
        subject: `About your draw request — ${shortAddress(loan.property)}`,
        html: brandShell(`
          <p style="margin:0 0 14px;line-height:1.6">Hi ${esc(firstName(loan.borrower_name))},</p>
          <p style="margin:0 0 14px;line-height:1.6">
            We were not able to approve your draw request of <b>${esc(money(req.amount))}</b>
            on ${esc(shortAddress(loan.property))} (loan ${esc(loan.loan_number)}) at this time.
          </p>
          ${reason ? `<p style="margin:0 0 14px;line-height:1.6;padding:10px 14px;background:#F7F9FC;border-radius:8px">${esc(reason)}</p>` : ''}
          <p style="margin:0 0 18px;line-height:1.6">Please call us at ${esc(BRAND.phone)} or reply to this email with any questions.</p>
          ${button(`${site()}/portal`, 'View your loan')}
        `),
      });
    }

    revalidatePath(`/admin/loans/${req.loan_id}`);
    revalidatePath('/admin');
    revalidatePath('/portal');
    return {
      message: 'Request declined.'
        + (notify ? (emailed ? ' The borrower was emailed.' : ' The email to the borrower could not be sent.') : ''),
    };
  });
}
