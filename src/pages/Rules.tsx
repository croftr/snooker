import { useState } from 'react';
import { useStore } from '../lib/store';
import { liveTournament, uid } from '../lib/stats';
import type { BonusRule, Decree, PlantBoyEvent, SnookerDoc } from '../types';
import { PLAYERS } from '../types';
import { FormModal, PlayerBall } from '../components/ui';

const TIERS = [
  { min: 100, name: 'Mythical', cls: 'tier-myth' },
  { min: 15, name: 'Legendary', cls: 'tier-legend' },
  { min: 8, name: 'Rare', cls: 'tier-rare' },
  { min: 2, name: 'Decent', cls: 'tier-decent' },
  { min: 0, name: 'Pub regular', cls: 'tier-common' },
];
const tierOf = (points: number) => TIERS.find((t) => points >= t.min)!;

function bestSessionBonus(d: SnookerDoc) {
  let best = 0;
  for (const t of d.tournaments) for (const s of t.sessions) best = Math.max(best, s.bonusBob ?? 0, s.bonusMike ?? 0);
  return best;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function Rules() {
  const { doc, unlocked, mutate } = useStore();
  const d = doc!;
  const [rule, setRule] = useState<BonusRule | 'new' | null>(null);
  const [decree, setDecree] = useState<Decree | 'new' | null>(null);
  const [event, setEvent] = useState<PlantBoyEvent | 'new' | null>(null);
  const [definition, setDefinition] = useState(false);

  const live = liveTournament(d);
  const bpValue = live?.bonusValue || 0.1;
  const rules = [...d.bonusRules].sort((a, b) => a.points - b.points);
  const best = bestSessionBonus(d);
  const pb = d.plantBoy;
  const raceT = [...d.tournaments].reverse().find((t) => t.format.type === 'race');

  const setHolder = (p: 'bob' | 'mike', rank: string) =>
    mutate((x) => { x.plantBoy.holders[p] = x.plantBoy.holders[p] === rank ? null : rank; }, 'The ladder has been updated.');

  return (
    <div className="rules">
      <header className="page-head wrap">
        <p className="eyebrow">Binding on both parties. Disputed by at least one.</p>
        <h1 className="page-title">The Rules</h1>
      </header>

      <section className="wrap house">
        <div className="house-card">
          <span className="micro">How you win a tournament</span>
          <b>{raceT?.format.type === 'race' ? raceT.format.raceTo : 25}</b>
          <p>First player to reach {raceT?.format.type === 'race' ? raceT.format.raceTo : 25} frames.</p>
        </div>
        <div className="house-card">
          <span className="micro">How you win the title</span>
          <b>{d.championship.target}</b>
          <p>{d.championship.note}.</p>
        </div>
        <div className="house-card">
          <span className="micro">What a bonus point is worth</span>
          <b>{bpValue}</b>
          <p>Of a frame. Ten bonus points make one whole frame, in the grand total.</p>
        </div>
      </section>

      <section className="wrap">
        <div className="strip-head">
          <h2 className="h2">The bonus point menu</h2>
          {unlocked && <button className="btn" onClick={() => setRule('new')}>Add a rule</button>}
        </div>
        <div className="cards">
          {rules.map((r) => {
            const tier = tierOf(r.points);
            return (
              <article key={r.id} className={`rule-card ${tier.cls}`}>
                <div className="rule-top">
                  <span className="rule-tier">{tier.name}</span>
                  <span className="rule-frames">{round(r.points * bpValue)} {r.points * bpValue === 1 ? 'frame' : 'frames'}</span>
                </div>
                <div className="rule-points">{r.points}<small>BP</small></div>
                <p className="rule-text">{r.text}</p>
                {r.note && <p className="rule-note">“{r.note}”</p>}
                {r.points > best && <p className="rule-never">Never claimed in the surviving records</p>}
                {unlocked && <button className="sheet-edit rule-fix" onClick={() => setRule(r)} aria-label={`Edit rule: ${r.text}`}>Fix</button>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="wrap">
        <div className="strip-head">
          <h2 className="h2">Decrees</h2>
          {unlocked && <button className="btn btn-ghost" onClick={() => setDecree('new')}>Issue a decree</button>}
        </div>
        <div className="decrees">
          {d.decrees.map((x, i) => (
            <div key={x.id} className="decree" style={{ '--tilt': `${i % 2 ? 1.2 : -1}deg` } as any}>
              <p>{x.text}</p>
              {unlocked && <button className="sheet-edit" onClick={() => setDecree(x)} aria-label={`Edit decree: ${x.text}`}>Fix</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="band-dark band ladder-section" id="plant-boy">
        <div className="wrap ladder-grid">
          <div>
            <h2 className="h2">The Plant Boy ladder</h2>
            <p className="lede">
              {pb.definition || 'What exactly is a Plant Boy? If you have to ask, you are not one.'}
              {unlocked && <> <button className="sheet-edit" onClick={() => setDefinition(true)}>Fix</button></>}
            </p>
            <h3 className="h3">How it went down</h3>
            <ul className="pb-history">
              {pb.history.map((h) => (
                <li key={h.id}>
                  <span>{h.period}</span>
                  <b>{h.text}</b>
                  {unlocked && <button className="sheet-edit" onClick={() => setEvent(h)} aria-label={`Edit ${h.text}`}>Fix</button>}
                </li>
              ))}
            </ul>
            {unlocked && <button className="btn btn-ghost" onClick={() => setEvent('new')}>Add to the history</button>}
          </div>
          <ol className="ladder" aria-label="Plant Boy ranks, from highest to lowest">
            {[...pb.ranks].reverse().map((rank) => (
              <li key={rank} className="rung">
                <span className="rung-name">{rank}</span>
                <span className="rung-who">
                  {PLAYERS.map((p) => {
                    const here = pb.holders[p] === rank;
                    if (unlocked) {
                      return (
                        <button key={p} className={`rung-btn ${here ? 'on' : ''}`} aria-pressed={here} onClick={() => setHolder(p, rank)} aria-label={`${d.players[p].name}: ${rank}`}>
                          <PlayerBall id={p} size={here ? 26 : 16} />
                        </button>
                      );
                    }
                    return here ? <span key={p} className="rung-holder"><PlayerBall id={p} size={26} /> {d.players[p].nick}</span> : null;
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {rule && (
        <FormModal
          title={rule === 'new' ? 'A new bonus rule' : 'Amend the rule'}
          fields={[
            { key: 'text', label: 'To earn it', type: 'textarea', required: true },
            { key: 'points', label: 'Bonus points', type: 'number', min: 0, required: true },
            { key: 'note', label: 'Footnote (optional)', type: 'textarea' },
          ]}
          initial={rule === 'new' ? { text: '', points: 1, note: '' } : { ...rule, note: rule.note ?? '' }}
          submit="Make it law"
          onClose={() => setRule(null)}
          deleteLabel="Repeal"
          onDelete={rule === 'new' ? undefined : () => mutate((x) => { x.bonusRules = x.bonusRules.filter((y) => y.id !== (rule as BonusRule).id); }, 'Repealed.')}
          onSubmit={(v) => mutate((x) => {
            const built: BonusRule = { id: rule === 'new' ? uid('r') : rule.id, text: v.text.trim(), points: v.points };
            if (v.note?.trim()) built.note = v.note.trim();
            if (rule === 'new') x.bonusRules.push(built);
            else x.bonusRules = x.bonusRules.map((y) => (y.id === rule.id ? built : y));
          }, 'It is now the law.')}
        />
      )}
      {decree && (
        <FormModal
          title={decree === 'new' ? 'Issue a decree' : 'Amend the decree'}
          fields={[{ key: 'text', label: 'It is hereby decreed', type: 'textarea', required: true }]}
          initial={{ text: decree === 'new' ? '' : decree.text }}
          submit="So decreed"
          onClose={() => setDecree(null)}
          deleteLabel="Strike it out"
          onDelete={decree === 'new' ? undefined : () => mutate((x) => { x.decrees = x.decrees.filter((y) => y.id !== (decree as Decree).id); })}
          onSubmit={(v) => mutate((x) => {
            if (decree === 'new') x.decrees.push({ id: uid('d'), text: v.text.trim() });
            else x.decrees.find((y) => y.id === decree.id)!.text = v.text.trim();
          })}
        />
      )}
      {event && (
        <FormModal
          title="Plant Boy history"
          fields={[
            { key: 'period', label: 'When', type: 'text', required: true },
            { key: 'text', label: 'What happened', type: 'text', required: true },
          ]}
          initial={event === 'new' ? { period: '', text: '' } : event}
          submit="Record it"
          onClose={() => setEvent(null)}
          onDelete={event === 'new' ? undefined : () => mutate((x) => { x.plantBoy.history = x.plantBoy.history.filter((y) => y.id !== (event as PlantBoyEvent).id); })}
          onSubmit={(v) => mutate((x) => {
            const built = { id: event === 'new' ? uid('h') : event.id, period: v.period.trim(), text: v.text.trim() };
            if (event === 'new') x.plantBoy.history.push(built);
            else x.plantBoy.history = x.plantBoy.history.map((y) => (y.id === built.id ? built : y));
          })}
        />
      )}
      {definition && (
        <FormModal
          title="What is a Plant Boy?"
          fields={[{ key: 'definition', label: 'For the avoidance of doubt', type: 'textarea' }]}
          initial={{ definition: pb.definition }}
          submit="Save"
          onClose={() => setDefinition(false)}
          onSubmit={(v) => mutate((x) => { x.plantBoy.definition = v.definition.trim(); })}
        />
      )}
    </div>
  );
}
