import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { RegistraConsumoForm } from './RegistraConsumoForm';
import { AllegatiSection } from './AllegatiSection';
import { LavoroFormModal } from './LavoroFormModal';
import { AssegnazioniModal } from './AssegnazioniModal';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toaster';
import { api, ApiError, type LavoroDettaglio, type TimelineEvent } from '../api';
import {
  formatDate, formatDateTime,
  labelStatoLavoro, labelTipoStruttura, labelCategoria,
} from '../utils/format';

interface Props {
  idLavoro: number | null;
  onClose: () => void;
  onChanged: () => void;
}

function labelAzione(ev: TimelineEvent): string {
  const d = ev.dettagli ?? {};
  switch (ev.azione) {
    case 'CREATE_LAVORO':
      return `Lavoro creato (paziente "${(d['paziente'] as string) ?? '?'}")`;
    case 'UPDATE_LAVORO':
      return `Modifica campi: ${(d['campi'] as string[] | undefined)?.join(', ') ?? '—'}`;
    case 'CAMBIO_STATO_LAVORO':
      return `Stato: ${(d['da'] as string) ?? '?'} → ${(d['a'] as string) ?? '?'}`;
    case 'UPDATE_STRUTTURE_LAVORO':
      return `Strutture aggiornate (${(d['n_strutture'] as number) ?? 0})`;
    case 'REGISTRA_MATERIALE':
      return 'Consumo materiale registrato';
    case 'UPLOAD_ALLEGATO':
      return `Allegato caricato: ${(d['nome_file'] as string) ?? ''}`;
    case 'DELETE_ALLEGATO':
      return 'Allegato eliminato';
    case 'DELETE_LAVORO':
      return 'Lavoro eliminato';
    case 'ASSEGNA_COLLABORATORE':
      return `Collaboratore assegnato — ${(d['mansione'] as string) ?? ''}`;
    case 'UPDATE_ASSEGNAZIONI_LAVORO':
      return `Assegnazioni aggiornate (${(d['attive'] as number) ?? 0} attive)`;
    default:
      return ev.azione.replaceAll('_', ' ').toLowerCase();
  }
}

export function LavoroDetailModal({ idLavoro, onClose, onChanged }: Props) {
  const [data, setData] = useState<LavoroDettaglio | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegistra, setShowRegistra] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAssignments, setShowAssignments] = useState(false);
  const confirm = useConfirm();
  const { push } = useToast();
  const navigate = useNavigate();

  async function handleDelete() {
    if (!data) return;
    const ok = await confirm({
      title: `Eliminare il lavoro #${data.id}`,
      message:
        `Stai per eliminare il lavoro di ${data.nome_paziente}. ` +
        `Il record rimarrà nello storico per la tracciabilità MDR ma ` +
        `sparirà dalle liste. Procedere?`,
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/lavori/${data.id}`);
      push(`Lavoro #${data.id} eliminato`, 'success');
      onChanged();
      onClose();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Errore', 'error');
    }
  }

  const fetchData = useCallback(async () => {
    if (idLavoro == null) return;
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        api.get<LavoroDettaglio>(`/api/lavori/${idLavoro}`),
        api.get<TimelineEvent[]>(`/api/lavori/${idLavoro}/timeline`),
      ]);
      setData(d);
      setTimeline(t);
    } finally {
      setLoading(false);
    }
  }, [idLavoro]);

  useEffect(() => {
    if (idLavoro != null) {
      void fetchData();
      setShowRegistra(false);
    } else {
      setData(null);
    }
  }, [idLavoro, fetchData]);

  return (
    <Modal
      open={idLavoro != null}
      onClose={onClose}
      title={data ? `Lavoro #${data.id} — ${data.nome_paziente}` : 'Caricamento…'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Chiudi</button>
          {data && (
            <>
              <button type="button" className="btn-danger" onClick={() => void handleDelete()}>
                Elimina
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/lavori/${data.id}/stampa`)}
              >
                Stampa
              </button>
              <button type="button" onClick={() => setShowEdit(true)}>Modifica</button>
            </>
          )}
        </>
      }
    >
      {loading && <p>Caricamento…</p>}
      {data && (
        <div className="detail">
          <section>
            <h3>Anagrafica</h3>
            <dl className="kv">
              <dt>Dottore</dt>
              <dd>
                {data.dottore_nome}
                {data.dottore_studio ? <span className="muted"> — {data.dottore_studio}</span> : null}
              </dd>
              <dt>Paziente</dt>
              <dd>{data.nome_paziente}</dd>
              <dt>Stato</dt>
              <dd>
                <span className={`stato-pill stato-pill--${data.stato}`}>
                  {labelStatoLavoro(data.stato)}
                </span>
              </dd>
              <dt>Entrata</dt>
              <dd>{formatDate(data.data_entrata)}</dd>
              <dt>Consegna</dt>
              <dd>{formatDate(data.data_consegna)}</dd>
              <dt>Scala colori</dt>
              <dd>{data.scala_colori ?? <span className="muted">—</span>}</dd>
              <dt>Tipologia</dt>
              <dd>{data.tipologia_lavoro ?? <span className="muted">—</span>}</dd>
              <dt>Istruzioni</dt>
              <dd>{data.note_istruzioni ?? <span className="muted">—</span>}</dd>
            </dl>
          </section>

          <section>
            <header className="section-header">
              <h3>Collaboratori ({data.assegnazioni.filter((a) => !a.rimosso_at).length})</h3>
              <button type="button" onClick={() => setShowAssignments(true)}>Gestisci</button>
            </header>
            {data.assegnazioni.length === 0 ? <p className="muted">Nessun collaboratore assegnato.</p> : (
              <table className="table table--compact">
                <thead><tr><th>Collaboratore</th><th>Mansione</th><th>Assegnato il</th><th>Stato</th></tr></thead>
                <tbody>{data.assegnazioni.map((a) => <tr key={a.id} className={a.rimosso_at ? 'assignment-history-row' : ''}>
                  <td><strong>{a.collaboratore_nome}</strong></td>
                  <td>{a.mansione}</td>
                  <td>{formatDateTime(a.assegnato_at)}</td>
                  <td>{a.rimosso_at ? `Rimosso il ${formatDateTime(a.rimosso_at)}` : <span className="stato-pill stato-pill--in_corso">Attivo</span>}</td>
                </tr>)}</tbody>
              </table>
            )}
          </section>

          <section>
            <h3>Strutture ({data.strutture.length})</h3>
            {data.strutture.length === 0 ? (
              <p className="muted">Nessuna struttura registrata.</p>
            ) : (
              <ul className="strutture-list">
                {data.strutture.map((s) => (
                  <li key={s.id}>
                    <span className={`pill pill--${s.tipo_struttura}`}>
                      {labelTipoStruttura(s.tipo_struttura)}
                    </span>
                    <span>{s.elementi_dentali.join(' – ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <header className="section-header">
              <h3>Materiali utilizzati ({data.materiali.length})</h3>
              {!showRegistra && (
                <button type="button" onClick={() => setShowRegistra(true)}>
                  Aggiungi materiale
                </button>
              )}
            </header>

            {showRegistra && idLavoro != null && (
              <RegistraConsumoForm
                idLavoro={idLavoro}
                onCancel={() => setShowRegistra(false)}
                onSaved={() => {
                  setShowRegistra(false);
                  void fetchData();
                  onChanged();
                }}
              />
            )}

            {data.materiali.length === 0 ? (
              <p className="muted">Nessun materiale registrato per questo lavoro.</p>
            ) : (
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Materiale</th>
                    <th>Lotto</th>
                    <th>Deposito</th>
                    <th>Prelievo</th>
                    <th>Quantità</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.materiali.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.created_at)}</td>
                      <td>
                        {labelCategoria(m.categoria)}
                        {m.marca ? ` ${m.marca}` : ''}
                        {m.colore ? ` ${m.colore}` : ''}
                      </td>
                      <td>{m.lotto}</td>
                      <td>{m.deposito_nome ?? <span className="muted">—</span>}</td>
                      <td>
                        {m.stato_prelievo === 'nuovo'
                          ? <span className="stock-chip stock-chip--new">Nuovo</span>
                          : m.stato_prelievo === 'parziale'
                            ? <span className="stock-chip stock-chip--partial">Parziale</span>
                            : <span className="muted">Storico</span>}
                      </td>
                      <td>
                        {m.quantita_usata
                          ? `${m.quantita_usata}${m.unita_misura ? ' ' + m.unita_misura : ''}`
                          : <span className="muted">—</span>}
                      </td>
                      <td>{m.note ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3>Allegati ({data.allegati.length})</h3>
            <AllegatiSection
              idLavoro={data.id}
              allegati={data.allegati}
              onChanged={() => {
                void fetchData();
                onChanged();
              }}
            />
          </section>

          <section>
            <header className="section-header">
              <h3>Storico ({timeline.length})</h3>
              <button
                type="button"
                className="btn-link"
                onClick={() => setShowTimeline((v) => !v)}
              >
                {showTimeline ? 'Nascondi' : 'Mostra'}
              </button>
            </header>
            {showTimeline && (
              timeline.length === 0 ? (
                <p className="muted">Nessun evento registrato.</p>
              ) : (
                <ul className="timeline">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="timeline-item">
                      <span className="timeline-dot" />
                      <div className="timeline-body">
                        <div className="timeline-action">{labelAzione(ev)}</div>
                        <div className="timeline-meta muted">
                          {formatDateTime(ev.created_at)}
                          {ev.operatore_nome ? ` · ${ev.operatore_nome}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </div>
      )}
      <LavoroFormModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSaved={() => {
          void fetchData();
          onChanged();
        }}
        lavoro={data}
      />
      {data && <AssegnazioniModal
        open={showAssignments}
        idLavoro={data.id}
        current={data.assegnazioni}
        onClose={() => setShowAssignments(false)}
        onSaved={() => {
          void fetchData();
          onChanged();
        }}
      />}
    </Modal>
  );
}
