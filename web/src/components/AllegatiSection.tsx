import { useRef, useState } from 'react';
import { api, ApiError, BASE_URL, uploadFile, type Allegato } from '../api';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toaster';
import { FilePreviewModal } from './FilePreviewModal';

interface Props {
  idLavoro: number;
  allegati: Allegato[];
  onChanged: () => void;
  readOnly?: boolean;
}

function formatBytes(b: string | null): string {
  if (!b) return '';
  const n = Number(b);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'stl') return '🧊';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return '🖼';
  if (ext === 'pdf') return '📄';
  return '📎';
}

export function AllegatiSection({ idLavoro, allegati, onChanged, readOnly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Allegato | null>(null);
  const confirm = useConfirm();
  const { push } = useToast();

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile(`/api/lavori/${idLavoro}/allegati`, file);
      push(`Allegato "${file.name}" caricato`, 'success');
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Errore nell\'upload';
      setError(msg);
      push(msg, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(idAllegato: number, nomeFile: string) {
    const ok = await confirm({
      title: 'Eliminare allegato',
      message: `Eliminare "${nomeFile}"? L'azione è irreversibile.`,
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/lavori/${idLavoro}/allegati/${idAllegato}`);
      push('Allegato eliminato', 'success');
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Errore';
      setError(msg);
      push(msg, 'error');
    }
  }

  return (
    <div>
      {!readOnly && <div className="upload-row">
        <input
          ref={inputRef}
          type="file"
          accept=".stl,.STL,.zip,.pdf,image/*"
          onChange={handleSelect}
          disabled={uploading}
        />
        {uploading && <span className="muted">Upload in corso…</span>}
      </div>}
      {error && <div className="error">{error}</div>}
      {allegati.length === 0 ? (
        <p className="muted">Nessun allegato.</p>
      ) : (
        <ul className="allegati-list">
          {allegati.map((a) => (
            <li key={a.id}>
              <span className="file-icon">{fileIcon(a.nome_file)}</span>
              <button
                type="button"
                className="file-name file-name--button"
                onClick={() => setPreview(a)}
                title="Anteprima"
              >
                {a.nome_file}
              </button>
              <span className="file-size">{formatBytes(a.size_bytes)}</span>
              <a
                className="btn-link"
                href={`${BASE_URL}/api/lavori/${idLavoro}/allegati/${a.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Scarica
              </a>
              {!readOnly && <button
                type="button"
                className="btn-link"
                onClick={() => void handleDelete(a.id, a.nome_file)}
              >
                Elimina
              </button>}
            </li>
          ))}
        </ul>
      )}
      <FilePreviewModal
        open={preview != null}
        onClose={() => setPreview(null)}
        idLavoro={idLavoro}
        allegato={preview}
      />
    </div>
  );
}
