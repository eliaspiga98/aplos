import { useEffect, useRef, useState } from 'react';

import {
  api, ApiError, uploadFile, type CategoriaDocumento, type Documento,
} from '../api';
import { Modal } from './Modal';
import { useToast } from './Toaster';

interface Props {
  open: boolean;
  categories: CategoriaDocumento[];
  selectedCategoryId: number | null;
  document?: Documento | null;
  onClose: () => void;
  onSaved: (document: Documento) => void;
}

export function DocumentoFormModal({
  open, categories, selectedCategoryId, document, onClose, onSaved,
}: Props) {
  const isEdit = document != null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    setTitle(document?.titolo ?? '');
    setCategoryId(String(document?.id_categoria ?? selectedCategoryId ?? categories[0]?.id ?? ''));
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [categories, document, open, selectedCategoryId]);

  function selectFile(next: File | null) {
    setFile(next);
    if (next && !title.trim()) setTitle(next.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!categoryId || (!isEdit && !file)) return;
    setBusy(true);
    setError(null);
    try {
      let saved: Documento;
      if (isEdit) {
        saved = await api.patch<Documento>(`/api/documenti/${document.id}`, {
          titolo: title.trim(),
          id_categoria: Number(categoryId),
        });
        push(`Documento "${saved.titolo}" aggiornato`);
      } else {
        const params = new URLSearchParams({
          id_categoria: categoryId,
          titolo: title.trim(),
        });
        saved = await uploadFile<Documento>(`/api/documenti?${params}`, file!);
        if (saved.stato_indicizzazione === 'pronto') {
          push(`Documento "${saved.titolo}" indicizzato`);
        } else {
          push('PDF caricato, ma non contiene testo selezionabile', 'info');
        }
      }
      onSaved(saved);
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Impossibile salvare il documento');
    } finally {
      setBusy(false);
    }
  }

  const valid = title.trim().length > 0 && categoryId.length > 0 && (isEdit || file != null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifica documento' : 'Carica un PDF'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" form="documento-form" disabled={busy || !valid}>
            {busy ? 'Indicizzazione…' : isEdit ? 'Salva modifiche' : 'Carica e indicizza'}
          </button>
        </>
      }
    >
      <form id="documento-form" className="form-grid" onSubmit={submit}>
        <label>
          Titolo*
          <input
            autoFocus={isEdit}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="es. Protocollo di sinterizzazione zirconio"
            maxLength={200}
            required
          />
        </label>
        <label>
          Categoria*
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            <option value="">— seleziona categoria —</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.nome}</option>
            ))}
          </select>
        </label>
        {!isEdit && (
          <label className="document-file-field">
            File PDF*
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,.PDF"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              required
            />
            <span className="form-hint">
              Il testo viene estratto sul server locale. I PDF composti solo da scansioni richiedono OCR e verranno segnalati.
            </span>
          </label>
        )}
        {isEdit && (
          <div className="document-current-file">
            <span>File originale</span>
            <strong>{document.nome_file}</strong>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </form>
    </Modal>
  );
}
