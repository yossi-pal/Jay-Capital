import { randomUUID } from 'crypto';
import { serviceClient } from '@/lib/supabase-server';

/**
 * Personal Vault (file storage) for the hidden /private area. Server-only.
 * Every caller must check the /private PIN pass first (see vault actions).
 *
 * Folders and file names live in vault_folders / vault_files. The file bytes
 * live in the private `vault` storage bucket under a random key, so renaming
 * or moving a file only changes the database row.
 */

export const VAULT_BUCKET = 'vault';

export interface VaultFolder {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface VaultFile {
  id: string;
  folder_id: string | null;
  name: string;
  size_bytes: number;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  updated_at: string;
}

export type ItemRef = { kind: 'folder' | 'file'; id: string };

const db = () => serviceClient();

// --- reading ---------------------------------------------------------------

/** Supabase returns at most 1000 rows per request, so page through. */
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select(columns).order('name').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadVault(): Promise<{ folders: VaultFolder[]; files: VaultFile[] }> {
  const [folders, files] = await Promise.all([
    fetchAll<VaultFolder>('vault_folders', 'id,parent_id,name,created_at,updated_at'),
    fetchAll<VaultFile>('vault_files', 'id,folder_id,name,size_bytes,mime_type,storage_path,created_at,updated_at'),
  ]);
  return { folders, files };
}

// --- names -----------------------------------------------------------------

export function cleanName(raw: string): string {
  const name = String(raw ?? '').replace(/[\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Please enter a name.');
  if (name === '.' || name === '..') throw new Error('That name is not allowed.');
  if (name.length > 200) throw new Error('That name is too long (200 characters at most).');
  return name;
}

/** "Report.pdf" -> "Report (2).pdf" until it does not clash with `taken`. */
export function uniqueName(name: string, taken: Set<string>, isFile: boolean): string {
  const lower = new Set(Array.from(taken, n => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = isFile ? name.lastIndexOf('.') : -1;
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

async function siblingNames(kind: 'folder' | 'file', parentId: string | null): Promise<Set<string>> {
  const table = kind === 'folder' ? 'vault_folders' : 'vault_files';
  const col = kind === 'folder' ? 'parent_id' : 'folder_id';
  let q = db().from(table).select('name');
  q = parentId ? q.eq(col, parentId) : q.is(col, null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: any) => r.name as string));
}

async function assertFolderExists(id: string | null) {
  if (!id) return;
  const { data, error } = await db().from('vault_folders').select('id').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That folder no longer exists. Refresh the page.');
}

/** The folder plus every folder inside it, at any depth. */
function descendantsOf(rootIds: string[], folders: VaultFolder[]): Set<string> {
  const children = new Map<string | null, string[]>();
  for (const f of folders) {
    const list = children.get(f.parent_id) ?? [];
    list.push(f.id);
    children.set(f.parent_id, list);
  }
  const out = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

const now = () => new Date().toISOString();

// --- folders ---------------------------------------------------------------

export async function createFolder(parentId: string | null, rawName: string) {
  const name = cleanName(rawName);
  await assertFolderExists(parentId);
  const taken = await siblingNames('folder', parentId);
  if (Array.from(taken).some(n => n.toLowerCase() === name.toLowerCase())) {
    throw new Error(`A folder named "${name}" is already here.`);
  }
  const { error } = await db().from('vault_folders').insert({ parent_id: parentId, name });
  if (error) throw new Error(error.message);
}

export async function renameItem(item: ItemRef, rawName: string) {
  const name = cleanName(rawName);
  const table = item.kind === 'folder' ? 'vault_folders' : 'vault_files';
  const col = item.kind === 'folder' ? 'parent_id' : 'folder_id';
  const { data: row, error } = await db().from(table).select(`id,name,${col}`).eq('id', item.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('That item no longer exists. Refresh the page.');
  if ((row as any).name === name) return;
  const taken = await siblingNames(item.kind, (row as any)[col]);
  taken.delete((row as any).name);
  if (Array.from(taken).some(n => n.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Something named "${name}" is already in this folder.`);
  }
  const { error: upErr } = await db().from(table).update({ name, updated_at: now() }).eq('id', item.id);
  if (upErr) throw new Error(upErr.message);
}

// --- uploads ---------------------------------------------------------------

/** Step 1: a one-time link the browser uploads the file to directly. */
export async function prepareUpload() {
  const path = randomUUID();
  const { data, error } = await db().storage.from(VAULT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message || 'Could not start the upload.');
  return { path, signedUrl: data.signedUrl };
}

/** Step 2: once the bytes are stored, record the file in its folder. */
export async function finishUpload(folderId: string | null, rawName: string, path: string, mime: string | null) {
  if (!/^[0-9a-f-]{36}$/.test(path)) throw new Error('Bad upload reference.');
  const name = cleanName(rawName);
  const { data: info, error: infoErr } = await db().storage.from(VAULT_BUCKET).info(path);
  if (infoErr || !info) throw new Error('The upload did not reach storage. Please try again.');
  try {
    await assertFolderExists(folderId);
  } catch (e) {
    await db().storage.from(VAULT_BUCKET).remove([path]);
    throw e;
  }
  const finalName = uniqueName(name, await siblingNames('file', folderId), true);
  const { error } = await db().from('vault_files').insert({
    folder_id: folderId,
    name: finalName,
    storage_path: path,
    size_bytes: Number((info as any).size ?? 0),
    mime_type: (info as any).contentType || mime || null,
  });
  if (error) {
    await db().storage.from(VAULT_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return finalName;
}

// --- downloads -------------------------------------------------------------

/** A link valid for one minute. `download` forces a save instead of opening. */
export async function fileLink(fileId: string, download: boolean): Promise<string> {
  const { data: row, error } = await db().from('vault_files').select('name,storage_path').eq('id', fileId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('That file no longer exists. Refresh the page.');
  const { data, error: signErr } = await db().storage
    .from(VAULT_BUCKET)
    .createSignedUrl(row.storage_path, 60, download ? { download: row.name } : undefined);
  if (signErr || !data) throw new Error(signErr?.message || 'Could not create the link.');
  return data.signedUrl;
}

// --- delete ----------------------------------------------------------------

export async function deleteItems(items: ItemRef[]) {
  const { folders, files } = await loadVault();
  const folderIds = descendantsOf(items.filter(i => i.kind === 'folder').map(i => i.id), folders);
  const fileIds = new Set(items.filter(i => i.kind === 'file').map(i => i.id));
  const doomed = files.filter(f => fileIds.has(f.id) || (f.folder_id && folderIds.has(f.folder_id)));

  // Remove the bytes first, then the rows (folders cascade to their contents).
  const paths = doomed.map(f => f.storage_path);
  for (let i = 0; i < paths.length; i += 500) {
    const { error } = await db().storage.from(VAULT_BUCKET).remove(paths.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  const ids = doomed.map(f => f.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db().from('vault_files').delete().in('id', ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  const topFolders = items.filter(i => i.kind === 'folder').map(i => i.id);
  if (topFolders.length) {
    const { error } = await db().from('vault_folders').delete().in('id', topFolders);
    if (error) throw new Error(error.message);
  }
}

// --- move ------------------------------------------------------------------

export async function moveItems(items: ItemRef[], targetId: string | null) {
  const { folders, files } = await loadVault();
  if (targetId && !folders.some(f => f.id === targetId)) throw new Error('That folder no longer exists. Refresh the page.');
  const movingFolders = items.filter(i => i.kind === 'folder').map(i => i.id);
  if (targetId && descendantsOf(movingFolders, folders).has(targetId)) {
    throw new Error('A folder cannot be moved into itself or one of its own subfolders.');
  }
  const folderNames = new Set(folders.filter(f => f.parent_id === targetId).map(f => f.name));
  const fileNames = new Set(files.filter(f => f.folder_id === targetId).map(f => f.name));

  for (const item of items) {
    if (item.kind === 'folder') {
      const f = folders.find(x => x.id === item.id);
      if (!f || f.parent_id === targetId) continue;
      const name = uniqueName(f.name, folderNames, false);
      folderNames.add(name);
      const { error } = await db().from('vault_folders').update({ parent_id: targetId, name, updated_at: now() }).eq('id', f.id);
      if (error) throw new Error(error.message);
    } else {
      const f = files.find(x => x.id === item.id);
      if (!f || f.folder_id === targetId) continue;
      const name = uniqueName(f.name, fileNames, true);
      fileNames.add(name);
      const { error } = await db().from('vault_files').update({ folder_id: targetId, name, updated_at: now() }).eq('id', f.id);
      if (error) throw new Error(error.message);
    }
  }
}

// --- copy ------------------------------------------------------------------

export async function copyItems(items: ItemRef[], targetId: string | null) {
  const { folders, files } = await loadVault();
  if (targetId && !folders.some(f => f.id === targetId)) throw new Error('That folder no longer exists. Refresh the page.');
  const copyingFolders = items.filter(i => i.kind === 'folder').map(i => i.id);
  if (targetId && descendantsOf(copyingFolders, folders).has(targetId)) {
    throw new Error('A folder cannot be copied into itself or one of its own subfolders.');
  }

  const newFolders: { id: string; parent_id: string | null; name: string }[] = [];
  const newFiles: { source: VaultFile; folder_id: string | null; name: string }[] = [];
  const topFolderNames = new Set(folders.filter(f => f.parent_id === targetId).map(f => f.name));
  const topFileNames = new Set(files.filter(f => f.folder_id === targetId).map(f => f.name));

  // Copy one folder (and everything under it), parents before children.
  const copyFolder = (src: VaultFolder, parentId: string | null, name: string) => {
    const id = randomUUID();
    newFolders.push({ id, parent_id: parentId, name });
    for (const sub of folders.filter(f => f.parent_id === src.id)) copyFolder(sub, id, sub.name);
    for (const file of files.filter(f => f.folder_id === src.id)) newFiles.push({ source: file, folder_id: id, name: file.name });
  };

  for (const item of items) {
    if (item.kind === 'folder') {
      const src = folders.find(f => f.id === item.id);
      if (!src) continue;
      const name = uniqueName(src.name, topFolderNames, false);
      topFolderNames.add(name);
      copyFolder(src, targetId, name);
    } else {
      const src = files.find(f => f.id === item.id);
      if (!src) continue;
      const name = uniqueName(src.name, topFileNames, true);
      topFileNames.add(name);
      newFiles.push({ source: src, folder_id: targetId, name });
    }
  }

  if (newFolders.length) {
    const { error } = await db().from('vault_folders').insert(newFolders);
    if (error) throw new Error(error.message);
  }
  const rows = [];
  for (const nf of newFiles) {
    const path = randomUUID();
    const { error } = await db().storage.from(VAULT_BUCKET).copy(nf.source.storage_path, path);
    if (error) throw new Error(`Could not copy "${nf.source.name}": ${error.message}`);
    rows.push({
      folder_id: nf.folder_id, name: nf.name, storage_path: path,
      size_bytes: nf.source.size_bytes, mime_type: nf.source.mime_type,
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db().from('vault_files').insert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}
