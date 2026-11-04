import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SnookerDoc } from '../types';

const PW_KEY = 'snooker-referee';
function stored() { try { return localStorage.getItem(PW_KEY); } catch { return null; } }

interface Ctx {
  doc: SnookerDoc | null;
  loadError: string | null;
  saving: boolean;
  unlocked: boolean;
  unlock(pw: string): Promise<string | null>;
  lock(): void;
  /** Applies a change to a copy of the doc and saves it. Resolves false if the save failed. */
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<SnookerDoc | null>(null);
  const etag = useRef('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState<string | null>(stored);
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);

  const toast = useCallback((msg: string, kind: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'bad' ? 7000 : 3500);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch('/api/data');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Could not load');
    etag.current = j.etag;
    setDoc(j.doc);
  }, []);

  useEffect(() => { load().catch((e) => setLoadError(e.message)); }, [load]);

  const unlock = useCallback(async (attempt: string) => {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'x-edit-password': attempt } });
    if (!r.ok) return (await r.json()).error || 'Nope';
    setPw(attempt);
    try { localStorage.setItem(PW_KEY, attempt); } catch { /* still unlocked for this visit */ }
    return null;
  }, []);

  const lock = useCallback(() => {
    setPw(null);
    try { localStorage.removeItem(PW_KEY); } catch { /* nothing stored */ }
  }, []);

  const mutate = useCallback<Ctx['mutate']>(async (fn, done) => {
    if (!doc) return false;
    const next = structuredClone(doc);
    fn(next);
    setSaving(true);
    try {
      const r = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-edit-password': pw ?? '' },
        body: JSON.stringify({ doc: next, etag: etag.current }),
      });
      const j = await r.json();
      if (r.status === 409) {
        await load();
        toast('Someone else saved first. Their version is loaded now, so please make your change again.', 'bad');
        return false;
      }
      if (r.status === 401) { lock(); toast('Password no longer valid. Blow the whistle again.', 'bad'); return false; }
      if (!r.ok) { toast(j.error || 'Save failed', 'bad'); return false; }
      etag.current = j.etag;
      setDoc(next);
      if (done) toast(done);
      return true;
    } catch {
      toast('Save failed. Are you online?', 'bad');
      return false;
    } finally {
      setSaving(false);
    }
  }, [doc, pw, load, lock, toast]);

  const upload = useCallback<Ctx['upload']>(async (file) => {
    try {
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-edit-password': pw ?? '' },
        body: JSON.stringify({ name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: await shrink(file) }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || 'Upload failed', 'bad'); return null; }
      return j.url as string;
    } catch {
      toast('Could not read or upload that image', 'bad');
      return null;
    }
  }, [pw, toast]);

  const value = useMemo(
    () => ({ doc, loadError, saving, unlocked: pw !== null, unlock, lock, mutate, upload, toast, toasts }),
    [doc, loadError, saving, pw, unlock, lock, mutate, upload, toast, toasts],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
