'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { APP_TZ } from '@/lib/format';
import type { VaultFile, VaultFolder } from '@/lib/vault';
import { FileGlyph, Icon, PvModal } from '../ui';
import {
  copyAction, createFolderAction, deleteAction, fileLinkAction, finishUploadAction,
  moveAction, prepareUploadAction, renameAction,
} from './actions';

type FileRow = Omit<VaultFile, 'storage_path'>;
type Ref = { kind: 'folder' | 'file'; id: string };
type Row = Ref & { name: string; parent: string | null; updated: string; size: number | null };
type SortKey = 'name' | 'date' | 'size';
type Upload = { key: string; name: string; pct: number; state: 'wait' | 'up' | 'done' | 'err'; error?: string };

const keyOf = (r: Ref) => `${r.kind}:${r.id}`;
const DRAG_TYPE = 'application/x-vault-items';
/** Roughly how tall the ⋯ menu is, to keep it on screen. */
const MENU_H = 320;

function fmtSize(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: APP_TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function Vault({ folders, files }: { folders: VaultFolder[]; files: FileRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const rawFolder = params.get('f');
  const folderById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  const current = rawFolder && folderById.has(rawFolder) ? rawFolder : null;

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<{ mode: 'copy' | 'cut'; items: Ref[] } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);
  const [nameDlg, setNameDlg] = useState<{ mode: 'new' | 'rename'; row?: Row; value: string } | null>(null);
  const [delDlg, setDelDlg] = useState<Ref[] | null>(null);
  const [picker, setPicker] = useState<{ mode: 'move' | 'copy'; items: Ref[] } | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id, 'root', or 'list'
  const fileInput = useRef<HTMLInputElement>(null);

  // --- navigation (keeps the folder in the address bar; Back works) ---------
  const go = useCallback((id: string | null) => {
    window.history.pushState(null, '', id ? `/private/vault?f=${id}` : '/private/vault');
    setSelected(new Set());
    setQuery('');
    setMenu(null);
  }, []);

  // --- toast ------------------------------------------------------------------
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.err ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast({ text });
  const fail = (text?: string) => setToast({ text: text || 'Something went wrong.', err: true });

  // --- rows -------------------------------------------------------------------
  const allRows: Row[] = useMemo(() => [
    ...folders.map(f => ({ kind: 'folder' as const, id: f.id, name: f.name, parent: f.parent_id, updated: f.updated_at, size: null })),
    ...files.map(f => ({ kind: 'file' as const, id: f.id, name: f.name, parent: f.folder_id, updated: f.updated_at, size: Number(f.size_bytes) })),
  ], [folders, files]);

  const pathOf = useCallback((folderId: string | null): VaultFolder[] => {
    const chain: VaultFolder[] = [];
    let id = folderId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const f = folderById.get(id);
      if (!f) break;
      chain.unshift(f);
      id = f.parent_id;
    }
    return chain;
  }, [folderById]);

  const searching = query.trim().length > 0;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? allRows.filter(r => r.name.toLowerCase().includes(q))
      : allRows.filter(r => r.parent === current);
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (sort.key === 'date') return dir * a.updated.localeCompare(b.updated);
      if (sort.key === 'size' && a.kind === 'file') return dir * ((a.size ?? 0) - (b.size ?? 0));
      return dir * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [allRows, current, query, sort]);

  // Drop any selection that is no longer on screen.
  useEffect(() => {
    setSelected(prev => {
      const visible = new Set(rows.map(keyOf));
      const next = new Set(Array.from(prev).filter(k => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const selectedRefs: Ref[] = rows.filter(r => selected.has(keyOf(r))).map(r => ({ kind: r.kind, id: r.id }));
  const cutKeys = new Set(clip?.mode === 'cut' ? clip.items.map(keyOf) : []);
  const totalBytes = files.reduce((s, f) => s + Number(f.size_bytes || 0), 0);

  // --- running an action --------------------------------------------------------
  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) { fail(res.error); return false; }
      if (success) say(success);
      router.refresh();
      return true;
    } catch {
      fail('Could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const describe = (items: Ref[]) => items.length === 1
    ? `"${allRows.find(r => r.kind === items[0].kind && r.id === items[0].id)?.name ?? 'item'}"`
    : plural(items.length, 'item');

  // --- files: open / download -----------------------------------------------------
  async function openFile(row: Row) {
    // Open the tab right away (inside the click) so pop-up blockers allow it.
    const w = window.open('', '_blank');
    const res = await fileLinkAction(row.id, false);
    if (!res.ok || !(res as any).url) { w?.close(); fail(res.error); return; }
    if (w) w.location.href = (res as any).url;
    else window.location.href = (res as any).url;
  }

  async function downloadFiles(items: Ref[]) {
    const fileItems = items.filter(i => i.kind === 'file');
    if (!fileItems.length) { fail('Folders cannot be downloaded as a whole yet. Open the folder and download the files.'); return; }
    for (const it of fileItems) {
      const res = await fileLinkAction(it.id, true);
      if (!res.ok || !(res as any).url) { fail(res.error); return; }
      const a = document.createElement('a');
      a.href = (res as any).url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (fileItems.length > 1) await new Promise(r => setTimeout(r, 400));
    }
    if (fileItems.length < items.length) say('Folders were skipped; only files were downloaded.');
  }

  // --- uploads ------------------------------------------------------------------
  function patchUpload(key: string, patch: Partial<Upload>) {
    setUploads(list => list.map(u => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function uploadOne(file: File, folderId: string | null, key: string) {
    patchUpload(key, { state: 'up' });
    const prep = await prepareUploadAction();
    if (!prep.ok) throw new Error(prep.error);
    const { path, signedUrl } = (prep as any).upload as { path: string; signedUrl: string };
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('x-upsert', 'false');
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (anon) xhr.setRequestHeader('apikey', anon);
      xhr.upload.onprogress = e => { if (e.lengthComputable) patchUpload(key, { pct: Math.round((e.loaded / e.total) * 100) }); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        if (xhr.status === 413 || /too large|exceeded the maximum/i.test(xhr.responseText)) {
          return reject(new Error('Too large for the storage upload limit.'));
        }
        let msg = 'Upload failed.';
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* keep default */ }
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Connection lost during upload.'));
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', file);
      xhr.send(body);
    });
    const fin = await finishUploadAction(folderId, file.name, path, file.type || null);
    if (!fin.ok) throw new Error(fin.error);
  }

  async function uploadFiles(list: FileList | File[], folderId: string | null) {
    const chosen = Array.from(list);
    if (!chosen.length) return;
    const stamp = Date.now();
    const jobs = chosen.map((file, i) => ({ file, key: `${stamp}-${i}` }));
    setUploads(prev => [...prev.filter(u => u.state === 'up' || u.state === 'wait'),
      ...jobs.map(j => ({ key: j.key, name: j.file.name, pct: 0, state: 'wait' as const }))]);

    let next = 0;
    let failed = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          await uploadOne(job.file, folderId, job.key);
          patchUpload(job.key, { state: 'done', pct: 100 });
        } catch (e: any) {
          failed++;
          patchUpload(job.key, { state: 'err', error: e?.message || 'Upload failed.' });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    router.refresh();
    if (!failed) say(`${plural(jobs.length, 'file')} uploaded.`);
    else fail(`${failed} of ${jobs.length} uploads failed. See the list for details.`);
  }

  // --- clipboard ------------------------------------------------------------------
  function toClipboard(mode: 'copy' | 'cut', items: Ref[]) {
    if (!items.length) return;
    setClip({ mode, items });
    say(`${mode === 'copy' ? 'Copied' : 'Cut'} ${describe(items)}. Open a folder and press Paste.`);
  }

  async function paste() {
    if (!clip) return;
    const target = current;
    if (clip.mode === 'cut') {
      const ok = await act(() => moveAction(clip.items, target), `Moved ${describe(clip.items)}.`);
      if (ok) setClip(null);
    } else {
      await act(() => copyAction(clip.items, target), `Pasted ${describe(clip.items)}.`);
    }
  }

  // --- keyboard shortcuts -----------------------------------------------------------
  const anyDialog = !!(nameDlg || delDlg || picker);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialog) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c' && selectedRefs.length) { e.preventDefault(); toClipboard('copy', selectedRefs); }
      else if (mod && e.key.toLowerCase() === 'x' && selectedRefs.length) { e.preventDefault(); toClipboard('cut', selectedRefs); }
      else if (mod && e.key.toLowerCase() === 'v' && clip && !searching) { e.preventDefault(); paste(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(new Set(rows.map(keyOf))); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRefs.length) { e.preventDefault(); setDelDlg(selectedRefs); }
      else if (e.key === 'Escape') { setSelected(new Set()); setMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Close the ⋯ menu on any outside click or scroll.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  // --- selection ------------------------------------------------------------------
  function toggle(row: Row) {
    setSelected(prev => {
      const next = new Set(prev);
      const k = keyOf(row);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  const allChecked = rows.length > 0 && rows.every(r => selected.has(keyOf(r)));

  function openRow(row: Row) {
    if (row.kind === 'folder') go(row.id);
    else openFile(row);
  }

  // The ⋯ menu acts on the whole selection when the row is part of it.
  function targetsFor(row: Row): Ref[] {
    return selected.has(keyOf(row)) && selectedRefs.length > 1 ? selectedRefs : [{ kind: row.kind, id: row.id }];
  }

  // --- drag & drop ------------------------------------------------------------------
  function dragItems(row: Row, e: React.DragEvent) {
    const items = selected.has(keyOf(row)) ? selectedRefs : [{ kind: row.kind, id: row.id }];
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(items));
    e.dataTransfer.effectAllowed = 'move';
  }
  const isOurs = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE);
  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  function onFolderDragOver(e: React.DragEvent, id: string) {
    if (!isOurs(e) && !isFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = isOurs(e) ? 'move' : 'copy';
    if (dropTarget !== id) setDropTarget(id);
  }
  function onFolderDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw) {
      let items: Ref[] = [];
      try { items = JSON.parse(raw); } catch { return; }
      if (folderId && items.some(i => i.kind === 'folder' && i.id === folderId)) return;
      const name = folderId ? folderById.get(folderId)?.name : 'Vault';
      act(() => moveAction(items, folderId), `Moved ${describe(items)} to "${name}".`);
    } else if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files, folderId);
    }
  }

  // --- render -----------------------------------------------------------------------
  const crumbs = pathOf(current);
  const sortBtn = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort(s => ({ key, asc: s.key === key ? !s.asc : true }))}>
      {label}{sort.key === key && <Icon name={sort.asc ? 'up' : 'downArrow'} className="" />}
    </button>
  );

  const menuRow = menu?.row;
  const menuTargets = menuRow ? targetsFor(menuRow) : [];
  const menuMany = menuTargets.length > 1;

  return (
    <div className="pv-page">
      <div className="pv-page-head">
        <div>
          <h1>Vault</h1>
          <div className="pv-sub">{plural(files.length, 'file')} · {plural(folders.length, 'folder')} · {fmtSize(totalBytes)}</div>
        </div>
      </div>

      <div className="pv-toolbar">
        <button className="pv-btn primary" type="button" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" />Upload
        </button>
        <button className="pv-btn" type="button" onClick={() => setNameDlg({ mode: 'new', value: '' })}>
          <Icon name="folderPlus" />New folder
        </button>
        {clip && !searching && (
          <button className="pv-btn" type="button" onClick={paste} disabled={busy}>
            <Icon name="paste" />Paste
          </button>
        )}
        <div className="pv-search">
          <Icon name="search" />
          <input className="pv-input" placeholder="Search the whole Vault" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <input ref={fileInput} type="file" multiple hidden
          onChange={e => { if (e.target.files) uploadFiles(e.target.files, current); e.target.value = ''; }} />
      </div>

      {searching ? (
        <div className="pv-crumbs">
          <span style={{ padding: '4px 6px', color: 'var(--pv-ink-2)' }}>
            {plural(rows.length, 'result')} for “{query.trim()}”
          </span>
          <button type="button" onClick={() => setQuery('')}>Clear</button>
        </div>
      ) : (
        <nav className="pv-crumbs" aria-label="Folder path">
          <button type="button" className={`${!current ? 'cur' : ''}${dropTarget === 'root' ? ' drop' : ''}`}
            onClick={() => go(null)}
            onDragOver={e => current && onFolderDragOver(e, 'root')}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => onFolderDrop(e, null)}>
            Vault
          </button>
          {crumbs.map((f, i) => (
            <span key={f.id} style={{ display: 'contents' }}>
              <span className="sep">/</span>
              <button type="button"
                className={`${i === crumbs.length - 1 ? 'cur' : ''}${dropTarget === f.id ? ' drop' : ''}`}
                onClick={() => go(f.id)}
                onDragOver={e => i < crumbs.length - 1 && onFolderDragOver(e, f.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={e => onFolderDrop(e, f.id)}>
                {f.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {clip && (
        <div className="pv-clip">
          <Icon name={clip.mode === 'copy' ? 'copy' : 'cut'} className="" />
          <span style={{ flex: 1, minWidth: 160 }}>
            {clip.mode === 'copy' ? 'Copied' : 'Cut'} {describe(clip.items)}. Go to a folder and paste.
          </span>
          {!searching && <button className="pv-btn primary" type="button" onClick={paste} disabled={busy}>Paste here</button>}
          <button className="pv-btn ghost" type="button" onClick={() => setClip(null)}>Cancel</button>
        </div>
      )}

      {selectedRefs.length > 0 && (
        <div className="pv-selbar">
          <span className="count">{selectedRefs.length} selected</span>
          <button className="pv-btn" type="button" onClick={() => downloadFiles(selectedRefs)}><Icon name="download" />Download</button>
          {selectedRefs.length === 1 && (
            <button className="pv-btn" type="button" onClick={() => {
              const r = rows.find(x => keyOf(x) === keyOf(selectedRefs[0]));
              if (r) setNameDlg({ mode: 'rename', row: r, value: r.name });
            }}><Icon name="rename" />Rename</button>
          )}
          <button className="pv-btn" type="button" onClick={() => toClipboard('copy', selectedRefs)}><Icon name="copy" />Copy</button>
          <button className="pv-btn" type="button" onClick={() => toClipboard('cut', selectedRefs)}><Icon name="cut" />Cut</button>
          <button className="pv-btn" type="button" onClick={() => setPicker({ mode: 'move', items: selectedRefs })}><Icon name="move" />Move to…</button>
          <button className="pv-btn" type="button" onClick={() => setPicker({ mode: 'copy', items: selectedRefs })}><Icon name="copy" />Copy to…</button>
          <button className="pv-btn" type="button" style={{ color: 'var(--pv-danger)' }} onClick={() => setDelDlg(selectedRefs)}><Icon name="trash" />Delete</button>
          <button className="pv-btn" type="button" onClick={() => setSelected(new Set())}><Icon name="close" />Clear</button>
        </div>
      )}

      <div
        className={`pv-list${dropTarget === 'list' ? ' dropping' : ''}`}
        onDragOver={e => { if (isFiles(e) && !searching) { e.preventDefault(); if (dropTarget !== 'list') setDropTarget('list'); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
        onDrop={e => { if (isFiles(e) && !searching) onFolderDrop(e, current); }}
      >
        <div className="pv-row head">
          <div className="pv-cell-check">
            <input type="checkbox" aria-label="Select all" checked={allChecked} disabled={!rows.length}
              onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map(keyOf)))} />
          </div>
          <div>{sortBtn('name', 'Name')}</div>
          <div className="pv-cell-date">{sortBtn('date', 'Modified')}</div>
          <div className="pv-cell-size">{sortBtn('size', 'Size')}</div>
          <div />
        </div>

        {rows.length === 0 && (
          <div className="pv-empty">
            <Icon name={searching ? 'search' : 'folder'} />
            {searching ? <b>No matches</b> : <b>This folder is empty</b>}
            {!searching && 'Upload files, drag them here, or create a folder.'}
          </div>
        )}

        {rows.map(row => {
          const k = keyOf(row);
          const where = searching ? pathOf(row.kind === 'folder' ? row.parent : row.parent).map(f => f.name).join(' / ') : '';
          return (
            <div key={k}
              className={`pv-row item${selected.has(k) ? ' sel' : ''}${cutKeys.has(k) ? ' cut' : ''}${dropTarget === row.id ? ' drop' : ''}`}
              draggable
              onDragStart={e => dragItems(row, e)}
              onDragEnd={() => setDropTarget(null)}
              onDragOver={row.kind === 'folder' ? e => onFolderDragOver(e, row.id) : undefined}
              onDragLeave={row.kind === 'folder' ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); } : undefined}
              onDrop={row.kind === 'folder' ? e => onFolderDrop(e, row.id) : undefined}
              onDoubleClick={() => openRow(row)}
              onContextMenu={e => {
                e.preventDefault();
                setMenu({ x: Math.max(8, Math.min(e.clientX, window.innerWidth - 210)), y: Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H - 8)), row });
              }}
            >
              <div className="pv-cell-check">
                <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(k)} onChange={() => toggle(row)} />
              </div>
              <div className="pv-cell-name">
                <FileGlyph name={row.name} folder={row.kind === 'folder'} />
                <div className="txt">
                  <span className="nm" title={row.name} onClick={() => openRow(row)}>{row.name}</span>
                  {searching && <span className="path">in {where || 'Vault'}</span>}
                  <span className="meta">{fmtWhen(row.updated)}{row.kind === 'file' ? ` · ${fmtSize(row.size)}` : ''}</span>
                </div>
              </div>
              <div className="pv-cell-date">{fmtWhen(row.updated)}</div>
              <div className="pv-cell-size">{row.kind === 'file' ? fmtSize(row.size) : '—'}</div>
              <div className="pv-cell-more">
                <button className="pv-btn ghost icon" type="button" aria-label="More actions"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    if (menu?.row && keyOf(menu.row) === k) { setMenu(null); return; }
                    const below = r.bottom + 4 + MENU_H <= window.innerHeight;
                    setMenu({ x: Math.max(8, r.right - 200), y: below ? r.bottom + 4 : Math.max(8, r.top - 4 - MENU_H), row });
                  }}>
                  <Icon name="more" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ⋯ menu */}
      {menu && menuRow && (
        <div className="pv-menu" style={{ left: menu.x, top: Math.max(8, menu.y) }} onMouseDown={e => e.stopPropagation()}>
          {!menuMany && (
            <button type="button" onClick={() => { setMenu(null); openRow(menuRow); }}>
              <Icon name={menuRow.kind === 'folder' ? 'folder' : 'open'} />Open
            </button>
          )}
          {searching && !menuMany && (
            <button type="button" onClick={() => { setMenu(null); go(menuRow.parent); }}>
              <Icon name="folder" />Show in folder
            </button>
          )}
          <button type="button" onClick={() => { setMenu(null); downloadFiles(menuTargets); }}>
            <Icon name="download" />Download{menuMany ? ` ${menuTargets.length} items` : ''}
          </button>
          {!menuMany && (
            <button type="button" onClick={() => { setMenu(null); setNameDlg({ mode: 'rename', row: menuRow, value: menuRow.name }); }}>
              <Icon name="rename" />Rename
            </button>
          )}
          <hr />
          <button type="button" onClick={() => { setMenu(null); toClipboard('copy', menuTargets); }}><Icon name="copy" />Copy</button>
          <button type="button" onClick={() => { setMenu(null); toClipboard('cut', menuTargets); }}><Icon name="cut" />Cut</button>
          {clip && !searching && menuRow.kind === 'folder' && !menuMany && (
            <button type="button" onClick={async () => {
              setMenu(null);
              const fn = clip.mode === 'cut' ? moveAction : copyAction;
              const ok = await act(() => fn(clip.items, menuRow.id), `Pasted into "${menuRow.name}".`);
              if (ok && clip.mode === 'cut') setClip(null);
            }}><Icon name="paste" />Paste into this folder</button>
          )}
          <button type="button" onClick={() => { setMenu(null); setPicker({ mode: 'move', items: menuTargets }); }}><Icon name="move" />Move to…</button>
          <button type="button" onClick={() => { setMenu(null); setPicker({ mode: 'copy', items: menuTargets }); }}><Icon name="copy" />Copy to…</button>
          <hr />
          <button type="button" className="danger" onClick={() => { setMenu(null); setDelDlg(menuTargets); }}><Icon name="trash" />Delete</button>
        </div>
      )}

      {/* New folder / rename */}
      <PvModal open={!!nameDlg} title={nameDlg?.mode === 'new' ? 'New folder' : 'Rename'} onClose={() => setNameDlg(null)}>
        {nameDlg && (
          <form onSubmit={async e => {
            e.preventDefault();
            const value = nameDlg.value;
            const ok = nameDlg.mode === 'new'
              ? await act(() => createFolderAction(current, value), 'Folder created.')
              : await act(() => renameAction({ kind: nameDlg.row!.kind, id: nameDlg.row!.id }, value), 'Renamed.');
            if (ok) setNameDlg(null);
          }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="pv-input" autoFocus value={nameDlg.value}
              placeholder={nameDlg.mode === 'new' ? 'Folder name' : 'New name'}
              onFocus={e => {
                // When renaming a file, select the name but not the extension.
                const v = e.currentTarget.value;
                const dot = nameDlg.row?.kind === 'file' ? v.lastIndexOf('.') : -1;
                e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
              }}
              onChange={e => setNameDlg({ ...nameDlg, value: e.target.value })} />
            <div className="pv-modal-foot" style={{ padding: '4px 0 8px' }}>
              <button className="pv-btn" type="button" onClick={() => setNameDlg(null)}>Cancel</button>
              <button className="pv-btn primary" type="submit" disabled={busy || !nameDlg.value.trim()}>
                {nameDlg.mode === 'new' ? 'Create' : 'Rename'}
              </button>
            </div>
          </form>
        )}
      </PvModal>

      {/* Delete */}
      <PvModal open={!!delDlg} title="Delete" onClose={() => setDelDlg(null)}
        footer={<>
          <button className="pv-btn" type="button" onClick={() => setDelDlg(null)}>Cancel</button>
          <button className="pv-btn danger" type="button" disabled={busy} onClick={async () => {
            const items = delDlg!;
            const ok = await act(() => deleteAction(items), `Deleted ${describe(items)}.`);
            if (ok) {
              setDelDlg(null);
              setSelected(new Set());
              if (clip) setClip(null);
            }
          }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </>}>
        {delDlg && (
          <p>
            Delete {describe(delDlg)}
            {delDlg.some(i => i.kind === 'folder') ? ' and everything inside' : ''}? This cannot be undone.
          </p>
        )}
      </PvModal>

      {/* Move to / Copy to */}
      {picker && (
        <FolderPicker
          mode={picker.mode}
          items={picker.items}
          folders={folders}
          start={current}
          busy={busy}
          onClose={() => setPicker(null)}
          onPick={async target => {
            const fn = picker.mode === 'move' ? moveAction : copyAction;
            const name = target ? folderById.get(target)?.name : 'Vault';
            const ok = await act(() => fn(picker.items, target),
              `${picker.mode === 'move' ? 'Moved' : 'Copied'} ${describe(picker.items)} to "${name}".`);
            if (ok) { setPicker(null); setSelected(new Set()); }
          }}
        />
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="pv-uploads">
          <div className="pv-uploads-head">
            <span>
              {uploads.some(u => u.state === 'up' || u.state === 'wait')
                ? `Uploading ${uploads.filter(u => u.state === 'up' || u.state === 'wait').length}…`
                : 'Uploads finished'}
            </span>
            {!uploads.some(u => u.state === 'up' || u.state === 'wait') && (
              <button className="pv-btn ghost icon" type="button" aria-label="Close" onClick={() => setUploads([])}><Icon name="close" /></button>
            )}
          </div>
          <ul>
            {uploads.map(u => (
              <li key={u.key}>
                <div className="nm">
                  <span title={u.name}>{u.name}</span>
                  <span style={{ color: u.state === 'err' ? 'var(--pv-danger)' : 'var(--pv-muted)', flexShrink: 0 }}>
                    {u.state === 'done' ? 'Done' : u.state === 'err' ? 'Failed' : u.state === 'wait' ? 'Waiting' : `${u.pct}%`}
                  </span>
                </div>
                {u.state === 'err'
                  ? <div className="pv-err" style={{ fontSize: 12 }}>{u.error}</div>
                  : <div className="pv-bar"><i style={{ width: `${u.state === 'done' ? 100 : u.pct}%` }} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && <div className={`pv-toast${toast.err ? ' err' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}

/** Pick a destination folder for Move to… / Copy to… */
function FolderPicker({
  mode, items, folders, start, busy, onClose, onPick,
}: {
  mode: 'move' | 'copy'; items: Ref[]; folders: VaultFolder[]; start: string | null; busy: boolean;
  onClose: () => void; onPick: (target: string | null) => void;
}) {
  const [target, setTarget] = useState<string | null>(start);
  const children = useMemo(() => {
    const m = new Map<string | null, VaultFolder[]>();
    for (const f of folders) {
      const list = m.get(f.parent_id) ?? [];
      list.push(f);
      m.set(f.parent_id, list);
    }
    m.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
    return m;
  }, [folders]);

  // A folder can't go inside itself: block it and everything under it.
  const blocked = useMemo(() => {
    const out = new Set<string>();
    const stack = items.filter(i => i.kind === 'folder').map(i => i.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      (children.get(id) ?? []).forEach(c => stack.push(c.id));
    }
    return out;
  }, [items, children]);

  // Open the branches leading to the starting folder.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const byId = new Map(folders.map(f => [f.id, f]));
    let id = start;
    while (id) { s.add(id); id = byId.get(id)?.parent_id ?? null; }
    return s;
  });

  const startOk = !(target && blocked.has(target));

  function branch(parent: string | null, depth: number): React.ReactNode {
    return (children.get(parent) ?? []).map(f => {
      const kids = children.get(f.id)?.length ?? 0;
      const isOpen = expanded.has(f.id);
      return (
        <div key={f.id}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: depth * 16 }}>
            <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} style={{ width: 26, padding: 4, visibility: kids ? 'visible' : 'hidden' }}
              onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
              <Icon name="chevron" className="" />
            </button>
            <button type="button" className={target === f.id ? 'on' : ''} disabled={blocked.has(f.id)}
              onClick={() => setTarget(f.id)} onDoubleClick={() => setExpanded(prev => new Set(prev).add(f.id))}>
              <Icon name="folder" /><span>{f.name}</span>
            </button>
          </div>
          {isOpen && branch(f.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <PvModal open title={mode === 'move' ? 'Move to…' : 'Copy to…'} onClose={onClose}
      footer={<>
        <button className="pv-btn" type="button" onClick={onClose}>Cancel</button>
        <button className="pv-btn primary" type="button" disabled={busy || !startOk} onClick={() => onPick(target)}>
          {busy ? 'Working…' : mode === 'move' ? 'Move here' : 'Copy here'}
        </button>
      </>}>
      <p style={{ fontSize: 13 }}>Choose a folder.</p>
      <div className="pv-tree">
        <button type="button" className={target === null ? 'on' : ''} onClick={() => setTarget(null)}>
          <Icon name="home" /><span>Vault (top level)</span>
        </button>
        {branch(null, 0)}
      </div>
    </PvModal>
  );
}
