import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getList, type Lavoro, type ManutenzioneAlert } from '../api';
import { daysFromToday, formatDate } from '../utils/format';
import { Modal } from './Modal';

const POLL_MS = 5 * 60 * 1000;
const SOGLIA_GIORNI = 3;

function maintenanceLabel(alert: ManutenzioneAlert): string {
  if (alert.giorni < 0) return `${Math.abs(alert.giorni)}gg di ritardo`;
  if (alert.giorni === 0) return 'Oggi';
  if (alert.giorni === 1) return 'Domani';
  return `Tra ${alert.giorni}gg`;
}

export function NotificheBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Lavoro[]>([]);
  const [maintenance, setMaintenance] = useState<ManutenzioneAlert[]>([]);
  const [popup, setPopup] = useState<ManutenzioneAlert[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(new Set<string>());

  async function fetchAlerts() {
    try {
      const [jobResult, maintenanceRows] = await Promise.all([
        getList<Lavoro>('/api/lavori?limit=200'),
        api.get<ManutenzioneAlert[]>('/api/macchinari/alerts'),
      ]);
      setJobs(jobResult.rows
        .filter((l) => l.stato !== 'finito' && daysFromToday(l.data_consegna) <= SOGLIA_GIORNI)
        .sort((a, b) => a.data_consegna.localeCompare(b.data_consegna)));
      setMaintenance(maintenanceRows);
      const unseen = maintenanceRows.filter((item) => {
        const key = `${item.id}:${item.prossima_scadenza}:${item.tipo}`;
        if (shownRef.current.has(key)) return false;
        shownRef.current.add(key);
        return true;
      });
      if (unseen.length > 0) setPopup(unseen);
    } catch {
      // Un errore temporaneo non deve interrompere il lavoro dell'operatore.
    }
  }

  async function acknowledge(items: ManutenzioneAlert[]) {
    const ids = new Set(items.map((item) => `${item.id}:${item.prossima_scadenza}:${item.tipo}`));
    setPopup((current) => current.filter((item) => !ids.has(`${item.id}:${item.prossima_scadenza}:${item.tipo}`)));
    try {
      await Promise.all(items.map((item) => api.post(`/api/macchinari/alerts/${item.id}/ack`, {
        scadenza: item.prossima_scadenza,
        tipo: item.tipo,
      })));
      setMaintenance((current) => current.filter((item) => !ids.has(`${item.id}:${item.prossima_scadenza}:${item.tipo}`)));
    } catch {
      // Se la conferma non arriva al server, consentiamo al prossimo polling
      // di mostrare nuovamente il popup.
      for (const key of ids) shownRef.current.delete(key);
    }
  }

  useEffect(() => {
    void fetchAlerts();
    const id = window.setInterval(() => void fetchAlerts(), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const inRitardo = jobs.filter((l) => daysFromToday(l.data_consegna) < 0);
  const oggi = jobs.filter((l) => daysFromToday(l.data_consegna) === 0);
  const prossimi = jobs.filter((l) => daysFromToday(l.data_consegna) > 0);
  const total = jobs.length + maintenance.length;

  return <>
    <div className="notifiche-wrap" ref={wrapperRef}>
      <button type="button" className="notifiche-btn" onClick={() => setOpen((value) => !value)} aria-label={`Notifiche (${total})`} title={total ? `${total} notifiche` : 'Nessuna notifica'}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
        {total > 0 && <span className={`notifiche-badge ${inRitardo.length > 0 || maintenance.some((m) => m.giorni <= 0) ? 'notifiche-badge--alert' : ''}`}>{total}</span>}
      </button>
      {open && <div className="notifiche-panel">
        <header className="notifiche-panel-header"><strong>Notifiche ({total})</strong><button type="button" className="btn-link" onClick={() => void fetchAlerts()}>Aggiorna</button></header>
        {total === 0 ? <p className="muted" style={{ padding: '0.85rem 1rem' }}>Tutto sotto controllo.</p> : <ul className="notifiche-list">
          {maintenance.map((item) => <li key={`m-${item.id}-${item.tipo}`} className={`notifiche-item notifiche-item--${item.giorni <= 0 ? 'ritardo' : 'prossimo'}`} onClick={() => {
            void acknowledge([item]); setOpen(false); navigate(`/macchinari?open=${item.id_macchinario}`);
          }}><div className="notifiche-item-main"><strong>{item.macchinario_nome}</strong><div className="muted">{item.titolo} · {formatDate(item.prossima_scadenza)}</div></div><div className="notifiche-item-date">{maintenanceLabel(item)}</div></li>)}
          {[...inRitardo.map((l) => ({ l, tag: 'ritardo' as const })), ...oggi.map((l) => ({ l, tag: 'oggi' as const })), ...prossimi.map((l) => ({ l, tag: 'prossimo' as const }))].map(({ l, tag }) => <li key={`l-${l.id}`} className={`notifiche-item notifiche-item--${tag}`} onClick={() => { setOpen(false); navigate(`/lavori?open=${l.id}`); }}><div className="notifiche-item-main"><strong>{l.nome_paziente}</strong><div className="muted">{l.dottore_nome}</div></div><div className="notifiche-item-date">{tag === 'ritardo' ? `${Math.abs(daysFromToday(l.data_consegna))}gg ritardo` : tag === 'oggi' ? 'Oggi' : daysFromToday(l.data_consegna) === 1 ? 'Domani' : `Tra ${daysFromToday(l.data_consegna)}gg`}</div></li>)}
        </ul>}
      </div>}
    </div>
    <Modal open={popup.length > 0} onClose={() => void acknowledge(popup)} title="Manutenzioni da controllare" footer={<button type="button" onClick={() => void acknowledge(popup)}>Ho visto</button>}>
      <div className="maintenance-popup-list">{popup.map((item) => <button type="button" className="maintenance-popup-item" key={`${item.id}-${item.tipo}`} onClick={() => { void acknowledge([item]); navigate(`/macchinari?open=${item.id_macchinario}`); }}><strong>{item.macchinario_nome}</strong><span>{item.titolo}</span><span className={item.giorni <= 0 ? 'text-danger' : 'muted'}>{maintenanceLabel(item)} · {formatDate(item.prossima_scadenza)}</span></button>)}</div>
    </Modal>
  </>;
}
