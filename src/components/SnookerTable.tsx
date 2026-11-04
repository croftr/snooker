import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { SnookerDoc } from '../types';

/* A playable little table. Pot a colour to get sent somewhere; pot a red to get read a rule. */

const W = 1200, H = 600, M = 46;
const R = 13;
const STEP = 1 / 720;
const FRICTION = 0.9993;
const STOP = 0.005;
const MAX_SPEED = 4;

const POCKETS = [
  { x: 0, y: 0, r: 44 }, { x: W / 2, y: -8, r: 42 }, { x: W, y: 0, r: 44 },
  { x: 0, y: H, r: 44 }, { x: W / 2, y: H + 8, r: 42 }, { x: W, y: H, r: 44 },
];
const COLOURS = {
  white: ['#fffdf4', '#d9d3bd', 1],
  red: ['#e4283a', '#6d0a14', 1],
  yellow: ['#ffd92e', '#a67a00', 2],
  green: ['#17a35c', '#064a28', 3],
  brown: ['#94572a', '#3b1d09', 4],
  blue: ['#2b84e8', '#0c2f6d', 5],
  pink: ['#ff9dc0', '#b5456f', 6],
  black: ['#3a3a42', '#050507', 7],
} as const;
type Kind = keyof typeof COLOURS;
const BAULK = W * 0.2;
const SPOTS: Record<string, [number, number]> = {
  yellow: [BAULK, H / 2 + 100], brown: [BAULK, H / 2], green: [BAULK, H / 2 - 100],
  blue: [W / 2, H / 2], pink: [W * 0.75, H / 2], black: [W * 0.92, H / 2],
};
const CUE_START: [number, number] = [BAULK - 62, H / 2 + 38];

interface Ball { kind: Kind; x: number; y: number; vx: number; vy: number; sink: number; px?: number; py?: number }
const ball = (kind: Kind, [x, y]: [number, number]): Ball => ({ kind, x, y, vx: 0, vy: 0, sink: 0 });

function rack(): Ball[] {
  const reds: Ball[] = [];
  const ax = SPOTS.pink[0] + 2 * R + 2;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      reds.push(ball('red', [ax + row * R * 1.76, H / 2 + (i - row / 2) * R * 2.04]));
    }
  }
  return reds;
}
const fresh = () => [
  ball('white', CUE_START),
  ...Object.entries(SPOTS).map(([k, s]) => ball(k as Kind, s)),
  ...rack(),
];

/* ---- sound: tiny synthesised clacks, created only after a shot (a user gesture) ---- */
let audio: AudioContext | null = null;
let lastClack = 0;
function clack(vol: number, muted: boolean, pitch = 2100) {
  if (muted) return;
  const now = performance.now();
  if (now - lastClack < 28) return;
  lastClack = now;
  audio ??= new AudioContext();
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = 'triangle';
  o.frequency.value = pitch + Math.random() * 300;
  g.gain.setValueAtTime(Math.min(0.5, vol), audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + 0.06);
}

function paintBase(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = (W + 2 * M) * 2;
  c.height = (H + 2 * M) * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  // wood
  const wood = g.createLinearGradient(0, 0, 0, H + 2 * M);
  wood.addColorStop(0, '#6e3517'); wood.addColorStop(0.5, '#4a210d'); wood.addColorStop(1, '#2d1306');
  g.fillStyle = wood;
  g.beginPath(); g.roundRect(0, 0, W + 2 * M, H + 2 * M, 26); g.fill();
  g.strokeStyle = 'rgba(255,220,160,.09)';
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * (H + 2 * M);
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + 6, 900, y - 6, W + 2 * M, y + 2); g.stroke();
  }
  // felt
  g.translate(M, M);
  const felt = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.66);
  felt.addColorStop(0, '#1d9a60'); felt.addColorStop(0.65, '#10774a'); felt.addColorStop(1, '#0a5234');
  g.fillStyle = felt;
  g.fillRect(-6, -6, W + 12, H + 12);
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.012)' : 'rgba(0,0,0,.02)';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
  }
  // markings
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(BAULK, 0); g.lineTo(BAULK, H); g.stroke();
  g.beginPath(); g.arc(BAULK, H / 2, 100, Math.PI / 2, -Math.PI / 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.5)';
  for (const s of Object.values(SPOTS)) { g.beginPath(); g.arc(s[0], s[1], 2.2, 0, 7); g.fill(); }
  // cushion shading + pockets
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 10;
  g.strokeRect(-4, -4, W + 8, H + 8);
  for (const p of POCKETS) {
    g.fillStyle = '#d2a341';
    g.beginPath(); g.arc(p.x, p.y, 33, 0, 7); g.fill();
    const h = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, 28);
    h.addColorStop(0, '#000'); h.addColorStop(1, '#16100a');
    g.fillStyle = h;
    g.beginPath(); g.arc(p.x, p.y, 28, 0, 7); g.fill();
  }
  return c;
}

function drawBall(g: CanvasRenderingContext2D, b: Ball) {
  const k = 1 - b.sink;
  const r = R * k;
  if (r <= 0.5) return;
  const [hi, lo] = COLOURS[b.kind];
  g.fillStyle = 'rgba(0,0,0,.33)';
  g.beginPath(); g.ellipse(b.x + 3, b.y + 5, r, r * 0.9, 0, 0, 7); g.fill();
  const s = g.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
  s.addColorStop(0, hi); s.addColorStop(0.62, hi); s.addColorStop(1, lo);
  g.fillStyle = s;
  g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.beginPath(); g.ellipse(b.x - r * 0.36, b.y - r * 0.42, r * 0.2, r * 0.14, -0.6, 0, 7); g.fill();
}

type Message = { title: string; body: string; href?: string; cta?: string; kind: Kind };

export function SnookerTable({ doc, highBreak }: { doc: SnookerDoc; highBreak: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [brk, setBrk] = useState(0);
  const [best, setBest] = useState(0);
  const [msg, setMsg] = useState<Message | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const docRef = useRef(doc);
  docRef.current = doc;
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    const cv = canvas.current!;
    const g = cv.getContext('2d')!;
    const base = paintBase();
    let balls = fresh();
    let raf = 0;
    let last = 0;
    let acc = 0;
    let aim: { x: number; y: number } | null = null;
    let shotPots = 0;
    let shotFoul = false;
    let inShot = false;
    let breakNow = 0;

    const cue = () => balls.find((b) => b.kind === 'white')!;
    const moving = () => balls.some((b) => b.sink > 0 || Math.abs(b.vx) + Math.abs(b.vy) > 0);

    const toTable = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * (W + 2 * M) - M, y: ((e.clientY - r.top) / r.height) * (H + 2 * M) - M };
    };

    function respot(b: Ball, at: [number, number]) {
      let [x, y] = at;
      for (let n = 0; n < 40 && balls.some((o) => o !== b && Math.hypot(o.x - x, o.y - y) < 2 * R + 1); n++) x += 2 * R + 2;
      Object.assign(b, { x, y, vx: 0, vy: 0, sink: 0, px: undefined, py: undefined });
    }

    function potted(b: Ball) {
      const d = docRef.current;
      if (b.kind === 'white') {
        shotFoul = true;
        setMsg({ kind: 'white', title: 'In-off!', body: 'Two fouls on the run and your opponent gets a bonus point. It is in the rules.', href: '/rules', cta: 'Read the rules' });
        respot(b, CUE_START);
        return;
      }
      shotPots++;
      breakNow += COLOURS[b.kind][2] as number;
      setBrk(breakNow);
      setBest((x) => Math.max(x, breakNow));
      if (b.kind === 'red') {
        const rule = d.bonusRules[Math.floor(Math.random() * d.bonusRules.length)];
        setMsg({ kind: 'red', title: `${rule.points} BP`, body: rule.text });
        balls = balls.filter((x) => x !== b);
        return;
      }
      const dest: Record<string, Omit<Message, 'kind'>> = {
        yellow: { title: 'Yellow!', body: 'That takes you to the live scores.', href: '/tournaments', cta: 'See who is winning' },
        green: { title: 'Green!', body: 'Worth 3. The bonus point menu is worth more.', href: '/rules', cta: 'Open the rulebook' },
        brown: { title: 'Brown!', body: 'A fitting colour for flood water.', href: '/tournaments/t1', cta: 'Remember 2005' },
        blue: { title: 'Blue!', body: 'Trophies, plaques and terrible hats await.', href: '/hall', cta: 'Enter the Hall' },
        pink: { title: 'Pink!', body: 'Thirty sessions, three points for a win.', href: '/tournaments/t2', cta: 'Relive 2006' },
        black: { title: 'The black!', body: 'Seven. Now, about that ladder.', href: '/rules#plant-boy', cta: 'Climb the Plant Boy ladder' },
      };
      setMsg({ kind: b.kind, ...dest[b.kind] });
      respot(b, SPOTS[b.kind]);
    }

    function step() {
      for (const b of balls) {
        if (b.sink > 0) {
          b.sink += 0.0045;
          b.x += (b.px! - b.x) * 0.015;
          b.y += (b.py! - b.y) * 0.015;
          continue;
        }
        b.x += b.vx; b.y += b.vy;
        b.vx *= FRICTION; b.vy *= FRICTION;
        if (Math.hypot(b.vx, b.vy) < STOP) { b.vx = 0; b.vy = 0; }
        const hole = POCKETS.find((p) => Math.hypot(p.x - b.x, p.y - b.y) < p.r);
        if (hole) {
          b.sink = 0.01; b.px = hole.x; b.py = hole.y; b.vx = 0; b.vy = 0;
          clack(0.35, mutedRef.current, 320);
          continue;
        }
        const speed = Math.hypot(b.vx, b.vy);
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.78; clack(speed * 0.048, mutedRef.current, 700); }
        if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * 0.78; clack(speed * 0.048, mutedRef.current, 700); }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * 0.78; clack(speed * 0.048, mutedRef.current, 700); }
        if (b.y > H - R) { b.y = H - R; b.vy = -Math.abs(b.vy) * 0.78; clack(speed * 0.048, mutedRef.current, 700); }
      }
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          if (a.sink || b.sink) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= 2 * R || d === 0) continue;
          const nx = dx / d, ny = dy / d;
          const push = (2 * R - d) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel <= 0) continue;
          const imp = rel * 0.97;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
          clack(rel * 0.16, mutedRef.current);
        }
      }
      for (const b of [...balls]) if (b.sink >= 1) potted(b);
    }

    function endShot() {
      inShot = false;
      if (shotFoul || shotPots === 0) { breakNow = 0; setBrk(0); }
      if (!balls.some((b) => b.kind === 'red')) balls.push(...rack());
    }

    /** Where the aim line first meets a ball or cushion. */
    function guide(c: Ball, ux: number, uy: number) {
      let t = Infinity;
      if (ux > 0) t = Math.min(t, (W - R - c.x) / ux);
      if (ux < 0) t = Math.min(t, (R - c.x) / ux);
      if (uy > 0) t = Math.min(t, (H - R - c.y) / uy);
      if (uy < 0) t = Math.min(t, (R - c.y) / uy);
      let hit = false;
      for (const o of balls) {
        if (o === c || o.sink) continue;
        const ox = o.x - c.x, oy = o.y - c.y;
        const along = ox * ux + oy * uy;
        const miss = 4 * R * R - (ox * ox + oy * oy - along * along);
        if (along > 0 && miss > 0) {
          const at = along - Math.sqrt(miss);
          if (at < t) { t = at; hit = true; }
        }
      }
      return { x: c.x + ux * t, y: c.y + uy * t, hit };
    }

    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(base, 0, 0, cv.width, cv.height);
      const k = cv.width / (W + 2 * M);
      g.setTransform(k, 0, 0, k, M * k, M * k);
      const c = cue();
      if (aim && !moving()) {
        const dx = c.x - aim.x, dy = c.y - aim.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const end = guide(c, ux, uy);
        g.setLineDash([9, 9]);
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(end.x, end.y); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(end.x, end.y, R, 0, 7);
        g.strokeStyle = end.hit ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)'; g.stroke();
      }
      for (const b of balls) if (b.sink) drawBall(g, b);
      for (const b of balls) if (!b.sink) drawBall(g, b);
      if (aim && !moving()) {
        const dx = c.x - aim.x, dy = c.y - aim.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const pull = Math.min(1, len / 340) * 90;
        const sx = c.x - ux * (R + 6 + pull), sy = c.y - uy * (R + 6 + pull);
        const ex = sx - ux * 520, ey = sy - uy * 520;
        const grad = g.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0, '#3aa0e8'); grad.addColorStop(0.012, '#f0d9a8'); grad.addColorStop(0.62, '#caa16a'); grad.addColorStop(0.64, '#231008'); grad.addColorStop(1, '#3a1a0a');
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx + 5, sy + 8); g.lineTo(ex + 5, ey + 8); g.stroke();
        g.strokeStyle = grad; g.lineWidth = 7;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      }
    }

    function loop(t: number) {
      const dt = Math.min(0.05, (t - last) / 1000 || 0);
      last = t;
      acc += dt;
      while (acc >= STEP) { step(); acc -= STEP; }
      draw();
      if (inShot && !moving()) endShot();
      if (moving() || aim) raf = requestAnimationFrame(loop);
      else raf = 0;
    }
    const kick = () => {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    };

    const down = (e: PointerEvent) => {
      if (moving()) return;
      cv.setPointerCapture(e.pointerId);
      aim = toTable(e);
      kick();
    };
    const move = (e: PointerEvent) => { if (aim) aim = toTable(e); };
    const up = () => {
      if (!aim) return;
      const c = cue();
      const dx = c.x - aim.x, dy = c.y - aim.y;
      const len = Math.hypot(dx, dy);
      aim = null;
      if (len < R * 1.5) { draw(); return; }
      const power = Math.min(1, len / 340);
      c.vx = (dx / len) * power * MAX_SPEED;
      c.vy = (dy / len) * power * MAX_SPEED;
      shotPots = 0; shotFoul = false; inShot = true;
      setHint(false);
      clack(0.3 + power * 0.2, mutedRef.current, 1400);
      kick();
    };
    const cancel = () => { aim = null; draw(); };

    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', cancel);

    const ro = new ResizeObserver(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      draw();
    });
    ro.observe(cv);

    resetRef.current = () => {
      balls = fresh(); breakNow = 0; inShot = false; aim = null;
      setBrk(0); setMsg(null); draw();
    };

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const beaten = best > highBreak;

  return (
    <div className="table-wrap">
      <div className="table-stage">
        <canvas
          ref={canvas}
          className="table-canvas"
          role="img"
          aria-label="A playable snooker table. Drag away from the white ball and let go to take a shot."
        />
        {hint && <div className="table-hint" aria-hidden="true">Press, drag back, let go</div>}
      </div>
      <div className="table-bar">
        <div className="table-score"><span className="micro">Break</span><b>{brk}</b></div>
        <div className="table-score"><span className="micro">Your best</span><b>{best}</b></div>
        <div className="table-score"><span className="micro">House record</span><b>{highBreak}</b></div>
        <div className={`table-msg ${msg ? 'on' : ''}`} key={msg ? msg.title + msg.body : 'none'} aria-live="polite">
          {msg ? (
            <>
              <span className={`ball ball-${msg.kind}`} aria-hidden="true" />
              <div>
                <strong>{msg.title}</strong> <span>{msg.body}</span>
                {msg.href && <> <Link href={msg.href} className="table-link">{msg.cta} →</Link></>}
              </div>
            </>
          ) : beaten ? (
            <div><strong>New house record?</strong> <span>Not on this table it isn't. The referee saw nothing.</span></div>
          ) : (
            <div><span>Reds read you a bonus rule. Colours take you places.</span></div>
          )}
        </div>
        <div className="table-tools">
          <button className="btn-quiet" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? 'Sound off' : 'Sound on'}</button>
          <button className="btn-quiet" onClick={() => resetRef.current()}>Re-rack</button>
        </div>
      </div>
    </div>
  );
}
