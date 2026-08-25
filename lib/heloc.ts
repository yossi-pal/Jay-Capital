'use server';

import { run } from '@/lib/result';
import { sendMail, brandShell, BRAND } from '@/lib/mailer';

/**
 * HELOC enquiry from the public site.
 *
 * Jay Capital places HELOCs through Onyx Equity Partners, so the application
 * is branded for both and the email says where it is going.
 *
 * NOTE ON THE SSN: it is collected because underwriting needs it, and it is
 * transmitted to the server over TLS. It is deliberately NOT stored anywhere
 * -- there is no database row for an application -- it only passes through
 * into the notification email. See the warning in the email body.
 */

const APPLY_TO = 'Info@JayCapitalFunding.com';

const USES: Record<string, string> = {
  primary: 'Primary Home',
  secondary: 'Secondary Home',
  investment: 'Investment Property',
};

export interface HelocApplication {
  firstName: string; lastName: string; email: string; phone: string;
  dob: string; ssn: string;
  propertyAddress: string; propertyUse: string; primaryAddress?: string;
  /** The same addresses split up, so the email can show them cleanly. */
  propertyAddressParts?: { street: string; city: string; state: string; zip: string };
  primaryAddressParts?: { street: string; city: string; state: string; zip: string };
  propertyValue: string; mortgageBalance: string; monthlyPayment: string;
  annualIncome: string;
  notes?: string;
  /** Honeypot: real applicants leave this empty. */
  website?: string;
}

const digits = (v: string) => String(v ?? '').replace(/\D/g, '');

/**
 * Parse a currency field. Stripping every non-digit would read "$1,234.56"
 * as 123456 -- a hundredfold error on every amount the applicant enters.
 */
const parseMoney = (v: string): number => {
  const cleaned = String(v ?? '').replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};
const esc = (v: string) =>
  String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

export async function submitHelocApplication(input: HelocApplication) {
  return run(async () => {
    if (input.website && input.website.trim() !== '') {
      return { message: 'Thank you — your application has been received.' };
    }

    const need: [keyof HelocApplication, string][] = [
      ['firstName', 'First name'], ['lastName', 'Last name'],
      ['email', 'Email address'], ['phone', 'Phone number'],
      ['dob', 'Date of birth'], ['ssn', 'Social Security number'],
      ['propertyAddress', 'Subject property address'], ['propertyUse', 'Property use'],
      ['propertyValue', 'Estimated current property value'],
      ['mortgageBalance', 'Approximate outstanding mortgage balance'],
      ['monthlyPayment', 'Approximate current monthly payment'],
      ['annualIncome', 'Approximate annual income'],
    ];
    const missing = need
      .filter(([k]) => !String(input[k] ?? '').trim())
      .map(([, label]) => label);

    // Primary address is only required when the subject property is not the
    // applicant's own home.
    if (input.propertyUse && input.propertyUse !== 'primary' && !String(input.primaryAddress ?? '').trim()) {
      missing.push('Primary address');
    }
    // The address arrives split, so check the parts rather than a joined string
    // that could look complete while missing a ZIP.
    const addrParts: [any, string][] = [[input.propertyAddressParts, 'Subject property']];
    if (input.propertyUse && input.propertyUse !== 'primary') {
      addrParts.push([input.primaryAddressParts, 'Primary']);
    }
    for (const [a, label] of addrParts) {
      if (!a) continue;
      if (!String(a.street ?? '').trim()) missing.push(`${label} street address`);
      if (!String(a.city ?? '').trim()) missing.push(`${label} city`);
      if (!String(a.state ?? '').trim()) missing.push(`${label} state`);
      if (!/^\d{5}(-\d{4})?$/.test(String(a.zip ?? '').trim())) missing.push(`${label} ZIP code`);
    }

    if (missing.length) throw new Error(`Please complete: ${missing.join(', ')}.`);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
      throw new Error('Please enter a valid email address.');
    }
    if (digits(input.phone).length < 10) throw new Error('Please enter a valid phone number.');
    if (digits(input.ssn).length !== 9) throw new Error('Please enter a valid 9-digit Social Security number.');

    for (const [k, label] of [
      ['propertyValue', 'Estimated current property value'],
      ['mortgageBalance', 'Approximate outstanding mortgage balance'],
      ['monthlyPayment', 'Approximate current monthly payment'],
      ['annualIncome', 'Approximate annual income'],
    ] as [keyof HelocApplication, string][]) {
      const n = parseMoney(String(input[k] ?? ''));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Please enter a valid amount for ${label}.`);
    }

    const age = (Date.now() - new Date(input.dob).getTime()) / (365.25 * 86400000);
    if (!Number.isFinite(age) || age < 18 || age > 120) {
      throw new Error('Please check the date of birth. Applicants must be at least 18.');
    }

    const ssnDigits = digits(input.ssn);
    const ssnFormatted = `${ssnDigits.slice(0, 3)}-${ssnDigits.slice(3, 5)}-${ssnDigits.slice(5)}`;

    const money = (v: string) => {
      const n = parseMoney(v);
      return Number.isFinite(n)
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(v);
    };

    const navy = '#04162A', muted = '#6B7A90', pale = '#EDF2F8';
    const row = (k: string, v: string) =>
      `<tr><td style="padding:7px 14px 7px 0;color:${muted};white-space:nowrap;vertical-align:top">${k}</td>` +
      `<td style="padding:7px 0;font-weight:700;vertical-align:top">${esc(v)}</td></tr>`;

    const section = (title: string, rows: string) =>
      `<div style="color:${navy};font-weight:700;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:20px 0 6px">${title}</div>
       <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;

    const name = `${input.firstName.trim()} ${input.lastName.trim()}`;

    await sendMail({
      to: APPLY_TO,
      replyTo: `${name} <${input.email.trim()}>`,
      subject: `HELOC application — ${name} — ${input.propertyAddress.trim()}`,
      html: brandShell(
        `<p style="margin:0 0 4px;font-size:15px"><b>New HELOC application</b></p>
         <p style="margin:0 0 14px;color:${muted};font-size:13px">Submitted from the website, for placement through Onyx Equity Partners.</p>

         ${section('Applicant', [
           row('Name', name),
           row('Email', input.email.trim()),
           row('Phone', input.phone.trim()),
           row('Date of birth', input.dob),
           row('SSN', ssnFormatted),
         ].join(''))}

         ${section('Subject property', [
           row('Address', input.propertyAddress.trim()),
           row('Property use', USES[input.propertyUse] ?? input.propertyUse),
           ...(input.propertyUse !== 'primary' && input.primaryAddress
             ? [row('Applicant primary address', input.primaryAddress.trim())] : []),
         ].join(''))}

         ${section('Figures', [
           row('Estimated value', money(input.propertyValue)),
           row('Outstanding mortgage', money(input.mortgageBalance)),
           row('Monthly payment', money(input.monthlyPayment)),
           row('Annual income', money(input.annualIncome)),
         ].join(''))}

         ${input.notes && input.notes.trim()
           ? `${section('Notes', '')}<div style="background:${pale};border-radius:8px;padding:12px 14px;white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(input.notes.trim())}</div>`
           : ''}

         <p style="margin:20px 0 0;padding:10px 12px;background:#FDECEA;border-radius:8px;color:#8A1C18;font-size:12px;line-height:1.55">
           This message contains a Social Security number. Handle it under your
           information-security policy and do not forward it outside ${esc(BRAND.legal)}.
         </p>

         <p style="margin:14px 0 0;color:${muted};font-size:12px">Reply to this email to answer ${esc(name)} directly.</p>`
      ),
    });

    return { message: 'Thank you — your application has been received. We’ll be in touch shortly.' };
  });
}
