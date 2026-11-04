import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Link, useLocation } from 'wouter';
import { useStore } from '../lib/store';
import { championship, fmtDate, liveTournament, standing, uid } from '../lib/stats';
import type { PlayerId, Session, SnookerDoc, Tournament } from '../types';
import { PLAYERS } from '../types';
import { FormModal, Modal, PhotoButton, PlayerBall, Polaroid, type Field } from '../components/ui';
import { WormChart } from '../components/WormChart';
import { SessionModal } from '../components/SessionModal';

const BALL_COLOURS = ['#e4283a', '#ffd92e', '#17a35c', '#94572a', '#2b84e8', '#ff9dc0', '#17171b', '#fffdf4'];

function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const shot = (x: number) => confetti({ particleCount: 90, spread: 80, origin: { x, y: 0.7 }, colors: BALL_COLOURS, shapes: ['circle'], scalar: 1.5 });
  shot(0.25); shot(0.75);
  setTimeout(() => shot(0.5), 300);
}

const tournamentFields: Field[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'year', label: 'Year', type: 'text', required: true },
  { key: 'type', label: 'Format', type: 'select', options: [{ value: 'race', label: 'Race to a number of frames' }, { value: 'league', label: 'League over a set number of sessions' }] },
  { key: 'raceTo', label: 'Frames to win', type: 'number', min: 1, required: true, when: (v) => v.type === 'race' },
  { key: 'sessions', label: 'Number of sessions', type: 'number', min: 1, required: true, when: (v) => v.type === 'league' },
  { key: 'win', label: 'Points for a win', type: 'number', min: 0, required: true, when: (v) => v.type === 'league' },
  { key: 'draw', label: 'Points for a draw', type: 'number', min: 0, required: true, when: (v) => v.type === 'league' },
  { key: 'bonusValue', label: 'A bonus point is worth this many frames', type: 'number', step: '0.01', min: 0, required: true, help: 'Tournaments 3 and 4 use 0.1. Set to 0 for no bonus points.' },
];

function applyTournament(t: Tournament, v: Record<string, any>) {
  t.name = v.name.trim();
  t.year = v.year.trim();
  t.bonusValue = v.bonusValue;
  if (t.format.type !== 'lost') {
    t.format = v.type === 'league'
      ? { type: 'league', sessions: v.sessions, win: v.win, draw: v.draw }
      : { type: 'race', raceTo: v.raceTo };
  }
}

function Tabs({ doc, id }: { doc: SnookerDoc; id: string }) {
  const { unlocked, mutate } = useStore();
  const [, go] = useLocation();
  const [adding, setAdding] = useState(false);
  const live = liveTournament(doc);
  const num = doc.tournaments.length + 1;
  return (
    <div className="tabs" role="tablist" aria-label="Tournaments">
      {doc.tournaments.map((t) => (
        <Link key={t.id} href={`/tournaments/${t.id}`} role="tab" aria-selected={t.id === id} className={`tab ${t.id === id ? 'on' : ''}`}>
          {t.id === live?.id && <i className="live-dot" aria-label="Live" />}
          {t.name}
          <small>{t.year}</small>
        </Link>
      ))}
      {unlocked && <button className="tab tab-add" onClick={() => setAdding(true)}>+ New tournament</button>}
      {adding && (
        <FormModal
          title="A new tournament"
          fields={tournamentFields}
          initial={{ name: `Tournament ${num}`, year: String(new Date().getFullYear()), type: 'race', raceTo: 25, sessions: 30, win: 3, draw: 1, bonusValue: 0.1 }}
          submit="Rack 'em up"
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            const nt: Tournament = { id: uid('t'), name: '', year: '', format: { type: 'race', raceTo: 25 }, bonusValue: 0.1, notes: [], sessions: [] };
            applyTournament(nt, v);
            const ok = await mutate((d) => { d.tournaments.push(nt); }, `${nt.name} is go.`);
            if (ok) go(`/tournaments/${nt.id}`);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function Flood({ t, doc }: { t: Tournament; doc: SnookerDoc }) {
  return (
    <section className="flood">
      <div className="flood-sky">
        <p className="eyebrow">{t.name} · {t.year}</p>
        <h1 className="flood-title">{t.notes[0] ?? 'Lost'}</h1>
        {t.winner && <p className="flood-winner"><PlayerBall id={t.winner} size={24} /> Winner: {doc.players[t.winner].nick}. We have only the word of the survivors.</p>}
        {t.photo && <div className="flood-photo"><Polaroid src={t.photo} caption={`${doc.players[t.winner ?? 'mike'].name}, before the water came`} tilt={-5} /></div>}
      </div>
      <div className="flood-water" aria-hidden="true">
        <span className="float float-a ball ball-red" />
        <span className="float float-b ball ball-black" />
        <span className="float float-c paper">Session ?<br />?? – ??</span>
        <span className="float float-d ball ball-pink" />
        <svg className="wave wave-1" viewBox="0 0 1200 80" preserveAspectRatio="none"><path d="M0 40 Q150 0 300 40 T600 40 T900 40 T1200 40 V80 H0Z" /></svg>
        <svg className="wave wave-2" viewBox="0 0 1200 80" preserveAspectRatio="none"><path d="M0 40 Q150 80 300 40 T600 40 T900 40 T1200 40 V80 H0Z" /></svg>
      </div>
      <div className="flood-deep">
        <dl className="flood-tally">
          <div><dt>Sessions recovered</dt><dd>{t.sessions.length}</dd></div>
          <div><dt>Frames recovered</dt><dd>0</dd></div>
          <div><dt>Excuses recovered</dt><dd>All of them</dd></div>
        </dl>
      </div>
    </section>
  );
}

function Scorecard({ t, doc, st }: { t: Tournament; doc: SnookerDoc; st: ReturnType<typeof standing> }) {
  const showBonus = t.bonusValue > 0;
  return (
    <div className="versus">
      {PLAYERS.map((p, i) => {
        const line = st[p];
        return (
          <div key={p} className={`versus-side ${st.winner === p ? 'is-winner' : ''}`} style={{ order: i * 2 }}>
            <img src={doc.players[p].portrait} alt="" className="versus-face" />
            <div>
              <div className="versus-name"><PlayerBall id={p} size={16} /> {doc.players[p].name}{st.winner === p && <span className="ribbon">Winner</span>}</div>
              <div className="versus-score">{showBonus ? line.total : t.format.type === 'league' ? line.points : line.frames}</div>
              <div className="micro">
                {showBonus ? `${line.frames} frames + ${line.bonus} BP` : t.format.type === 'league' ? `${line.frames} frames` : ''}
              </div>
            </div>
          </div>
        );
      })}
      <div className="versus-v" style={{ order: 1 }}>v</div>
    </div>
  );
}

function RaceTrack({ t, doc, st }: { t: Tournament; doc: SnookerDoc; st: ReturnType<typeof standing> }) {
  if (t.format.type !== 'race') return null;
  const target = t.format.raceTo;
  return (
    <div className="race" aria-label={`Race to ${target} frames`}>
      {PLAYERS.map((p) => (
        <div key={p} className="race-lane">
          <span className="race-name">{doc.players[p].name}</span>
          <div className="race-rail">
            {Array.from({ length: target - 1 }, (_, i) => <i key={i} style={{ left: `${((i + 1) / target) * 100}%` }} className={(i + 1) % 5 === 0 ? 'five' : ''} />)}
            <span className={`ball ball-${p} race-ball`} style={{ left: `${Math.min(1, st[p].frames / target) * 100}%` }} aria-hidden="true" />
            <span className="race-pocket" aria-hidden="true" />
          </div>
          <span className="race-num">{st[p].frames}<small>/{target}</small></span>
        </div>
      ))}
    </div>
  );
}

function League({ t, doc, st }: { t: Tournament; doc: SnookerDoc; st: ReturnType<typeof standing> }) {
  if (t.format.type !== 'league') return null;
  const order = [...PLAYERS].sort((a, b) => st[b].points - st[a].points);
  return (
    <div className="scroll-x">
      <table className="league">
        <thead><tr><th scope="col">Table</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Drawn</th><th scope="col">Lost</th><th scope="col">For</th><th scope="col">Against</th><th scope="col">Diff</th><th scope="col">Points</th></tr></thead>
        <tbody>
          {order.map((p) => {
            const l = st[p];
            const diff = l.frames - l.against;
            return (
              <tr key={p}>
                <th scope="row"><PlayerBall id={p} size={14} /> {doc.players[p].name}</th>
                <td>{st.played}</td><td>{l.won}</td><td>{l.drawn}</td><td>{l.lost}</td><td>{l.frames}</td><td>{l.against}</td>
                <td>{diff > 0 ? `+${diff}` : diff}</td><td className="league-pts">{l.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Scoresheet({ t, doc, onEdit }: { t: Tournament; doc: SnookerDoc; onEdit(s: Session): void }) {
  const { unlocked } = useStore();
  const showBonus = t.bonusValue > 0;
  const cols = 4 + (showBonus ? 2 : 0) + (unlocked ? 1 : 0);
  return (
    <div className="chalkboard">
      <h2 className="chalk-title">The scoresheet</h2>
      <div className="scroll-x">
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">When</th>
              <th scope="col">{doc.players.bob.name}</th><th scope="col">{doc.players.mike.name}</th>
              {showBonus && <><th scope="col" title={`Bonus points for ${doc.players.bob.name}`}>BP {doc.players.bob.name}</th><th scope="col" title={`Bonus points for ${doc.players.mike.name}`}>BP {doc.players.mike.name}</th></>}
              {unlocked && <th scope="col"><span className="sr-only">Edit</span></th>}
            </tr>
          </thead>
          <tbody>
            {t.sessions.length === 0 && (
              <tr><td colSpan={cols} className="sheet-empty">Not a ball struck yet. The table awaits.</td></tr>
            )}
            {t.sessions.map((s, i) => (
              <SheetRow key={s.id} s={s} n={i + 1} showBonus={showBonus} doc={doc} cols={cols} unlocked={unlocked} onEdit={() => onEdit(s)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetRow({ s, n, showBonus, doc, cols, unlocked, onEdit }: { s: Session; n: number; showBonus: boolean; doc: SnookerDoc; cols: number; unlocked: boolean; onEdit(): void }) {
  const win: PlayerId | null = s.isVoid || s.bob === s.mike ? null : s.bob > s.mike ? 'bob' : 'mike';
  const bp = (v: number | null) => (v === null ? '–' : v === 0 ? '·' : `+${v}`);
  return (
    <>
      <tr className={s.isVoid ? 'is-void' : ''}>
        <td className="sheet-n">{n}</td>
        <td className="sheet-date">{fmtDate(s.date)}</td>
        {s.isVoid ? (
          <td colSpan={2} className="sheet-void"><span className="stamp">Void</span></td>
        ) : (
          <>
            <td className={win === 'bob' ? 'sheet-win' : ''}>{s.bob}</td>
            <td className={win === 'mike' ? 'sheet-win' : ''}>{s.mike}</td>
          </>
        )}
        {showBonus && <><td className={s.bonusBob ? 'sheet-bp' : 'sheet-dim'}>{bp(s.bonusBob)}</td><td className={s.bonusMike ? 'sheet-bp' : 'sheet-dim'}>{bp(s.bonusMike)}</td></>}
        {unlocked && <td><button className="sheet-edit" onClick={onEdit} aria-label={`Edit session ${n}`}>Fix</button></td>}
      </tr>
      {s.notes.length > 0 && (
        <tr className="sheet-notes">
          <td colSpan={cols}>
            {s.notes.map((note, i) => (
              <span key={i} className="sticky">
                {note.text}
                {note.author && <em> ({doc.players[note.author].name})</em>}
              </span>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function Winner({ p, doc, champion, onClose }: { p: PlayerId; doc: SnookerDoc; champion: boolean; onClose(): void }) {
  useEffect(() => { celebrate(); }, []);
  return (
    <Modal title={champion ? 'We have a new Champion' : 'Frame, match, tournament'} onClose={onClose}>
      <div className="winner-pop">
        <img src={doc.players[p].portrait} alt="" />
        <p className="winner-name">{doc.players[p].name}!</p>
        <p>{champion ? `First to ${doc.championship.target}. The title is settled, until someone disputes it.` : 'Takes the tournament. Commiserations will be offered in the bar.'}</p>
        <button className="btn" onClick={onClose}>Shake hands</button>
      </div>
    </Modal>
  );
}

export function TournamentPage({ id }: { id: string }) {
  const { doc, unlocked, mutate } = useStore();
  const d = doc!;
  const t = d.tournaments.find((x) => x.id === id);
  const [, go] = useLocation();
  const [editing, setEditing] = useState<Session | 'new' | null>(null);
  const [settings, setSettings] = useState(false);
  const [noteDraft, setNoteDraft] = useState(false);
  const [winner, setWinner] = useState<PlayerId | null>(null);

  if (!t) {
    return (
      <div className="wrap band">
        <Tabs doc={d} id={id} />
        <p className="lede">No such tournament. Perhaps it was also lost in the flood.</p>
      </div>
    );
  }

  const st = standing(t);
  const lost = t.format.type === 'lost';
  const { champion } = championship(d);

  return (
    <div className="tpage">
      <div className="wrap tabs-wrap"><Tabs doc={d} id={id} /></div>
      {lost ? <Flood t={t} doc={d} /> : (
        <div className="wrap tgrid">
          <div className="tmain">
            <header className="thead">
              <div>
                <p className="eyebrow">
                  {t.year} · {t.format.type === 'race' ? `First player to reach ${t.format.raceTo} frames` : t.format.type === 'league' ? `${t.format.sessions} sessions, ${t.format.win} for a win, ${t.format.draw} for a draw` : ''}
                </p>
                <h1 className="ttitle">{t.name}</h1>
              </div>
              {unlocked && !st.winner && <button className="btn btn-big" onClick={() => setEditing('new')}>Log a session</button>}
              {unlocked && st.winner && <button className="btn btn-ghost" onClick={() => setEditing('new')}>Log another session</button>}
            </header>
            <Scorecard t={t} doc={d} st={st} />
            <RaceTrack t={t} doc={d} st={st} />
            <League t={t} doc={d} st={st} />
            {t.sessions.length > 0 && (
              <section className="panel">
                <h2 className="h3">The worm</h2>
                <WormChart t={t} doc={d} />
              </section>
            )}
            <Scoresheet t={t} doc={d} onEdit={setEditing} />
          </div>
          <aside className="tside">
            {t.photo && <Polaroid src={t.photo} caption={t.name} tilt={2.5} />}
            {t.notes.length > 0 && (
              <div className="pinned">
                {t.notes.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
            {unlocked && (
              <div className="ref-tools">
                <PhotoButton label={t.photo ? 'Change photo' : 'Add a photo'} onPhoto={(url) => mutate((x) => { x.tournaments.find((y) => y.id === t.id)!.photo = url; }, 'Photo pinned up.')} />
                <button className="btn btn-ghost" onClick={() => setNoteDraft(true)}>Add a note</button>
                <button className="btn btn-ghost" onClick={() => setSettings(true)}>Tournament settings</button>
              </div>
            )}
          </aside>
        </div>
      )}
      {lost && unlocked && (
        <div className="wrap ref-tools ref-row">
          <button className="btn btn-ghost" onClick={() => setSettings(true)}>Tournament settings</button>
        </div>
      )}

      {editing && (
        <SessionModal
          t={t}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onWinner={setWinner}
        />
      )}
      {noteDraft && (
        <FormModal
          title="Add a note"
          fields={[{ key: 'text', label: 'Note', type: 'textarea', required: true }]}
          initial={{ text: '' }}
          submit="Pin it up"
          onClose={() => setNoteDraft(false)}
          onSubmit={(v) => mutate((x) => { x.tournaments.find((y) => y.id === t.id)!.notes.push(v.text.trim()); })}
        />
      )}
      {settings && (
        <FormModal
          title={`${t.name} settings`}
          fields={lost ? tournamentFields.filter((f) => f.key === 'name' || f.key === 'year') : tournamentFields}
          initial={{
            name: t.name, year: t.year, bonusValue: t.bonusValue,
            type: t.format.type === 'league' ? 'league' : 'race',
            raceTo: t.format.type === 'race' ? t.format.raceTo : 25,
            sessions: t.format.type === 'league' ? t.format.sessions : 30,
            win: t.format.type === 'league' ? t.format.win : 3,
            draw: t.format.type === 'league' ? t.format.draw : 1,
          }}
          submit="Save"
          onClose={() => setSettings(false)}
          onSubmit={(v) => mutate((x) => { applyTournament(x.tournaments.find((y) => y.id === t.id)!, v); }, 'Settings saved.')}
          deleteLabel="Delete tournament"
          onDelete={async () => {
            const ok = await mutate((x) => { x.tournaments = x.tournaments.filter((y) => y.id !== t.id); }, `${t.name} has met with an accident.`);
            if (ok) go('/tournaments');
            return ok;
          }}
        />
      )}
      {winner && <Winner p={winner} doc={d} champion={champion === winner} onClose={() => setWinner(null)} />}
    </div>
  );
}
