import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { DottoreFormModal } from './DottoreFormModal';
import { api, type DottoreStats } from '../api';
import { formatDate, labelStatoLavoro, STATO_LAVORO_LABEL } from '../utils/format';

interface Props {
  idDottore: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export function DottoreDetailModal({ idDottore, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<DottoreStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const fetchData = useCallback(async () => {
    if (idDottore == null) return;
    setLoading(true);
    try {
      setData(await api.get<DottoreStats>(`/api/dottori/${idDottore}/stats`));
    } finally {
      setLoading(false);
    }
  }, [idDottore]);

  useEffect(() => {
    if (idDottore != null) void fetchData();
    else setData(null);
  }, [idDottore, fetchData]);

  return (
    <Modal
      open={idDottore != null}
      onClose={onClose}
      title={data ? data.dottore.nome : 'Caricamento…'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Chiudi</button>
          {data && <button type="button" onClick={() => setShowEdit(true)}>Modifica</button>}
        </>
      }
    >
      {loading && <p>Caricamento…</p>}
      {data && (
        <div className="detail">
          <section>
            <h3>Anagrafica</h3>
            <dl className="kv">
              <dt>Studio</dt><dd>{data.dottore.studio ?? <span className="muted">—</span>}</dd>
              <dt>Telefono</dt><dd>{data.dottore.telefono ?? <span className="muted">—</span>}</dd>
              <dt>Email</dt><dd>{data.dottore.email ?? <span className="muted">—</span>}</dd>
              {data.dottore.indirizzo && <><dt>Indirizzo</dt><dd>{data.dottore.indirizzo}</dd></>}
              {data.dottore.partita_iva && <><dt>P.IVA</dt><dd>{data.dottore.partita_iva}</dd></>}
              {data.dottore.codice_fiscale && <><dt>C.F.</dt><dd>{data.dottore.codice_fiscale}</dd></>}
              {data.dottore.note && <><dt>Note</dt><dd>{data.dottore.note}</dd></>}
            </dl>
          </section>

          <section>
            <h3>Statistiche</h3>
            <div className="dottore-stats">
              <div className="dottore-stat">
                <div className="dottore-stat-value">{data.riassunto.totale}</div>
                <div className="dottore-stat-label">Lavori totali</div>
              </div>
              <div className={`dottore-stat ${data.riassunto.in_ritardo > 0 ? 'dottore-stat--warn' : ''}`}>
                <div className="dottore-stat-value">{data.riassunto.in_ritardo}</div>
                <div className="dottore-stat-label">In ritardo</div>
              </div>
              <div className="dottore-stat">
                <div className="dottore-stat-value">
                  {data.riassunto.tempo_medio_giorni ?? '—'}
                  {data.riassunto.tempo_medio_giorni != null && <span className="dottore-stat-unit">gg</span>}
                </div>
                <div className="dottore-stat-label">Tempo medio richiesto</div>
              </div>
              <div className="dottore-stat">
                <div className="dottore-stat-value">
                  {data.riassunto.tempo_medio_finiti_giorni ?? '—'}
                  {data.riassunto.tempo_medio_finiti_giorni != null && <span className="dottore-stat-unit">gg</span>}
                </div>
                <div className="dottore-stat-label">Tempo medio (solo finiti)</div>
              </div>
            </div>

            <div className="dottore-counts">
              {([
                'in_attesa', 'in_corso_cad', 'attesa_rifinitura',
                'in_corso_rifinitura', 'in_prova', 'finito',
              ] as const).map((s) => (
                <span key={s} className={`stato-pill stato-pill--${s}`}>
                  {STATO_LAVORO_LABEL[s]}: {data.counts[s]}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3>Ultimi lavori ({data.ultimi.length})</h3>
            {data.ultimi.length === 0 ? (
              <p className="muted">Nessun lavoro per questo dottore.</p>
            ) : (
              <table className="table table--compact table--clickable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Paziente</th>
                    <th>Tipologia</th>
                    <th>Consegna</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ultimi.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => {
                        onClose();
                        navigate(`/lavori?open=${l.id}`);
                      }}
                    >
                      <td>#{l.id}</td>
                      <td>{l.nome_paziente}</td>
                      <td>{l.tipologia_lavoro ?? <span className="muted">—</span>}</td>
                      <td>{formatDate(l.data_consegna)}</td>
                      <td><span className={`stato-pill stato-pill--${l.stato}`}>{labelStatoLavoro(l.stato)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {data && (
        <DottoreFormModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            void fetchData();
            onChanged();
          }}
          dottore={data.dottore}
        />
      )}
    </Modal>
  );
}
