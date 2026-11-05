import type { Format, Session, SnookerDoc, Tournament } from '../types';
import { fmtDate } from './stats';

/*
 * Works out what an edit did by comparing the doc before and after it, so every
 * edit in the app gets logged without each screen having to remember to.
 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function formatLabel(f: Format) {
  if (f.type === 'race') return `race to ${f.raceTo}`;
  if (f.type === 'league') return `league of ${f.sessions} sessions, ${f.win} for a win, ${f.draw} for a draw`;
  return 'lost';
}

/** Added, removed and edited items of a list whose items have ids. */
function listChanges<T extends { id: string }>(before: T[], after: T[], noun: string, label: (x: T) => string) {
  const out: string[] = [];
  for (const x of after) {
    const old = before.find((y) => y.id === x.id);
    if (!old) out.push(`${noun} added: ${label(x)}`);
    else if (!same(old, x)) out.push(`${noun} changed: ${label(old)} → ${label(x)}`);
  }
  for (const x of before) {
    if (!after.some((y) => y.id === x.id)) out.push(`${noun} removed: ${label(x)}`);
  }
  return out;
}

function sessionChanges(t: Tournament, before: Session[], after: Session[], doc: SnookerDoc) {
  const bob = doc.players.bob.name;
  const mike = doc.players.mike.name;
  const summary = (s: Session) => {
    const bonus = [
      s.bonusBob ? `${bob} +${s.bonusBob} BP` : '',
      s.bonusMike ? `${mike} +${s.bonusMike} BP` : '',
    ].filter(Boolean);
    return [fmtDate(s.date), ...(s.isVoid ? ['void'] : [`${bob} ${s.bob}`, `${mike} ${s.mike}`]), ...bonus].join(', ');
  };
  const out: string[] = [];
  after.forEach((s, i) => {
    const old = before.find((x) => x.id === s.id);
    const name = `${t.name}, session ${i + 1}`;
    if (!old) {
      out.push(`${name} added: ${summary(s)}`);
      return;
    }
    const bits: string[] = [];
    if (old.date !== s.date) bits.push(`date ${fmtDate(old.date)} → ${fmtDate(s.date)}`);
    if (!old.isVoid && s.isVoid) bits.push('marked void');
    if (old.isVoid && !s.isVoid) bits.push('no longer void');
    if (!s.isVoid) {
      if (old.bob !== s.bob) bits.push(`${bob} ${old.bob} → ${s.bob}`);
      if (old.mike !== s.mike) bits.push(`${mike} ${old.mike} → ${s.mike}`);
    }
    if (old.bonusBob !== s.bonusBob) bits.push(`${bob} BP ${old.bonusBob ?? '–'} → ${s.bonusBob ?? '–'}`);
    if (old.bonusMike !== s.bonusMike) bits.push(`${mike} BP ${old.bonusMike ?? '–'} → ${s.bonusMike ?? '–'}`);
    const was = old.notes.map((n) => n.text);
    const now = s.notes.map((n) => n.text);
    for (const n of now) if (!was.includes(n)) bits.push(`note added: "${n}"`);
    for (const n of was) if (!now.includes(n)) bits.push(`note removed: "${n}"`);
    if (bits.length) out.push(`${name}: ${bits.join(', ')}`);
  });
  before.forEach((s, i) => {
    if (!after.some((x) => x.id === s.id)) out.push(`${t.name}, session ${i + 1} deleted (was ${summary(s)})`);
  });
  return out;
}

function tournamentChanges(a: SnookerDoc, b: SnookerDoc) {
  const out: string[] = [];
  for (const t of b.tournaments) {
    const old = a.tournaments.find((x) => x.id === t.id);
    if (!old) {
      out.push(`Tournament added: ${t.name} (${formatLabel(t.format)})`);
      out.push(...sessionChanges(t, [], t.sessions, b));
      continue;
    }
    if (old.name !== t.name) out.push(`Tournament renamed: ${old.name} → ${t.name}`);
    if (old.year !== t.year) out.push(`${t.name} year: ${old.year} → ${t.year}`);
    if (!same(old.format, t.format)) out.push(`${t.name} format: ${formatLabel(old.format)} → ${formatLabel(t.format)}`);
    if (old.bonusValue !== t.bonusValue) out.push(`${t.name} bonus point value: ${old.bonusValue} → ${t.bonusValue}`);
    if (old.photo !== t.photo) out.push(`${t.name} photo ${t.photo ? 'changed' : 'removed'}`);
    for (const n of t.notes) if (!old.notes.includes(n)) out.push(`${t.name} note added: "${n}"`);
    for (const n of old.notes) if (!t.notes.includes(n)) out.push(`${t.name} note removed: "${n}"`);
    out.push(...sessionChanges(t, old.sessions, t.sessions, b));
  }
  for (const t of a.tournaments) {
    if (!b.tournaments.some((x) => x.id === t.id)) out.push(`Tournament deleted: ${t.name} (had ${t.sessions.length} sessions)`);
  }
  return out;
}

/** One line per change, in plain English. Empty if the edit changed nothing. */
export function describeChanges(a: SnookerDoc, b: SnookerDoc): string[] {
  const name = (p: 'bob' | 'mike') => b.players[p].name;
  const out = [
    ...tournamentChanges(a, b),
    ...listChanges(a.bonusRules, b.bonusRules, 'Bonus rule', (r) => `+${r.points}: ${r.text}`),
    ...listChanges(a.decrees, b.decrees, 'Decree', (d) => d.text),
    ...listChanges(a.records, b.records, 'Record', (r) => `${r.label} (${name('bob')} ${r.bob}, ${name('mike')} ${r.mike})`),
    ...listChanges(a.awards, b.awards, 'Award', (x) => `${x.title} (${name(x.holder)})`),
    ...listChanges(a.gallery, b.gallery, 'Photo', (p) => p.caption),
    ...listChanges(a.plantBoy.history, b.plantBoy.history, 'Plant boy history', (e) => `${e.period}: ${e.text}`),
  ];
  if (a.plantBoy.definition !== b.plantBoy.definition) out.push('Plant boy definition changed');
  for (const p of ['bob', 'mike'] as const) {
    const was = a.plantBoy.holders[p];
    const now = b.plantBoy.holders[p];
    if (was !== now) out.push(`${name(p)} plant boy rank: ${was ?? 'none'} → ${now ?? 'none'}`);
  }
  // Nothing should reach this, but an edit must never go unlogged just because it has no wording yet.
  if (!out.length && !same({ ...a, changelog: null }, { ...b, changelog: null })) out.push('Other details changed');
  return out;
}
