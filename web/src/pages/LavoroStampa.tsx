import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type LavoroDettaglio } from '../api';
import { formatDate, labelStatoLavoro, labelTipoStruttura, labelCategoria } from '../utils/format';

function formatBytes(b: string | null): string {
  if (!b) return '';
  const n = Number(b);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LavoroStampaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LavoroDettaglio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<LavoroDettaglio>(`/api/lavori/${id}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Errore di caricamento'),
      );
  }, [id]);

  if (error) {
    return (
      <div className="stampa-screen">
        <div className="error">{error}</div>
        <button type="button" onClick={() => navigate(-1)}>Indietro</button>
      </div>
    );
  }

  if (!data) {
    return <div className="stampa-screen"><p>Caricamento…</p></div>;
  }

  return (
    <div className="stampa-screen">
      <div className="stampa-toolbar no-print">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          ‹ Indietro
        </button>
        <button type="button" onClick={() => window.print()}>
          🖨 Stampa / Salva PDF
        </button>
      </div>

      <article className="scheda">
        <header className="scheda-header">
          <div className="scheda-brand">
            <img src="/aplos_logo.jpg" alt="Aplo's" className="scheda-logo" />
            <div>
              <div className="scheda-brand-name">Aplo's s.r.l.</div>
              <div className="scheda-brand-sub">Laboratorio odontotecnico</div>
            </div>
          </div>
          <div className="scheda-meta">
            <div><strong>Scheda lavoro #{data.id}</strong></div>
            <div className="muted">Stampato il {new Date().toLocaleString('it-IT')}</div>
          </div>
        </header>

        <section className="scheda-section">
          <h2>Anagrafica</h2>
          <table className="scheda-table">
            <tbody>
              <tr><th>Dottore</th><td>{data.dottore_nome}{data.dottore_studio ? ` — ${data.dottore_studio}` : ''}</td></tr>
              <tr><th>Paziente</th><td>{data.nome_paziente}</td></tr>
              <tr><th>Data entrata</th><td>{formatDate(data.data_entrata)}</td></tr>
              <tr><th>Data consegna</th><td><strong>{formatDate(data.data_consegna)}</strong></td></tr>
              <tr><th>Stato</th><td>{labelStatoLavoro(data.stato)}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="scheda-section">
          <h2>Dati tecnici</h2>
          <table className="scheda-table">
            <tbody>
              <tr><th>Scala colori</th><td>{data.scala_colori ?? '—'}</td></tr>
              <tr><th>Tipologia</th><td>{data.tipologia_lavoro ?? '—'}</td></tr>
              <tr>
                <th>Istruzioni</th>
                <td>
                  {data.note_istruzioni
                    ? <pre className="scheda-note">{data.note_istruzioni}</pre>
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="scheda-section">
          <h2>Odontogramma ({data.strutture.length} {data.strutture.length === 1 ? 'struttura' : 'strutture'})</h2>
          {data.strutture.length === 0 ? (
            <p>Nessuna struttura registrata.</p>
          ) : (
            <ul className="scheda-strutture">
              {data.strutture.map((s) => (
                <li key={s.id}>
                  <span className={`scheda-pill scheda-pill--${s.tipo_struttura}`}>
                    {labelTipoStruttura(s.tipo_struttura)}
                  </span>
                  <span className="scheda-denti">{s.elementi_dentali.join(' – ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="scheda-section">
          <h2>Materiali utilizzati ({data.materiali.length})</h2>
          {data.materiali.length === 0 ? (
            <p>Nessun materiale registrato.</p>
          ) : (
            <table className="scheda-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Marca / colore</th>
                  <th>Lotto</th>
                  <th>Deposito</th>
                  <th>Prelievo</th>
                  <th>Quantità</th>
                </tr>
              </thead>
              <tbody>
                {data.materiali.map((m) => (
                  <tr key={m.id}>
                    <td>{labelCategoria(m.categoria)}</td>
                    <td>
                      {m.marca ?? '—'}
                      {m.colore ? ` ${m.colore}` : ''}
                    </td>
                    <td>{m.lotto}</td>
                    <td>{m.deposito_nome ?? '—'}</td>
                    <td>{m.stato_prelievo === 'nuovo' ? 'Nuovo' : m.stato_prelievo === 'parziale' ? 'Parziale' : 'Storico'}</td>
                    <td>
                      {m.quantita_usata
                        ? `${m.quantita_usata}${m.unita_misura ? ' ' + m.unita_misura : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {data.allegati.length > 0 && (
          <section className="scheda-section">
            <h2>Allegati ({data.allegati.length})</h2>
            <ul className="scheda-allegati">
              {data.allegati.map((a) => (
                <li key={a.id}>
                  {a.nome_file} <span className="muted">({formatBytes(a.size_bytes)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="scheda-footer">
          <div className="scheda-firma">
            <div className="scheda-firma-line" />
            <div className="muted">Firma operatore</div>
          </div>
          <div className="scheda-firma">
            <div className="scheda-firma-line" />
            <div className="muted">Firma controllo qualità</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
