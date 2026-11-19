# Private site

A separate, PIN-protected personal site (Vault + Ledger). It shares nothing
with the Jay Capital portal: its own Vercel project (root directory
`private-site`) and its own Supabase project.

Environment variables (set in Vercel only, never in code):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)

Database changes go in `supabase/migrations/`.
