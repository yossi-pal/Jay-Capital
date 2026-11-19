# Private site (pv-vault) — rules for Claude

This folder is the owner's **personal** site: a PIN-protected Vault (file storage) and Ledger (personal checkbook register). It has nothing to do with the Jay Capital portal. Work only inside `private-site/` and never change the Jay Capital site, its database or its Vercel project for a private-site request. The Jay Capital rules in the root CLAUDE.md about loans, borrowers, statements, email and lib/interest.ts / lib/ledger.ts do not apply here.

The person asking for changes is not technical. Explain everything in plain English, never ask them to run commands or edit code, and walk them through any clicks needed on GitHub, Vercel or Supabase.

## Where things live
- Live address: https://pv-vault.vercel.app
- Vercel project: **pv-vault** (team Jay Capital Funding), Root Directory `private-site`. Merging into `main` publishes it. Production only has the secret key, so preview links show the PIN screen but cannot sign in.
- Supabase project: **private-vault** (id `smiwbarppwerdrgjrged`). Never use the Jay Capital project (`vqfiwnqbcuqzhldqrjru`) for private-site work.
- The old `/private` area was removed from Jay Capital. Its old tables (`vault_*`, `personal_ledger_*`, `private_area`) and `vault` bucket are still in the Jay Capital database, unused, and kept on purpose. Leave them alone unless the owner asks.

## Rules
- Database changes go in a new numbered file in `private-site/supabase/migrations/` (next is 002) and are applied to **private-vault** with the Supabase connector only after the owner approves.
- Every table has row level security ON with **no policies**, and `anon`/`authenticated` revoked. Only the server's service-role client reads or writes, and only after the PIN check. Never add public policies, and never read data from the browser. Storage bucket `vault` is private with no policies; files are reached only through short-lived signed links from the server.
- Every server action must check the PIN pass first (`isPrivateSignedIn()` in `lib/private-auth.ts`) and return `{ ok, error }` (`lib/result.ts`) instead of throwing.
- Sign-in must fail closed: if the database cannot be read, nobody gets in. Never reintroduce a fallback to the starting PIN on errors.
- Ledger money math is done in whole cents. Business dates use New York time via `todayInAppTz()` in `lib/format.ts`.
- Keep the site's own look (`app/globals.css`, everything under `.pv-root`), not the Jay Capital brand. Use the site's own modal (`PvModal` in `app/ui.tsx`), never browser alert or confirm popups.
- Keep pages working on phones and tablets.
- Never put a secret key in code. `SUPABASE_SERVICE_ROLE_KEY` lives only in the pv-vault Vercel settings; the owner pastes it there.
- Free Supabase plan: 50 MB per file and 1 GB storage in total.
- Before finishing any change, run `npm run build` inside `private-site/` and fix every error, then give a short plain-English summary of what changed and what to check.
