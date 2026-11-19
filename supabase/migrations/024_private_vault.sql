-- ============================================================
-- 024  Vault (personal file storage) for the hidden /private area
--
-- Folders and files for the personal Vault. Nothing here relates to loans,
-- borrowers or the company portal.
--
-- Who can see it:
--   * nobody through the normal API. Row level security is on and there are
--     NO policies, so borrowers, staff and admins all get zero rows. Only the
--     server's service-role client (behind the /private PIN) reads or writes.
--   * the file contents live in a PRIVATE storage bucket `vault`. It has no
--     storage policies either, so files can only be reached through short-lived
--     signed links the server hands out after the PIN check.
-- ============================================================

create table if not exists public.vault_folders (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.vault_folders(id) on delete cascade,  -- null = top level
  name       text not null check (length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_folders_parent_idx on public.vault_folders(parent_id);

create table if not exists public.vault_files (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid references public.vault_folders(id) on delete cascade, -- null = top level
  name         text not null check (length(btrim(name)) between 1 and 255),
  storage_path text not null unique,          -- object key inside the `vault` bucket
  size_bytes   bigint not null default 0,
  mime_type    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists vault_files_folder_idx on public.vault_files(folder_id);

alter table public.vault_folders enable row level security;
alter table public.vault_files   enable row level security;
revoke all on public.vault_folders from anon, authenticated;
revoke all on public.vault_files   from anon, authenticated;
-- Deliberately no policies: only the service role may touch these tables.

-- Private bucket for the file contents. No size cap of its own, so the
-- project's global upload limit applies.
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;
-- Deliberately no storage.objects policies for this bucket.
