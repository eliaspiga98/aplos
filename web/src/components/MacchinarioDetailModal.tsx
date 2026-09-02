import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type MacchinarioDettaglio, type ManutenzioneProgrammata } from '../api';
import { daysFromToday, formatDate, formatDateTime } from '../utils/format';
import { Modal } from './Modal';
import { MacchinarioFormModal } from './MacchinarioFormModal';
import { ManutenzioneFormModal } from './ManutenzioneFormModal';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toaster';

interface Props { id: number | null; onClose: () => void; onChanged: () => void }

function dueLabel(value: string): string {
  const days = daysFromToday(value);
  if (days < 0) return `${Math.abs(days)}gg di ritardo`;
  if (days === 0) return 'Oggi';
  if (days === 1) return 'Domani';
  return `Tra ${days}gg`;
}

export function MacchinarioDetailModal({ id, onClose, onChanged }: Props) {
  const [data, setData] = useState<MacchinarioDettaglio | null>(null);
  const [editMachine, setEditMachine] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<ManutenzioneProgrammata | null>(null);
  const confirm = useConfirm();
  const { push } = useToast();

  const load = useCallback(async () => {
    if (id == null) return;
    setData(await api.get<MacchinarioDettaglio>(`/api/macchinari/${id}`));
  }, [id]);
  useEffect(() => { if (id != null) void load(); else setData(null); }, [id, load]);

  async function complete(item: ManutenzioneProgrammata) {
    const ok = await confirm({ title: `Completare “${item.titolo}”`, message: 'La data e l’operatore verranno registrati nello storico.', confirmText: 'Completata' });
    if (!ok) return;
    try {
      await api.post(`/api/macchinari/manutenzioni/${item.id}/completa`, {});
      push('Manutenzione completata', 'success'); void load(); onChanged();
    } catch (err) { push(err instanceof ApiError ? err.message : 'Errore', 'error'); }
  }

  async function removeMaintenance(item: ManutenzioneProgrammata) {
    const ok = await confirm({ title: `Archiviare “${item.titolo}”`, message: 'Gli interventi già completati rimarranno nello storico.', confirmText: 'Archivia', danger: true });
    if (!ok) return;
    await api.delete(`/api/macchinari/manutenzioni/${item.id}`);
    void load(); onChanged();
  }

  async function removeMachine() {
    if (!data) return;
    const ok = await confirm({ title: `Archiviare “${data.nome}”`, message: 'Macchinario e manutenzioni non appariranno più nelle liste. Lo storico rimarrà nel database.', confirmText: 'Archivia', danger: true });
    if (!ok) return;
    await api.delete(`/api/macchinari/${data.id}`); onChanged(); onClose();
  }

  return <Modal open={id != null} onClose={onClose} title={data?.nome ?? 'Caricamento…'} size="lg" footer={<>
    <button type="button" className="btn-secondary" onClick={onClose}>Chiudi</button>
    {data && <><button type="button" className="btn-danger" onClick={() => void removeMachine()}>Archivia</button><button type="button" onClick={() => setEditMachine(true)}>Modifica</button></>}
  </>}>
    {data && <div className="detail">
      <section><h3>Macchinario</h3><dl className="kv">
        <dt>Marca e modello</dt><dd>{[data.marca, data.modello].filter(Boolean).join(' ') || '—'}</dd>
        <dt>Matricola</dt><dd>{data.matricola ?? '—'}</dd><dt>Ubicazione</dt><dd>{data.ubicazione ?? '—'}</dd>
        <dt>Note</dt><dd>{data.note ?? '—'}</dd>
      </dl></section>
      <section>
        <header className="section-header"><h3>Manutenzioni programmate ({data.manutenzioni.length})</h3><button type="button" onClick={() => setShowMaintenance(true)}>Programma</button></header>
        {data.manutenzioni.length === 0 ? <p className="muted">Nessuna manutenzione programmata.</p> : <div className="maintenance-list">
          {data.manutenzioni.map((item) => <article className={`maintenance-card ${item.attiva && daysFromToday(item.prossima_scadenza) <= 0 ? 'maintenance-card--due' : ''}`} key={item.id}>
            <div className="maintenance-main"><strong>{item.titolo}</strong><div className="muted">{item.descrizione ?? 'Nessuna descrizione'}</div><div className="maintenance-meta">Scadenza {formatDate(item.prossima_scadenza)} · {dueLabel(item.prossima_scadenza)}{item.ricorrenza_valore ? ` · ogni ${item.ricorrenza_valore} ${item.ricorrenza_unita}` : ' · singola'}</div></div>
            <div className="maintenance-actions">
              {item.attiva && <button type="button" onClick={() => void complete(item)}>Completata</button>}
              <button type="button" className="btn-link" onClick={() => setEditingMaintenance(item)}>Modifica</button>
              <button type="button" className="btn-link" onClick={() => void removeMaintenance(item)}>Archivia</button>
            </div>
          </article>)}
        </div>}
      </section>
      <section><h3>Storico interventi ({data.interventi.length})</h3>
        {data.interventi.length === 0 ? <p className="muted">Nessun intervento completato.</p> : <table className="table table--compact"><thead><tr><th>Manutenzione</th><th>Scadenza prevista</th><th>Completata</th><th>Operatore</th></tr></thead><tbody>{data.interventi.map((row) => <tr key={row.id}><td>{row.titolo}</td><td>{formatDate(row.scadenza_prevista)}</td><td>{formatDateTime(row.completata_at)}</td><td>{row.operatore_nome ?? '—'}</td></tr>)}</tbody></table>}
      </section>
    </div>}
    {data && <>
      <MacchinarioFormModal open={editMachine} onClose={() => setEditMachine(false)} machine={data} onSaved={() => { void load(); onChanged(); }} />
      <ManutenzioneFormModal open={showMaintenance} idMacchinario={data.id} onClose={() => setShowMaintenance(false)} onSaved={() => { void load(); onChanged(); }} />
      <ManutenzioneFormModal open={editingMaintenance != null} idMacchinario={data.id} maintenance={editingMaintenance} onClose={() => setEditingMaintenance(null)} onSaved={() => { void load(); onChanged(); }} />
    </>}
  </Modal>;
}
