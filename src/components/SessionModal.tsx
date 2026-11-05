import { useState } from 'react';
import type { Note, PlayerId, Session, Tournament } from '../types';
import { PLAYERS } from '../types';
import { useStore } from '../lib/store';
import { standing, today, uid } from '../lib/stats';
import { Modal, PlayerBall } from './ui';

function Stepper({ value, onChange, label, min = 0 }: { value: number; onChange(n: number): void; label: string; min?: number }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Less ${label}`}>−</button>
      <output>{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

export function SessionModal({ t, session, onClose, onWinner }: {
  t: Tournament;
  session: Session | null;
  onClose(): void;
  onWinner(p: PlayerId): void;
}) {
  const { doc, mutate } = useStore();
  const [date, setDate] = useState(session ? session.date ?? '' : today());
  const [frames, setFrames] = useState({ bob: session?.bob ?? 0, mike: session?.mike ?? 0 });
  const [bonus, setBonus] = useState({ bob: session?.bonusBob ?? 0, mike: session?.bonusMike ?? 0 });
  const [isVoid, setVoid] = useState(session?.isVoid ?? false);
  const [notes, setNotes] = useState<Note[]>(session?.notes ?? []);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const usesBonus = t.bonusValue > 0;
  const number = session ? t.sessions.findIndex((s) => s.id === session.id) + 1 : t.sessions.length + 1;

  const addRule = (p: PlayerId, id: string) => {
    const rule = doc!.bonusRules.find((r) => r.id === id);
    if (!rule) return;
    setBonus((b) => ({ ...b, [p]: b[p] + rule.points }));
    setNotes((n) => [...n, { author: null, text: `${doc!.players[p].name}: ${rule.text.toLowerCase()}`, date: null }]);
  };

  const save = async () => {
    const allNotes = draft.trim() ? [...notes, { author: null, text: draft.trim(), date: null }] : notes;
    const built: Session = {
      id: session?.id ?? uid('s'),
      date: date || null,
      bob: isVoid ? 0 : frames.bob,
      mike: isVoid ? 0 : frames.mike,
      // Keep the old sheet's "-" (scheme not running yet) unless a bonus has actually been added.
      bonusBob: usesBonus ? (bonus.bob === 0 && session?.bonusBob === null ? null : bonus.bob) : null,
      bonusMike: usesBonus ? (bonus.mike === 0 && session?.bonusMike === null ? null : bonus.mike) : null,
      notes: allNotes,
      ...(isVoid ? { isVoid: true } : {}),
    };
    const before = standing(t).winner;
    const sessions = session ? t.sessions.map((s) => (s.id === session.id ? built : s)) : [...t.sessions, built];
    const after = standing({ ...t, sessions }).winner;
    const ok = await mutate((d) => {
      d.tournaments.find((x) => x.id === t.id)!.sessions = sessions;
    }, session ? 'Scoresheet corrected. Nobody saw a thing.' : 'Session on the board. Chalk up.');
    if (!ok) return;
    onClose();
    if (after && !before) onWinner(after);
  };

  const remove = async () => {
    const ok = await mutate((d) => {
      const x = d.tournaments.find((y) => y.id === t.id)!;
      x.sessions = x.sessions.filter((s) => s.id !== session!.id);
    }, 'Session struck from the record.');
    if (ok) onClose();
  };

  return (
    <Modal title={`${session ? 'Fix' : 'Log'} session ${number}`} onClose={onClose} wide>
      <div className="form">
        <div className="session-top">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={isVoid} onChange={(e) => setVoid(e.target.checked)} />
            <span>Void match</span>
          </label>
        </div>

        <div className="session-players">
          {PLAYERS.map((p) => (
            <fieldset key={p} className="session-player" disabled={isVoid}>
              <legend><PlayerBall id={p} /> {doc!.players[p].name}</legend>
              <div className="micro">Frames</div>
              <Stepper label={`frames for ${doc!.players[p].name}`} value={frames[p]} onChange={(n) => setFrames({ ...frames, [p]: n })} />
              {usesBonus && (
                <>
                  <div className="micro">Bonus points</div>
                  <Stepper label={`bonus points for ${doc!.players[p].name}`} value={bonus[p]} onChange={(n) => setBonus({ ...bonus, [p]: n })} />
                  <select
                    className="rule-pick"
                    value=""
                    aria-label={`Award ${doc!.players[p].name} a bonus rule`}
                    onChange={(e) => addRule(p, e.target.value)}
                  >
                    <option value="">Award a bonus rule…</option>
                    {doc!.bonusRules.map((r) => <option key={r.id} value={r.id}>+{r.points}: {r.text}</option>)}
                  </select>
                </>
              )}
            </fieldset>
          ))}
        </div>

        <div className="field">
          <span>Notes for posterity</span>
          {notes.map((n, i) => (
            <div key={i} className="note-edit">
              <span>{n.text}</span>
              <button type="button" className="modal-x" aria-label="Remove note" onClick={() => setNotes(notes.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <textarea rows={2} value={draft} placeholder="Taxi called. Mike was in the lead, allegedly." onChange={(e) => setDraft(e.target.value)} />
        </div>

        <footer className="form-foot">
          {session && (confirming ? (
            <button type="button" className="btn btn-danger" onClick={remove}>Yes, delete it</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>Delete session</button>
          ))}
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={save}>{session ? "Save changes" : "Put it on the board"}</button>
        </footer>
      </div>
    </Modal>
  );
}
