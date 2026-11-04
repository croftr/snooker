import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SnookerDoc } from '../types';
import { uid } from './stats';

/*
 * Offline first. Every edit is saved to this device straight away, and the app
 * reads from this device, so nothing waits on the snooker hall's signal. Edits
 * are then pushed to S3 in the background whenever there is a connection.
 */

const PW_KEY = 'snooker-referee';
const LOCAL_KEY = 'snooker-doc-v1';
const LOCAL_PHOTOS = 'local-photos-v1';
const LOCAL_PHOTO_PREFIX = '/local-photos/';
const RETRY_MS = 30_000;

interface Local { doc: SnookerDoc; etag: string; pending: number }

function readLocal(): Local | null {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'); } catch { return null; }
}
function storedPassword() {
  try { return localStorage.getItem(PW_KEY); } catch { return null; }
}

/** Fetch that gives up, so a phone clinging to one bar of signal doesn't hang forever. */
function fetchWithin(url: string, init: RequestInit = {}, ms = 10_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
}

export type SyncStatus = 'synced' | 'waiting' | 'syncing' | 'conflict' | 'needs-password';

interface Ctx {
  doc: SnookerDoc | null;
  loadError: string | null;
  online: boolean;
  syncStatus: SyncStatus;
  pending: number;
  syncNow(): Promise<void>;
  resolveConflict(keep: 'mine' | 'site'): Promise<void>;
  unlocked: boolean;
  unlock(pw: string): Promise<string | null>;
  lock(): void;
  /** Applies a change and saves it to this device; it reaches S3 on the next sync. */
  mutate(fn: (d: SnookerDoc) => void, done?: string): Promise<boolean>;
  upload(file: File): Promise<string | null>;
  toast(msg: string, kind?: 'ok' | 'bad'): void;
  toasts: { id: number; msg: string; kind: string }[];
}
const C = createContext<Ctx>(null!);
export const useStore = () => useContext(C);

/** Scales big phone photos down so they fit in a Vercel function request. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.84).split(',')[1];
}

function fromBase64(data: string) {
  return Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
}
function toBase64(buf: ArrayBuffer) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Every photo URL in the doc, so they can all be kept on the device. */
function photoUrls(d: SnookerDoc) {
  return [...d.gallery.map((g) => g.src), ...d.tournaments.flatMap((t) => (t.photo ? [t.photo] : []))];
}
function replacePhoto(d: SnookerDoc, from: string, to: string) {
  for (const g of d.gallery) if (g.src === from) g.src = to;
  for (const t of d.tournaments) if (t.photo === from) t.photo = to;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef(readLocal());
  const [doc, setDocState] = useState<SnookerDoc | null>(initial.current?.doc ?? null);
  const docRef = useRef(doc);
  const etag = useRef(initial.current?.etag ?? '');
  const pendingRef = useRef(initial.current?.pending ?? 0);
  const [pending, setPending] = useState(pendingRef.current);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(pendingRef.current ? 'waiting' : 'synced');
  const statusRef = useRef(syncStatus);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pw, setPw] = useState<string | null>(storedPassword);
  const pwRef = useRef(pw);
  pwRef.current = pw;
  const syncing = useRef(false);
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);

  const toast = useCallback((msg: string, kind: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'bad' ? 7000 : 3500);
  }, []);

  const status = useCallback((s: SyncStatus) => { statusRef.current = s; setSyncStatus(s); }, []);

  /** Writes the current state to this device. Returns false if the browser refused. */
  const persist = useCallback(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ doc: docRef.current, etag: etag.current, pending: pendingRef.current }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const setDoc = useCallback((d: SnookerDoc) => { docRef.current = d; setDocState(d); }, []);
  const setPendingCount = useCallback((n: number) => { pendingRef.current = n; setPending(n); }, []);

  /** Sends queued photos up and swaps their temporary local URLs for the real ones. */
  const uploadQueuedPhotos = useCallback(async () => {
    const queued = [...new Set(photoUrls(docRef.current!).filter((u) => u.startsWith(LOCAL_PHOTO_PREFIX)))];
    if (!queued.length) return;
    const cache = await caches.open(LOCAL_PHOTOS);
    for (const local of queued) {
      const hit = await cache.match(local);
      if (!hit) continue;
      const r = await fetchWithin('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-edit-password': pwRef.current ?? '' },
        body: JSON.stringify({ name: local.slice(LOCAL_PHOTO_PREFIX.length), type: 'image/jpeg', data: toBase64(await hit.arrayBuffer()) }),
      }, 30_000);
      if (r.status === 401) throw new AuthError();
      if (!r.ok) throw new Error('Photo upload failed');
      const { url } = await r.json();
      const next = structuredClone(docRef.current!);
      replacePhoto(next, local, url);
      setDoc(next);
      persist();
      await cache.delete(local);
    }
  }, [persist, setDoc]);

  /** Pushes this device's copy to S3. Reports what happened; never throws. */
  const sync = useCallback(async (): Promise<'ok' | 'offline' | 'blocked' | 'error'> => {
    if (syncing.current || pendingRef.current === 0 || !docRef.current) return 'ok';
    if (statusRef.current === 'conflict') return 'blocked';
    if (pwRef.current === null) { status('needs-password'); return 'blocked'; }
    syncing.current = true;
    status('syncing');
    let again = false;
    try {
      await uploadQueuedPhotos();
      const sent = pendingRef.current;
      const r = await fetchWithin('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-edit-password': pwRef.current },
        body: JSON.stringify({ doc: docRef.current, etag: etag.current }),
      }, 20_000);
      if (r.status === 409) { status('conflict'); return 'blocked'; }
      if (r.status === 401) throw new AuthError();
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        status('waiting');
        toast(j.error ? `Could not sync: ${j.error}` : 'Could not sync. Your changes are safe on this device.', 'bad');
        return 'error';
      }
      etag.current = (await r.json()).etag;
      // Edits made while this save was in flight stay queued for another go.
      setPendingCount(pendingRef.current - sent);
      persist();
      again = pendingRef.current > 0;
      status(again ? 'waiting' : 'synced');
      return 'ok';
    } catch (e) {
      if (e instanceof AuthError) {
        setPw(null);
        pwRef.current = null;
        try { localStorage.removeItem(PW_KEY); } catch { /* nothing stored */ }
        status('needs-password');
        toast('Wrong password, so nothing has synced. Your changes are safe: blow the whistle again.', 'bad');
        return 'blocked';
      }
      status('waiting');
      return 'offline';
    } finally {
      syncing.current = false;
      if (again) void sync();
    }
  }, [persist, setPendingCount, status, toast, uploadQueuedPhotos]);

  /** Gets the latest from S3, unless this device has changes it hasn't sent yet. */
  const refresh = useCallback(async () => {
    if (pendingRef.current > 0) { await sync(); return; }
    try {
      const r = await fetchWithin('/api/data');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load');
      if (pendingRef.current > 0) return; // An edit landed while we were fetching: keep it.
      etag.current = j.etag;
      setDoc(j.doc);
      persist();
      setLoadError(null);
    } catch (e: any) {
      if (!docRef.current) {
        setLoadError(e?.name === 'TypeError' || e?.name === 'AbortError'
          ? 'No connection, and no copy on this device yet. Open the site once with a connection and it will work offline after that.'
          : e.message);
      }
    }
  }, [persist, setDoc, sync]);

  useEffect(() => {
    void refresh();
    const goOnline = () => { setOnline(true); void refresh(); };
    const goOffline = () => setOnline(false);
    const onShow = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onShow);
    const timer = setInterval(() => { if (pendingRef.current > 0) void sync(); }, RETRY_MS);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onShow);
      clearInterval(timer);
    };
  }, [refresh, sync]);

  // Keep every photo on the device, including ones not looked at yet.
  useEffect(() => {
    if (!doc || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'cache-images', urls: photoUrls(doc).filter((u) => !u.startsWith(LOCAL_PHOTO_PREFIX)) });
    });
  }, [doc]);

  const syncNow = useCallback(async () => {
    const result = await sync();
    if (result === 'offline') toast('Still no connection. Your changes are safe on this device.', 'bad');
    else if (result === 'ok' && pendingRef.current === 0) toast('All synced.');
  }, [sync, toast]);

  const resolveConflict = useCallback<Ctx['resolveConflict']>(async (keep) => {
    try {
      const r = await fetchWithin('/api/data');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      etag.current = j.etag;
      if (keep === 'site') {
        setDoc(j.doc);
        setPendingCount(0);
        persist();
        status('synced');
        toast('Now showing the version from the site.');
      } else {
        persist();
        status('waiting');
        await sync();
      }
    } catch {
      toast('No connection right now. Try again when you are back online.', 'bad');
    }
  }, [persist, setDoc, setPendingCount, status, sync, toast]);

  const unlock = useCallback(async (attempt: string) => {
    let r: Response;
    try {
      r = await fetchWithin('/api/auth', { method: 'POST', headers: { 'x-edit-password': attempt } }, 6_000);
    } catch {
      // Can't check it from here. Let them carry on: it gets checked at the next sync.
      r = new Response('{}');
    }
    if (!r.ok) return (await r.json().catch(() => ({}))).error || 'Nope';
    setPw(attempt);
    pwRef.current = attempt;
    try { localStorage.setItem(PW_KEY, attempt); } catch { /* still unlocked for this visit */ }
    if (statusRef.current === 'needs-password') status('waiting');
    void sync();
    return null;
  }, [status, sync]);

  const lock = useCallback(() => {
    setPw(null);
    pwRef.current = null;
    try { localStorage.removeItem(PW_KEY); } catch { /* nothing stored */ }
  }, []);

  const mutate = useCallback<Ctx['mutate']>(async (fn, done) => {
    if (!docRef.current) return false;
    const previous = docRef.current;
    const next = structuredClone(previous);
    fn(next);
    setDoc(next);
    setPendingCount(pendingRef.current + 1);
    if (!persist()) {
      setDoc(previous);
      setPendingCount(pendingRef.current - 1);
      toast('This device refused to save that (storage may be full).', 'bad');
      return false;
    }
    if (statusRef.current === 'synced') status('waiting');
    if (done) toast(done);
    void sync();
    return true;
  }, [persist, setDoc, setPendingCount, status, sync, toast]);

  const upload = useCallback<Ctx['upload']>(async (file) => {
    let data: string;
    try {
      data = await shrink(file);
    } catch {
      toast('Could not read that image', 'bad');
      return null;
    }
    const name = file.name.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg';
    try {
      const r = await fetchWithin('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-edit-password': pwRef.current ?? '' },
        body: JSON.stringify({ name, type: 'image/jpeg', data }),
      }, 30_000);
      const j = await r.json();
      if (!r.ok) { toast(j.error || 'Upload failed', 'bad'); return null; }
      return j.url as string;
    } catch {
      // No connection: keep it on the device, and sync sends it up later.
      if (!navigator.serviceWorker?.controller) {
        toast('Could not upload that photo without a connection.', 'bad');
        return null;
      }
      const local = `${LOCAL_PHOTO_PREFIX}${uid('photo')}-${name}`;
      const cache = await caches.open(LOCAL_PHOTOS);
      await cache.put(local, new Response(fromBase64(data), { headers: { 'Content-Type': 'image/jpeg' } }));
      return local;
    }
  }, [toast]);

  const value = useMemo(
    () => ({ doc, loadError, online, syncStatus, pending, syncNow, resolveConflict, unlocked: pw !== null, unlock, lock, mutate, upload, toast, toasts }),
    [doc, loadError, online, syncStatus, pending, syncNow, resolveConflict, pw, unlock, lock, mutate, upload, toast, toasts],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

class AuthError extends Error {}
