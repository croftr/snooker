import { useMemo } from 'react';
import { Link } from 'wouter';
import { useStore } from '../lib/store';
import { championship, fmtDate, fmtNum, globalStats, liveTournament, standing } from '../lib/stats';
import type { PlayerId, SnookerDoc } from '../types';
import { PLAYERS } from '../types';
import { PlayerBall, Polaroid } from '../components/ui';

function Portrait({ doc, id, wins }: { doc: SnookerDoc; id: PlayerId; wins: number }) {
  const p = doc.players[id];
  return (
    <figure className={`portrait portrait-${id}`}>
      <div className="portrait-frame"><img src={p.portrait} alt={`${p.name} with a trophy`} /></div>
      <figcaption>
        <strong>{p.name}</strong>
        <span className="portrait-aka">a.k.a. {p.nick}</span>
        <span className="portrait-wins" aria-label={`${wins} tournaments won`}>
          {Array.from({ length: doc.championship.target }, (_, i) => (
            <span key={i} className={i < wins ? `ball ball-${id}` : 'ball ball-empty'} aria-hidden="true" />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

function Quotes({ doc }: { doc: SnookerDoc }) {
  const quotes = useMemo(() => {
    const out: string[] = [];
    for (const t of doc.tournaments) for (const s of t.sessions) for (const n of s.notes) {
      if (n.text.length > 14) out.push(n.text);
    }
    for (const r of doc.bonusRules) if (r.note) out.push(r.note);
    for (const d of doc.decrees) if (d.text.length > 14) out.push(d.text);
    return out;
  }, [doc]);
  const run = quotes.map((q, i) => <span key={i} className="tick-item"><span className="ball ball-red" aria-hidden="true" />{q}</span>);
  return (
    <div className="ticker" aria-label="Notes from the old scoresheet">
      <div className="ticker-run">{run}{run}</div>
    </div>
  );
}

export function Home() {
  const { doc } = useStore();
  const d = doc!;
  const live = liveTournament(d);
  const st = live ? standing(live) : null;
  const { wins, champion } = championship(d);
  const stats = globalStats(d);
  const toPlay = d.championship.target * 2 - 1;
  const road = Array.from({ length: Math.max(toPlay, d.tournaments.length) }, (_, i) => d.tournaments[i] ?? null);
  const big = stats.biggest;
  const leader = stats.lifetime.bob === stats.lifetime.mike ? null : stats.lifetime.bob > stats.lifetime.mike ? 'bob' : 'mike';

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <Portrait doc={d} id="bob" wins={wins.bob} />
          <div className="hero-mid">
            <p className="eyebrow">The official record · est. 2005</p>
            <h1 className="hero-title">Bob <em>v</em> Mike</h1>
            {champion && <p className="champ-banner">{d.players[champion].name} is the Champion</p>}
            {live && st ? (
              <Link href={`/tournaments/${live.id}`} className="board" aria-label={`${live.name}: ${d.players.bob.name} ${st.bob.total}, ${d.players.mike.name} ${st.mike.total}. Open the tournament.`}>
                <span className="board-live"><i /> {live.name} is live</span>
                <span className="board-row">
                  <span className="board-digit">{st.bob.total}</span>
                  <span className="board-v">
                    {live.format.type === 'race' ? `first to ${live.format.raceTo}` : `${st.played} of ${(live.format as any).sessions}`}
                  </span>
                  <span className="board-digit">{st.mike.total}</span>
                </span>
              </Link>
            ) : (
              <Link href="/tournaments" className="board">
                <span className="board-live">All tournaments settled</span>
                <span className="board-v">Blow the whistle and start the next one</span>
              </Link>
            )}
            <p className="hero-sub">{stats.daysSince !== null && <><b>{fmtNum(stats.daysSince)}</b> days since the last frame. Somebody book a table.</>}</p>
          </div>
          <Portrait doc={d} id="mike" wins={wins.mike} />
        </div>
      </section>

      <Quotes doc={d} />

      <section className="band band-dark">
        <div className="wrap">
          <h2 className="h2">The road to the title</h2>
          <p className="lede">{d.championship.note}.</p>
          <ol className="road">
            {road.map((t, i) => {
              const w = t ? standing(t).winner : null;
              const isLive = t && t.id === live?.id;
              const body = (
                <>
                  <span className={`road-ball ${w ? `ball ball-${w}` : isLive ? 'ball ball-white' : 'ball ball-empty'}`} aria-hidden="true" />
                  <b>{t ? t.name : `Tournament ${i + 1}`}</b>
                  <small>{t ? (w ? `${d.players[w].name} won` : isLive ? 'In play' : '') : 'If required'}</small>
                  {t && <small className="road-year">{t.year}</small>}
                </>
              );
              return <li key={i}>{t ? <Link href={`/tournaments/${t.id}`} className="road-stop">{body}</Link> : <div className="road-stop road-ghost">{body}</div>}</li>;
            })}
          </ol>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2 className="h2">By the numbers</h2>
          <div className="stats">
            <div className="stat stat-hero">
              <span className="micro">Longest time without snooker</span>
              <b>{fmtNum(stats.drought.days)} days</b>
              <small>{fmtDate(stats.drought.from)} to {fmtDate(stats.drought.to)}. That's {(stats.drought.days / 365.25).toFixed(1)} years of nobody potting anything.</small>
            </div>
            <div className="stat">
              <span className="micro">Lifetime frames (surviving records)</span>
              <b>{stats.lifetime.bob} – {stats.lifetime.mike}</b>
              <small>{leader ? `${d.players[leader].name} leads by ${Math.abs(stats.lifetime.bob - stats.lifetime.mike)}, in ${stats.sessions} sessions.` : `Dead level, after ${stats.sessions} sessions.`}</small>
            </div>
            <div className="stat">
              <span className="micro">Tournaments won</span>
              <b>{wins.bob} – {wins.mike}</b>
              <small>First to {d.championship.target}.</small>
            </div>
            {big && (
              <div className="stat">
                <span className="micro">Biggest thrashing</span>
                <b>{Math.max(big.s.bob, big.s.mike)} – {Math.min(big.s.bob, big.s.mike)}</b>
                <small>{d.players[big.s.bob > big.s.mike ? 'bob' : 'mike'].name}, {big.s.t.name}{big.s.date ? `, ${fmtDate(big.s.date)}` : ''}.</small>
              </div>
            )}
            <div className="stat">
              <span className="micro">Bonus points banked</span>
              <b>{stats.bonus.bob} – {stats.bonus.mike}</b>
              <small>{PLAYERS.map((p) => d.players[p].name).join(' – ')}. The 150 pointer remains at large.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="band band-dark">
        <div className="wrap">
          <div className="strip-head">
            <h2 className="h2">Evidence</h2>
            <Link href="/hall" className="btn btn-ghost">The whole Hall of Fame</Link>
          </div>
          <div className="strip">
            {d.gallery.slice(0, 4).map((g) => <Polaroid key={g.id} src={g.src} caption={g.caption} />)}
          </div>
          <div className="scratch-note"><PlayerBall id="bob" size={12} /> <PlayerBall id="mike" size={12} /> Yes, those hats are real. The heads are negotiable.</div>
        </div>
      </section>
    </>
  );
}
