import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { RegistraConsumoForm } from './RegistraConsumoForm';
import { AllegatiSection } from './AllegatiSection';
import { LavoroFormModal } from './LavoroFormModal';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toaster';
import { api, ApiError, type LavoroDettaglio } from '../api';

interface Props {
  idLavoro: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export function LavoroDetailModal({ idLavoro, onClose, onChanged }: Props) {
  const [data, setData] = useState<LavoroDettaglio | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegistra, setShowRegistra] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
      const d = await api.get<LavoroDettaglio>(`/api/lavori/${idLavoro}`);
      setData(d);
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
              <dd>{data.stato}</dd>
              <dt>Entrata</dt>
              <dd>{data.data_entrata}</dd>
              <dt>Consegna</dt>
              <dd>{data.data_consegna}</dd>
              <dt>Scala colori</dt>
              <dd>{data.scala_colori ?? <span className="muted">—</span>}</dd>
              <dt>Tipologia</dt>
              <dd>{data.tipologia_lavoro ?? <span className="muted">—</span>}</dd>
              <dt>Istruzioni</dt>
              <dd>{data.note_istruzioni ?? <span className="muted">—</span>}</dd>
            </dl>
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
                      {s.tipo_struttura === 'ponte' ? 'Ponte' : 'Corona'}
                    </span>
                    <span>{s.elementi_dentali.join(' – ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <header className="section-header">
              <h3>Materiali consumati ({data.materiali.length})</h3>
              {!showRegistra && (
                <button type="button" onClick={() => setShowRegistra(true)}>
                  Registra consumo
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
                    <th>Quantità</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.materiali.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString('it-IT')}</td>
                      <td>
                        {m.categoria}
                        {m.marca ? ` ${m.marca}` : ''}
                        {m.colore ? ` ${m.colore}` : ''}
                      </td>
                      <td>{m.lotto}</td>
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
    </Modal>
  );
}
