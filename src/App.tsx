import { useEffect, useRef, useState } from 'react';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { useStore } from './lib/store';
import { liveTournament } from './lib/stats';
import { useSwipeNav } from './lib/useSwipeNav';
import { Modal } from './components/ui';
import { Home } from './pages/Home';
import { TournamentPage } from './pages/TournamentPage';
import { Rules } from './pages/Rules';
import { Hall } from './pages/Hall';

const NAV = [
  { href: '/', label: 'The Table', ball: 'red', exact: true },
  { href: '/tournaments', label: 'Tournaments', ball: 'yellow' },
  { href: '/rules', label: 'The Rules', ball: 'green' },
  { href: '/hall', label: 'Hall of Fame', ball: 'blue' },
];

function Whistle() {
  const { unlocked, unlock, lock } = useStore();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (unlocked) {
    return <button className="whistle on" onClick={lock} title="Stop editing">Referee on duty <span aria-hidden="true">✕</span></button>;
  }
  return (
    <>
      <button className="whistle" onClick={() => setOpen(true)}>Referee</button>
      {open && (
        <Modal title="Who's the referee?" onClose={() => setOpen(false)}>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const problem = await unlock(pw);
              setBusy(false);
              if (problem) setErr(problem === 'Wrong password' ? 'Foul. That is not the password.' : problem);
              else setOpen(false);
            }}
          >
            <p>Everyone can read the record. Only the referee can change it.</p>
            <label className="field">
              <span>Password</span>
              <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} />
            </label>
            {err && <p className="form-err" role="alert">{err}</p>}
            <footer className="form-foot"><span className="grow" /><button className="btn" disabled={busy}>Blow the whistle</button></footer>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Always-visible save state: offline, how much is waiting, and a Sync button. */
function SyncPill() {
  const { online, pending, syncStatus, syncNow, unlocked } = useStore();
  const label = `${pending} ${pending === 1 ? 'change' : 'changes'}`;

  if (syncStatus === 'syncing') return <span className="sync sync-busy" role="status"><i className="sync-dot" /> Syncing…</span>;
  if (syncStatus === 'needs-password' || (pending > 0 && !unlocked)) {
    return <span className="sync sync-warn" role="status">{label} waiting: blow the whistle to sync</span>;
  }
  if (syncStatus === 'conflict') return null; // The banner below the header takes over.
  if (pending > 0) {
    return (
      <button className="sync sync-warn" onClick={() => void syncNow()} title="Saved on this device, not on the site yet">
        {online ? <span>{label} to sync</span> : <span>Offline: {label} saved here</span>}
        <b>Sync</b>
      </button>
    );
  }
  return online ? null : <span className="sync" role="status"><i className="sync-dot sync-off" /> Offline</span>;
}

function ConflictBanner() {
  const { syncStatus, resolveConflict } = useStore();
  if (syncStatus !== 'conflict') return null;
  return (
    <div className="conflict" role="alert">
      <p><strong>The site changed while this device had unsynced changes.</strong> Which version should win?</p>
      <div>
        <button className="btn" onClick={() => void resolveConflict('mine')}>Keep this device's</button>
        <button className="btn btn-ghost" onClick={() => void resolveConflict('site')}>Use the site's</button>
      </div>
    </div>
  );
}

const navIndex = (loc: string) => NAV.findIndex((n) => (n.exact ? loc === n.href : loc.startsWith(n.href)));

/** Swiping moves through the top menu, wrapping round at either end. */
function SwipeNav() {
  const [loc, go] = useLocation();
  useSwipeNav((direction) => {
    const next = NAV[(Math.max(0, navIndex(loc)) + direction + NAV.length) % NAV.length];
    go(next.href);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelector('main')?.animate(
        [{ transform: `translateX(${direction * 48}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(.2, .8, .3, 1)' },
      );
    }
  });
  return null;
}

function Header() {
  const [loc] = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // On a phone the menu scrolls sideways, so keep the current page's link in view.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector<HTMLElement>('.nav-link.on');
    if (nav && link) nav.scrollTo({ left: link.offsetLeft - nav.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
  }, [loc]);
  return (
    <header className="rail-top">
      <Link href="/" className="brand">Bob <em>v</em> Mike</Link>
      <nav aria-label="Main" ref={navRef}>
        {NAV.map((n) => {
          const active = n.exact ? loc === n.href : loc.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`nav-link ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined}>
              <span className={`ball ball-${n.ball}`} aria-hidden="true" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <SyncPill />
      <Whistle />
    </header>
  );
}

/** Keeps scroll position sensible on navigation, including /rules#plant-boy links. */
function ScrollManager() {
  const [loc] = useLocation();
  const { doc } = useStore();
  const ready = doc !== null;
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [loc, ready]);
  return null;
}

function Racking({ error }: { error: string | null }) {
  return (
    <div className="racking">
      <div className="rack-tri" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <span key={i} className="ball ball-red" style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
      {error ? (
        <>
          <h1>The table is closed</h1>
          <p className="racking-err" role="alert">{error}</p>
        </>
      ) : <p>Racking up…</p>}
    </div>
  );
}

function LiveRedirect() {
  const { doc } = useStore();
  const live = liveTournament(doc!) ?? doc!.tournaments[doc!.tournaments.length - 1];
  return <Redirect to={`/tournaments/${live.id}`} replace />;
}

export function App() {
  const { doc, loadError, toasts, unlocked } = useStore();
  return (
    <div className={unlocked ? 'app is-ref' : 'app'}>
      <Header />
      <ConflictBanner />
      <ScrollManager />
      <SwipeNav />
      <main>
        {!doc ? <Racking error={loadError} /> : (
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/tournaments" component={LiveRedirect} />
            <Route path="/tournaments/:id">{(p) => <TournamentPage key={p.id} id={p.id} />}</Route>
            <Route path="/rules" component={Rules} />
            <Route path="/hall" component={Hall} />
            <Route>
              <div className="racking"><h1>Missed.</h1><p>That page has rolled off the table. <Link href="/">Go back to it</Link>.</p></div>
            </Route>
          </Switch>
        )}
      </main>
      <footer className="foot">
        Keep your cue dry. <span aria-hidden="true">·</span> Records from 2005 available on request from the sea.
      </footer>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>)}
      </div>
    </div>
  );
}
