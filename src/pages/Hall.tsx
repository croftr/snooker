import { useState } from 'react';
import { useStore } from '../lib/store';
import { uid } from '../lib/stats';
import type { Award, Photo, PlayerId, RecordRow } from '../types';
import { FormModal, Modal, PhotoButton, PlayerBall, Polaroid } from '../components/ui';

const TILTS = [-3, 2, -1.5, 3, -2, 1.5, -2.5, 2.5];

export function Hall() {
  const { doc, unlocked, mutate } = useStore();
  const d = doc!;
  const [award, setAward] = useState<Award | 'new' | null>(null);
  const [record, setRecord] = useState<RecordRow | 'new' | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [caption, setCaption] = useState<Photo | null>(null);

  const playerOptions = [
    { value: 'bob', label: d.players.bob.name },
    { value: 'mike', label: d.players.mike.name },
  ];

  return (
    <div className="hall">
      <header className="page-head wrap">
        <p className="eyebrow">Trophies, plaques and hats</p>
        <h1 className="page-title">Hall of Fame</h1>
      </header>

      <section className="wrap">
        <div className="strip-head">
          <h2 className="h2">The honours board</h2>
          {unlocked && <button className="btn btn-ghost" onClick={() => setAward('new')}>Add an award</button>}
        </div>
        <div className="honours">
          {d.awards.map((a) => (
            <article key={a.id} className="plaque">
              <span className="plaque-title">{a.title}</span>
              <span className="plaque-holder"><PlayerBall id={a.holder} size={20} /> {d.players[a.holder].name}</span>
              {unlocked && <button className="sheet-edit plaque-fix" onClick={() => setAward(a)} aria-label={`Edit ${a.title}`}>Fix</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="strip-head">
          <h2 className="h2">Records</h2>
          {unlocked && <button className="btn btn-ghost" onClick={() => setRecord('new')}>Add a record</button>}
        </div>
        <div className="scroll-x">
          <table className="records">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Record</span></th>
                <th scope="col"><PlayerBall id="bob" size={16} /> {d.players.bob.name}</th>
                <th scope="col"><PlayerBall id="mike" size={16} /> {d.players.mike.name}</th>
                {unlocked && <th scope="col"><span className="sr-only">Edit</span></th>}
              </tr>
            </thead>
            <tbody>
              {d.records.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.label}</th>
                  <td>{r.bob}</td>
                  <td>{r.mike}</td>
                  {unlocked && <td><button className="sheet-edit" onClick={() => setRecord(r)} aria-label={`Edit ${r.label}`}>Fix</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="band band-dark">
        <div className="wrap">
          <div className="strip-head">
            <h2 className="h2">The evidence wall</h2>
            {unlocked && (
              <PhotoButton
                label="Pin up a photo"
                onPhoto={(src) => mutate((x) => { x.gallery.unshift({ id: uid('g'), src, caption: 'New evidence' }); }, 'Pinned. Tap Caption to explain yourself.')}
              />
            )}
          </div>
          <div className="wall">
            {d.gallery.map((g, i) => (
              <div key={g.id} className="wall-item">
                <Polaroid src={g.src} caption={g.caption} tilt={TILTS[i % TILTS.length]} onClick={() => setViewing(g)} />
                {unlocked && <button className="sheet-edit wall-fix" onClick={() => setCaption(g)}>Caption</button>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {viewing && (
        <Modal title={viewing.caption} onClose={() => setViewing(null)} wide>
          <img className="lightbox" src={viewing.src} alt={viewing.caption} />
        </Modal>
      )}
      {caption && (
        <FormModal
          title="Caption this"
          fields={[{ key: 'caption', label: 'Caption', type: 'text', required: true }]}
          initial={{ caption: caption.caption }}
          submit="Save"
          onClose={() => setCaption(null)}
          deleteLabel="Take it down"
          onDelete={() => mutate((x) => { x.gallery = x.gallery.filter((y) => y.id !== caption.id); }, 'Evidence destroyed.')}
          onSubmit={(v) => mutate((x) => { x.gallery.find((y) => y.id === caption.id)!.caption = v.caption.trim(); })}
        />
      )}
      {award && (
        <FormModal
          title={award === 'new' ? 'A new award' : award.title}
          fields={[
            { key: 'title', label: 'Award', type: 'text', required: true },
            { key: 'holder', label: 'Holder', type: 'select', options: playerOptions },
          ]}
          initial={award === 'new' ? { title: '', holder: 'bob' } : award}
          submit="Engrave it"
          onClose={() => setAward(null)}
          onDelete={award === 'new' ? undefined : () => mutate((x) => { x.awards = x.awards.filter((y) => y.id !== (award as Award).id); })}
          onSubmit={(v) => mutate((x) => {
            const built: Award = { id: award === 'new' ? uid('a') : award.id, title: v.title.trim(), holder: v.holder as PlayerId };
            if (award === 'new') x.awards.push(built);
            else x.awards = x.awards.map((y) => (y.id === built.id ? built : y));
          }, 'Engraved.')}
        />
      )}
      {record && (
        <FormModal
          title={record === 'new' ? 'A new record' : record.label}
          fields={[
            { key: 'label', label: 'Record', type: 'text', required: true },
            { key: 'bob', label: d.players.bob.name, type: 'text' },
            { key: 'mike', label: d.players.mike.name, type: 'text' },
          ]}
          initial={record === 'new' ? { label: '', bob: '', mike: '' } : record}
          submit="Save"
          onClose={() => setRecord(null)}
          onDelete={record === 'new' ? undefined : () => mutate((x) => { x.records = x.records.filter((y) => y.id !== (record as RecordRow).id); })}
          onSubmit={(v) => mutate((x) => {
            const built: RecordRow = { id: record === 'new' ? uid('rec') : record.id, label: v.label.trim(), bob: v.bob.trim(), mike: v.mike.trim() };
            if (record === 'new') x.records.push(built);
            else x.records = x.records.map((y) => (y.id === built.id ? built : y));
          }, 'Record updated.')}
        />
      )}
    </div>
  );
}
