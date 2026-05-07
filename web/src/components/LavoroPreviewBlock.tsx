import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Odontogramma } from './Odontogramma';
import { FilePreviewModal } from './FilePreviewModal';
import { api, BASE_URL, type LavoroDettaglio, type Allegato } from '../api';
import { formatDate, labelStatoLavoro, labelTipoStruttura } from '../utils/format';

interface Props {
  idLavoro: number;
}

function isStl(filename: string): boolean {
  return /\.stl$/i.test(filename);
}

/**
 * Mini-card "ricca" mostrata nel chatbot quando il risultato è un singolo
 * lavoro: anagrafica essenziale + odontogramma readonly + lista allegati
 * con anteprima STL on-click.
 */
export function LavoroPreviewBlock({ idLavoro }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<LavoroDettaglio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Allegato | null>(null);

  useEffect(() => {
    let cancel = false;
    api.get<LavoroDettaglio>(`/api/lavori/${idLavoro}`)
      .then((d) => { if (!cancel) setData(d); })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Errore');
      });
    return () => { cancel = true; };
  }, [idLavoro]);

  if (error) {
    return <div className="chat-preview chat-preview--error muted">Impossibile caricare il dettaglio: {error}</div>;
  }
  if (!data) {
    return <div className="chat-preview muted">Caricamento dettaglio…</div>;
  }

  const struttureSemplici = data.strutture.map((s) => ({
    tipo_struttura: s.tipo_struttura,
    elementi_dentali: s.elementi_dentali,
  }));

  return (
    <div className="chat-preview">
      <header className="chat-preview-header">
        <div>
          <div className="chat-preview-title">
            #{data.id} — {data.nome_paziente}
          </div>
          <div className="chat-preview-sub muted">
            {data.dottore_nome}
            {data.dottore_studio ? ` · ${data.dottore_studio}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={() => navigate(`/lavori?open=${data.id}`)}
        >
          Apri completo →
        </button>
      </header>

      <div className="chat-preview-meta">
        <span className={`stato-pill stato-pill--${data.stato}`}>
          {labelStatoLavoro(data.stato)}
        </span>
        <span className="muted">Consegna: <strong>{formatDate(data.data_consegna)}</strong></span>
        {data.scala_colori && <span className="muted">Colore: {data.scala_colori}</span>}
      </div>

      {data.strutture.length > 0 && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">
            Odontogramma · {data.strutture.length} {data.strutture.length === 1 ? 'struttura' : 'strutture'}
          </div>
          <Odontogramma value={struttureSemplici} readonly />
        </div>
      )}

      {data.allegati.length > 0 && (
        <div className="chat-preview-section">
          <div className="chat-preview-section-title">
            Allegati · {data.allegati.length}
          </div>
          <ul className="chat-preview-files">
            {data.allegati.map((a) => (
              <li key={a.id}>
                <span className="file-icon">{isStl(a.nome_file) ? '🧊' : '📎'}</span>
                <button
                  type="button"
                  className="file-name file-name--button"
                  onClick={() => setPreview(a)}
                >
                  {a.nome_file}
                </button>
                {isStl(a.nome_file) && (
                  <span className="badge-stl">STL</span>
                )}
                <a
                  className="btn-link"
                  href={`${BASE_URL}/api/lavori/${data.id}/allegati/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Scarica
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilePreviewModal
        open={preview != null}
        onClose={() => setPreview(null)}
        idLavoro={data.id}
        allegato={preview}
      />
    </div>
  );
}
