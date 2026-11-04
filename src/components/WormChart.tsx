import { useState } from 'react';
import type { SnookerDoc, Tournament } from '../types';
import { fmtDate, wormSeries } from '../lib/stats';
import { PlayerBall, useWidth } from './ui';

const niceStep = (max: number) => (max <= 12 ? 2 : max <= 30 ? 5 : 10);

/** The worm: cumulative frames (or league points) for each player, session by session. */
export function WormChart({ t, doc }: { t: Tournament; doc: SnookerDoc }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rows = wormSeries(t);
  const league = t.format.type === 'league';
  const target = t.format.type === 'race' ? t.format.raceTo : null;
  const unit = league ? 'points' : 'frames';

  const h = 280;
  const pad = { l: 38, r: 74, t: 14, b: 34 };
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = h - pad.t - pad.b;
  const maxY = Math.max(target ?? 0, ...rows.map((r) => Math.max(r.bob, r.mike)), 4);
  const n = Math.max(rows.length - 1, 1);
  const x = (i: number) => pad.l + (i / n) * iw;
  const y = (v: number) => pad.t + ih - (v / maxY) * ih;
  const path = (k: 'bob' | 'mike') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join(' ');

  const step = niceStep(maxY);
  const ticks = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, i) => i * step);
  const xStep = n <= 10 ? 1 : n <= 20 ? 2 : 5;
  const last = rows[rows.length - 1];
  const hRow = hover !== null ? rows[hover] : null;

  // Keep the two end labels from sitting on top of each other.
  let labelBob = y(last.bob) + 4, labelMike = y(last.mike) + 4;
  if (Math.abs(labelBob - labelMike) < 16) {
    const mid = (labelBob + labelMike) / 2;
    const bobTop = last.bob >= last.mike;
    labelBob = mid + (bobTop ? -8 : 8);
    labelMike = mid + (bobTop ? 8 : -8);
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * n);
    setHover(Math.max(1, Math.min(n, i)));
  };

  return (
    <div className="worm" ref={ref}>
      <div className="legend">
        <span><PlayerBall id="bob" size={12} /> {doc.players.bob.name}</span>
        <span><PlayerBall id="mike" size={12} /> {doc.players.mike.name}</span>
        <span className="legend-unit">Running total of {unit}, session by session</span>
      </div>
      {width > 0 && rows.length > 1 && (
        <svg
          width={width}
          height={h}
          role="img"
          aria-label={`Running ${unit}: ${doc.players.bob.name} ${last.bob}, ${doc.players.mike.name} ${last.mike} after ${n} sessions`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} className="worm-grid" />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="worm-axis">{v}</text>
            </g>
          ))}
          {rows.filter((r) => r.i > 0 && (r.i % xStep === 0 || r.i === 1)).map((r) => (
            <text key={r.i} x={x(r.i)} y={h - 12} textAnchor="middle" className="worm-axis">{r.i}</text>
          ))}
          {target && (
            <>
              <line x1={pad.l} x2={pad.l + iw} y1={y(target)} y2={y(target)} className="worm-target" />
              <text x={pad.l + 6} y={y(target) - 6} className="worm-axis">{target} to win</text>
            </>
          )}
          <path d={path('bob')} className="worm-line worm-bob" />
          <path d={path('mike')} className="worm-line worm-mike" />
          <circle cx={x(last.i)} cy={y(last.bob)} r={5} className="worm-dot worm-bob-fill" />
          <circle cx={x(last.i)} cy={y(last.mike)} r={5} className="worm-dot worm-mike-fill" />
          <text x={x(last.i) + 11} y={labelBob} className="worm-end">{doc.players.bob.name} {last.bob}</text>
          <text x={x(last.i) + 11} y={labelMike} className="worm-end">{doc.players.mike.name} {last.mike}</text>
          {hRow && (
            <>
              <line x1={x(hRow.i)} x2={x(hRow.i)} y1={pad.t} y2={pad.t + ih} className="worm-cross" />
              <circle cx={x(hRow.i)} cy={y(hRow.bob)} r={5} className="worm-dot worm-bob-fill" />
              <circle cx={x(hRow.i)} cy={y(hRow.mike)} r={5} className="worm-dot worm-mike-fill" />
            </>
          )}
        </svg>
      )}
      {hRow && (
        <div className="worm-tip" style={{ left: Math.min(x(hRow.i) + 10, Math.max(0, width - 170)), top: 40 }}>
          <b>Session {hRow.i}</b>
          <small>{hRow.session?.isVoid ? 'Void' : fmtDate(hRow.session?.date ?? null)}</small>
          <span><PlayerBall id="bob" size={10} /> {doc.players.bob.name} <b>{hRow.bob}</b></span>
          <span><PlayerBall id="mike" size={10} /> {doc.players.mike.name} <b>{hRow.mike}</b></span>
        </div>
      )}
    </div>
  );
}
