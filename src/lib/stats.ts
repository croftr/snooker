import type { PlayerId, Session, SnookerDoc, Tournament } from '../types';

export const other = (p: PlayerId): PlayerId => (p === 'bob' ? 'mike' : 'bob');
const bonusOf = (s: Session, p: PlayerId) => (p === 'bob' ? s.bonusBob : s.bonusMike) ?? 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Line { frames: number; against: number; bonus: number; total: number; points: number; won: number; drawn: number; lost: number }
export interface Standing { bob: Line; mike: Line; played: number; winner: PlayerId | null }

export function standing(t: Tournament): Standing {
  const blank = (): Line => ({ frames: 0, against: 0, bonus: 0, total: 0, points: 0, won: 0, drawn: 0, lost: 0 });
  const out: Standing = { bob: blank(), mike: blank(), played: 0, winner: t.winner ?? null };
  const win = t.format.type === 'league' ? t.format.win : 3;
  const draw = t.format.type === 'league' ? t.format.draw : 1;

  for (const s of t.sessions) {
    if (s.isVoid) continue;
    out.played++;
    out.bob.frames += s.bob;
    out.bob.against += s.mike;
    out.mike.frames += s.mike;
    out.mike.against += s.bob;
    out.bob.bonus += bonusOf(s, 'bob');
    out.mike.bonus += bonusOf(s, 'mike');
    if (s.bob > s.mike) { out.bob.won++; out.mike.lost++; out.bob.points += win; }
    else if (s.mike > s.bob) { out.mike.won++; out.bob.lost++; out.mike.points += win; }
    else { out.bob.drawn++; out.mike.drawn++; out.bob.points += draw; out.mike.points += draw; }
    if (t.format.type === 'race' && !out.winner) {
      if (out.bob.frames >= t.format.raceTo) out.winner = 'bob';
      else if (out.mike.frames >= t.format.raceTo) out.winner = 'mike';
    }
  }
  out.bob.total = round1(out.bob.frames + out.bob.bonus * t.bonusValue);
  out.mike.total = round1(out.mike.frames + out.mike.bonus * t.bonusValue);

  if (t.format.type === 'league' && !out.winner && out.played >= t.format.sessions) {
    const a = out.bob.points - out.mike.points || out.bob.frames - out.mike.frames;
    out.winner = a > 0 ? 'bob' : a < 0 ? 'mike' : null;
  }
  return out;
}

export const isFinished = (t: Tournament) => standing(t).winner !== null;
export const liveTournament = (d: SnookerDoc) => [...d.tournaments].reverse().find((t) => !isFinished(t)) ?? null;

export function championship(d: SnookerDoc) {
  const wins: Record<PlayerId, number> = { bob: 0, mike: 0 };
  let champion: PlayerId | null = null;
  for (const t of d.tournaments) {
    const w = standing(t).winner;
    if (!w) continue;
    wins[w]++;
    if (!champion && wins[w] >= d.championship.target) champion = w;
  }
  return { wins, champion };
}

/** What the worm chart plots: points in a league, frames in a race. */
export function wormSeries(t: Tournament) {
  const pts = t.format.type === 'league' ? t.format : null;
  let b = 0, m = 0;
  const rows = [{ i: 0, session: null as Session | null, bob: 0, mike: 0 }];
  t.sessions.forEach((s, idx) => {
    if (!s.isVoid) {
      if (pts) {
        b += s.bob > s.mike ? pts.win : s.bob === s.mike ? pts.draw : 0;
        m += s.mike > s.bob ? pts.win : s.bob === s.mike ? pts.draw : 0;
      } else { b += s.bob; m += s.mike; }
    }
    rows.push({ i: idx + 1, session: s, bob: b, mike: m });
  });
  return rows;
}

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(iso + 'T00:00:00Z');

export function globalStats(d: SnookerDoc, now = Date.now()) {
  const played = d.tournaments.flatMap((t) => t.sessions.filter((s) => !s.isVoid).map((s) => ({ ...s, t })));
  const lifetime = { bob: 0, mike: 0 };
  const bonus = { bob: 0, mike: 0 };
  let biggest: { s: (typeof played)[number]; margin: number } | null = null;
  for (const s of played) {
    lifetime.bob += s.bob;
    lifetime.mike += s.mike;
    bonus.bob += s.bonusBob ?? 0;
    bonus.mike += s.bonusMike ?? 0;
    const margin = Math.abs(s.bob - s.mike);
    if (!biggest || margin > biggest.margin) biggest = { s, margin };
  }
  const dates = [...new Set(played.flatMap((s) => (s.date ? [s.date] : [])))].sort();
  let drought = { days: 0, from: '', to: '' };
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((utc(dates[i]) - utc(dates[i - 1])) / DAY);
    if (days > drought.days) drought = { days, from: dates[i - 1], to: dates[i] };
  }
  const last = dates[dates.length - 1] ?? null;
  return {
    sessions: played.length,
    lifetime,
    bonus,
    biggest,
    drought,
    last,
    daysSince: last ? Math.max(0, Math.floor((now - utc(last)) / DAY)) : null,
  };
}

export function fmtDate(iso: string | null, opts: { short?: boolean } = {}) {
  if (!iso) return '–';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: opts.short ? '2-digit' : 'numeric', timeZone: 'UTC',
  });
}

export const fmtNum = (n: number) => n.toLocaleString('en-GB');
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
