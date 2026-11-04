import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PlayerId } from '../types';
import { useStore } from '../lib/store';

export const PlayerBall = ({ id, size }: { id: PlayerId; size?: number }) => (
  <span className={`ball ball-${id}`} style={size ? { width: size, height: size } : undefined} aria-hidden="true" />
);

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="modal-inner">
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export type Field =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'date'; required?: boolean; step?: string; min?: number; help?: string; when?: (v: Record<string, any>) => boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; help?: string; when?: (v: Record<string, any>) => boolean };

/** A small generic form, used for everything that isn't a session. */
export function FormModal({ title, fields, initial, submit, onSubmit, onDelete, deleteLabel, onClose }: {
  title: string;
  fields: Field[];
  initial: Record<string, any>;
  submit: string;
  onSubmit(v: Record<string, any>): Promise<boolean | void> | void;
  onDelete?(): Promise<boolean | void> | void;
  deleteLabel?: string;
  onClose(): void;
}) {
  const [v, setV] = useState(initial);
  const [confirming, setConfirming] = useState(false);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    const clean = { ...v };
    for (const f of fields) if (f.type === 'number') clean[f.key] = Number(clean[f.key]);
    if ((await onSubmit(clean)) !== false) onClose();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go} className="form">
        {fields.filter((f) => !f.when || f.when(v)).map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            {f.type === 'select' ? (
              <select value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows={3} value={v[f.key] ?? ''} required={f.required} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            ) : (
              <input type={f.type} value={v[f.key] ?? ''} required={f.required} step={f.step} min={f.min} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            )}
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        <footer className="form-foot">
          {onDelete && (confirming ? (
            <button type="button" className="btn btn-danger" onClick={async () => { if ((await onDelete()) !== false) onClose(); }}>
              Yes, really delete
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>{deleteLabel ?? 'Delete'}</button>
          ))}
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn">{submit}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function Polaroid({ src, caption, tilt = 0, onClick }: { src: string; caption: string; tilt?: number; onClick?(): void }) {
  const inner = (
    <>
      <span className="polaroid-img"><img src={src} alt={caption} loading="lazy" /></span>
      <span className="polaroid-cap">{caption}</span>
    </>
  );
  return onClick ? (
    <button className="polaroid" style={{ '--tilt': `${tilt}deg` } as any} onClick={onClick}>{inner}</button>
  ) : (
    <figure className="polaroid" style={{ '--tilt': `${tilt}deg` } as any}>{inner}</figure>
  );
}

export function PhotoButton({ label, onPhoto }: { label: string; onPhoto(url: string): void }) {
  const { upload } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`btn btn-ghost ${busy ? 'is-busy' : ''}`}>
      {busy ? 'Uploading…' : label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          const url = await upload(f);
          setBusy(false);
          if (url) onPhoto(url);
        }}
      />
    </label>
  );
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
