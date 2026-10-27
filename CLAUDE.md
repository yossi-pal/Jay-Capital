# Jay Capital portal — rules for Claude
The person asking for changes is not technical. Explain everything in plain English, never ask them to run commands or edit code, and walk them through any clicks needed on GitHub, Vercel or Supabase.
- Stack: Next.js 14 (App Router) on Vercel; Supabase for database, auth and row-level security. Merging into main publishes to production.
- lib/interest.ts and lib/ledger.ts are money-critical. Do not change them unless I explicitly ask for a change to how interest, balances or due dates work. Explain the effect on real statements before changing them.
- A borrower must NEVER see a loan that is not theirs. Ownership is decided by the borrower's email (my_borrower_ids() in migration 005). Never weaken a row-level security policy.
- Every database view must set security_invoker = on. Without it the view bypasses security.
- Database changes go in a new numbered file in supabase/migrations/ (next is 010) and are applied with the Supabase connector only after I approve.
- All email goes through lib/mailer.ts and our own SMTP. Never use Supabase's email (inviteUserByEmail, resetPasswordForEmail, signInWithOtp). Use auth.admin.generateLink and send the link with sendMail().
- Dates use New York time via todayInAppTz() and fmtDateTime() in lib/format.ts, never new Date() for business dates.
- Statements are a snapshot as of their period end: later draws and payments never appear on them.
- Server actions return { ok, error } (lib/result.ts) instead of throwing, so the real error shows on screen.
- Use the site's themed modals, never browser alert or confirm popups.
- Keep pages working on phones and tablets.
- Never put a secret key in code. Secrets live only in Vercel environment variables.
- Before finishing any change, run npm run build and fix every error, then give me a short plain-English summary of what changed and what I should check on the preview.
