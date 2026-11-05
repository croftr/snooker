import { useStore } from '../lib/store';
import type { ChangeEntry } from '../types';

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function ChangeLog() {
  const { doc, unlocked } = useStore();

  if (!unlocked) {
    return (
      <header className="page-head wrap">
        <p className="eyebrow">Referee only</p>
        <h1 className="page-title">Change log</h1>
        <p className="lede">Blow the whistle to see what has been changed.</p>
      </header>
    );
  }

  const days: { day: string; entries: ChangeEntry[] }[] = [];
  for (const entry of [...(doc!.changelog ?? [])].reverse()) {
    const day = dayKey(entry.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }

  return (
    <div className="changelog">
      <header className="page-head wrap">
        <p className="eyebrow">Referee only</p>
        <h1 className="page-title">Change log</h1>
        <p className="lede">Every change to the record, newest first, at the time it was made on the device.</p>
      </header>
      <div className="wrap">
        {days.length === 0 && <p className="panel">Nothing changed yet. Suspiciously quiet.</p>}
        {days.map(({ day, entries }) => (
          <section key={day} className="panel log-day">
            <h2 className="h3">{day}</h2>
            <ol className="log-list">
              {entries.map((e) => (
                <li key={e.id} className="log-entry">
                  <time dateTime={e.at}>{time(e.at)}</time>
                  <ul>{e.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
