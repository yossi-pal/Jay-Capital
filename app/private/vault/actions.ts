'use server';

import { run, type ActionResult } from '@/lib/result';
import { isPrivateSignedIn } from '@/lib/private-auth';
import * as vault from '@/lib/vault';
import type { ItemRef } from '@/lib/vault';

/** Every Vault action needs the /private PIN pass. */
async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  if (!(await isPrivateSignedIn())) return { ok: false, error: 'Your session expired. Please sign in again.' };
  return run(fn);
}

const parent = (id: string | null | undefined) => (id ? String(id) : null);
const refs = (items: ItemRef[]) =>
  (Array.isArray(items) ? items : [])
    .filter(i => i && (i.kind === 'folder' || i.kind === 'file') && typeof i.id === 'string')
    .map(i => ({ kind: i.kind, id: i.id }));

export async function createFolderAction(parentId: string | null, name: string) {
  return guard(async () => { await vault.createFolder(parent(parentId), name); });
}

export async function renameAction(item: ItemRef, name: string) {
  return guard(async () => { await vault.renameItem(refs([item])[0], name); });
}

export async function prepareUploadAction() {
  return guard(async () => ({ upload: await vault.prepareUpload() }));
}

export async function finishUploadAction(folderId: string | null, name: string, path: string, mime: string | null) {
  return guard(async () => ({ name: await vault.finishUpload(parent(folderId), name, path, mime) }));
}

export async function fileLinkAction(fileId: string, download: boolean) {
  return guard(async () => ({ url: await vault.fileLink(String(fileId), !!download) }));
}

export async function deleteAction(items: ItemRef[]) {
  return guard(async () => { await vault.deleteItems(refs(items)); });
}

export async function moveAction(items: ItemRef[], targetId: string | null) {
  return guard(async () => { await vault.moveItems(refs(items), parent(targetId)); });
}

export async function copyAction(items: ItemRef[], targetId: string | null) {
  return guard(async () => { await vault.copyItems(refs(items), parent(targetId)); });
}
