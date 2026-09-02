import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  api, ApiError, BASE_URL, streamNdjsonPost,
  type CategoriaDocumento, type Documento, type DocumentoFonte,
  type DocumentQuestionEvent,
} from '../api';
import { CategoriaDocumentoFormModal } from '../components/CategoriaDocumentoFormModal';
import { DocumentoFormModal } from '../components/DocumentoFormModal';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toaster';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatDateTime } from '../utils/format';

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PdfMark() {
  return (
    <span className="document-pdf-mark" aria-hidden="true">
      <svg viewBox="0 0 28 34" width="28" height="34">
        <path d="M4 1h13l7 7v25H4z" />
        <path d="M17 1v8h7" />
        <path d="M8 17h12M8 22h9M8 27h7" />
      </svg>
    </span>
  );
}

export function DocumentiPage() {
  const [categories, setCategories] = useState<CategoriaDocumento[]>([]);
  const [documents, setDocuments] = useState<Documento[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoriaDocumento | null>(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Documento | null>(null);
  const [scopeDocument, setScopeDocument] = useState<Documento | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<DocumentoFonte[]>([]);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [questionPhase, setQuestionPhase] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  const { push } = useToast();
  const debouncedSearch = useDebouncedValue(search, 250);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const totalDocuments = categories.reduce((total, category) => total + Number(category.documenti_count), 0);

  const loadCategories = useCallback(async () => {
    const rows = await api.get<CategoriaDocumento[]>('/api/documenti/categorie');
    setCategories(rows);
    return rows;
  }, []);

  const loadDocuments = useCallback(async (categoryId: number | null, query: string) => {
    const params = new URLSearchParams();
    if (categoryId != null) params.set('id_categoria', String(categoryId));
    if (query.trim()) params.set('q', query.trim());
    const rows = await api.get<Documento[]>(`/api/documenti${params.size ? `?${params}` : ''}`);
    setDocuments(rows);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCategories(), loadDocuments(selectedCategoryId, debouncedSearch)])
      .catch((error: unknown) => push(error instanceof ApiError ? error.message : 'Errore di caricamento', 'error'))
      .finally(() => setLoading(false));
  }, [debouncedSearch, loadCategories, loadDocuments, push, selectedCategoryId]);

  function selectCategory(id: number | null) {
    setSelectedCategoryId(id);
    setScopeDocument(null);
    setAnswer('');
    setSources([]);
    setQuestionError(null);
  }

  async function refresh() {
    await Promise.all([loadCategories(), loadDocuments(selectedCategoryId, debouncedSearch)]);
  }

  function openNewCategory() {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  }

  function openEditCategory(category: CategoriaDocumento) {
    setEditingCategory(category);
    setCategoryModalOpen(true);
  }

  async function deleteCategory(category: CategoriaDocumento) {
    const ok = await confirm({
      title: `Eliminare la categoria “${category.nome}”?`,
      message: 'La categoria può essere eliminata solo quando non contiene documenti.',
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/documenti/categorie/${category.id}`);
      if (selectedCategoryId === category.id) selectCategory(null);
      await refresh();
      push(`Categoria “${category.nome}” eliminata`);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Impossibile eliminare la categoria', 'error');
    }
  }

  function openNewDocument() {
    if (categories.length === 0) {
      openNewCategory();
      return;
    }
    setEditingDocument(null);
    setDocumentModalOpen(true);
  }

  function openEditDocument(document: Documento) {
    setEditingDocument(document);
    setDocumentModalOpen(true);
  }

  async function deleteDocument(document: Documento) {
    const ok = await confirm({
      title: `Eliminare “${document.titolo}”?`,
      message: 'Il documento non sarà più consultabile dall’intelligenza artificiale.',
      confirmText: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/documenti/${document.id}`);
      if (scopeDocument?.id === document.id) setScopeDocument(null);
      await refresh();
      push(`Documento “${document.titolo}” eliminato`);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Impossibile eliminare il documento', 'error');
    }
  }

  async function reindexDocument(document: Documento) {
    try {
      await api.post(`/api/documenti/${document.id}/reindicizza`);
      await refresh();
      push(`Documento “${document.titolo}” reindicizzato`);
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Impossibile reindicizzare il documento', 'error');
    }
  }

  function askAbout(document: Documento) {
    setScopeDocument(document);
    setQuestion('');
    setAnswer('');
    setSources([]);
    setQuestionError(null);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  async function askQuestion(event: React.FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || asking) return;
    setAsking(true);
    setAnswer('');
    setSources([]);
    setQuestionError(null);
    setQuestionPhase('Cerco nei documenti…');
    let streamedAnswer = '';
    try {
      const payload: Record<string, unknown> = { domanda: value };
      if (scopeDocument) payload.id_documento = scopeDocument.id;
      else if (selectedCategoryId != null) payload.id_categoria = selectedCategoryId;

      for await (const eventData of streamNdjsonPost<DocumentQuestionEvent>('/api/documenti/domanda', payload)) {
        if (eventData.type === 'phase') {
          setQuestionPhase(eventData.phase === 'answering' ? 'Preparo la risposta…' : 'Cerco nei documenti…');
        } else if (eventData.type === 'sources') {
          setSources(eventData.sources);
        } else if (eventData.type === 'token') {
          streamedAnswer += eventData.text;
          setAnswer(streamedAnswer);
          setQuestionPhase(null);
        } else if (eventData.type === 'done') {
          setAnswer(eventData.risposta);
          setSources(eventData.sources);
          setQuestionPhase(null);
        } else if (eventData.type === 'error') {
          setQuestionError(eventData.error);
          setQuestionPhase(null);
        }
      }
    } catch (error) {
      setQuestionError(error instanceof ApiError ? error.message : 'Errore di rete');
      setQuestionPhase(null);
    } finally {
      setAsking(false);
    }
  }

  const scopeLabel = scopeDocument
    ? scopeDocument.titolo
    : selectedCategory
      ? `Categoria: ${selectedCategory.nome}`
      : 'Tutti i documenti indicizzati';

  return (
    <div className="page documents-page">
      <header className="page-header documents-header">
        <div>
          <h1>Documenti</h1>
          <p className="page-subtitle">Protocolli, manuali e procedure consultabili dall’intelligenza artificiale.</p>
        </div>
        <button type="button" onClick={openNewDocument}>Carica PDF</button>
      </header>

      <div className="document-library">
        <aside className="document-category-rail" aria-label="Categorie documenti">
          <div className="document-category-heading">
            <span>Categorie</span>
            <button type="button" className="document-category-add" onClick={openNewCategory} aria-label="Nuova categoria" title="Nuova categoria">+</button>
          </div>
          <button
            type="button"
            className={`document-category-all ${selectedCategoryId == null ? 'is-active' : ''}`}
            onClick={() => selectCategory(null)}
          >
            <span>Tutti i documenti</span>
            <span className="document-count">{totalDocuments}</span>
          </button>
          <div className="document-category-list">
            {categories.map((category) => (
              <div key={category.id} className={`document-category-row ${selectedCategoryId === category.id ? 'is-active' : ''}`}>
                <button type="button" className="document-category-select" onClick={() => selectCategory(category.id)}>
                  <span>{category.nome}</span>
                  <span className="document-count">{category.documenti_count}</span>
                </button>
                <div className="document-category-actions">
                  <button type="button" onClick={() => openEditCategory(category)} title="Modifica categoria" aria-label={`Modifica ${category.nome}`}>✎</button>
                  <button type="button" onClick={() => void deleteCategory(category)} title="Elimina categoria" aria-label={`Elimina ${category.nome}`}>×</button>
                </div>
              </div>
            ))}
          </div>
          {categories.length === 0 && !loading && (
            <div className="document-category-empty">
              Crea la prima categoria per iniziare a raccogliere i protocolli.
            </div>
          )}
        </aside>

        <section className="document-workspace">
          <div className="document-ai-desk">
            <div className="document-ai-intro">
              <div className="document-ai-kicker">Aplo’s buddy · conoscenza interna</div>
              <h2>Chiedi ai documenti</h2>
              <p>La risposta usa solo i passaggi trovati nei PDF e indica documento e pagina.</p>
            </div>
            <form className="document-question-form" onSubmit={askQuestion}>
              <div className="document-question-scope">
                <span>Ambito</span>
                <strong title={scopeLabel}>{scopeLabel}</strong>
                {scopeDocument && (
                  <button type="button" onClick={() => setScopeDocument(null)}>Usa tutta la categoria</button>
                )}
              </div>
              <textarea
                ref={questionRef}
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Es. Quali sono i passaggi del protocollo di sinterizzazione?"
                maxLength={1500}
              />
              <div className="document-question-footer">
                <span>Ctrl/⌘ + Invio per chiedere</span>
                <button type="submit" disabled={asking || !question.trim()}>
                  {asking ? 'Analisi…' : 'Chiedi all’AI'}
                </button>
              </div>
            </form>
            {(questionPhase || answer || questionError) && (
              <div className={`document-answer ${questionError ? 'document-answer--error' : ''}`} aria-live="polite">
                {questionPhase && <div className="document-answer-phase"><span />{questionPhase}</div>}
                {questionError && <div className="error">{questionError}</div>}
                {answer && <div className="document-answer-text">{answer}</div>}
                {sources.length > 0 && (
                  <div className="document-sources">
                    <div className="document-sources-title">Fonti consultate</div>
                    {sources.map((source) => (
                      <a
                        key={`${source.ref}-${source.id_documento}-${source.pagina}`}
                        href={`${BASE_URL}/api/documenti/${source.id_documento}/file#page=${source.pagina}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>[{source.ref}]</span>
                        <strong>{source.titolo}</strong>
                        <small>{source.categoria} · pagina {source.pagina}</small>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="document-list-header">
            <div>
              <h2>{selectedCategory?.nome ?? 'Libreria completa'}</h2>
              <span>{documents.length} PDF</span>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca titolo o file…"
              aria-label="Cerca documenti"
            />
          </div>

          {loading ? (
            <p>Caricamento…</p>
          ) : documents.length === 0 ? (
            <div className="document-empty-state">
              <PdfMark />
              <h3>Nessun PDF in questo spazio</h3>
              <p>Carica un protocollo con testo selezionabile per renderlo consultabile dall’AI.</p>
              <button type="button" className="btn-secondary" onClick={openNewDocument}>Carica il primo PDF</button>
            </div>
          ) : (
            <div className="document-list">
              {documents.map((document) => (
                <article key={document.id} className="document-row">
                  <PdfMark />
                  <div className="document-row-main">
                    <div className="document-row-title">
                      <strong>{document.titolo}</strong>
                      <span className={`document-index-state document-index-state--${document.stato_indicizzazione}`}>
                        {document.stato_indicizzazione === 'pronto' ? 'Pronto per l’AI' : 'Testo non disponibile'}
                      </span>
                    </div>
                    <div className="document-row-meta">
                      <span>{document.categoria_nome}</span>
                      <span>{document.numero_pagine == null
                        ? '— pagine'
                        : document.numero_pagine === 1 ? '1 pagina' : `${document.numero_pagine} pagine`}</span>
                      <span>{formatBytes(document.size_bytes)}</span>
                      <span>{formatDateTime(document.created_at)}</span>
                    </div>
                    {document.errore_indicizzazione && (
                      <div className="document-row-error">{document.errore_indicizzazione}</div>
                    )}
                  </div>
                  <div className="document-row-actions">
                    {document.stato_indicizzazione === 'pronto' && (
                      <button type="button" className="document-ask-button" onClick={() => askAbout(document)}>Chiedi su questo</button>
                    )}
                    <a href={`${BASE_URL}/api/documenti/${document.id}/file`} target="_blank" rel="noreferrer">Apri PDF</a>
                    <button type="button" className="btn-link" onClick={() => openEditDocument(document)}>Modifica</button>
                    <button type="button" className="btn-link" onClick={() => void reindexDocument(document)}>Reindicizza</button>
                    <button type="button" className="btn-link btn-link--danger" onClick={() => void deleteDocument(document)}>Elimina</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <CategoriaDocumentoFormModal
        open={categoryModalOpen}
        category={editingCategory}
        onClose={() => setCategoryModalOpen(false)}
        onSaved={(saved) => {
          setSelectedCategoryId(saved.id);
          void refresh();
        }}
      />
      <DocumentoFormModal
        open={documentModalOpen}
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        document={editingDocument}
        onClose={() => setDocumentModalOpen(false)}
        onSaved={(saved) => {
          setSelectedCategoryId(saved.id_categoria);
          setScopeDocument(saved.stato_indicizzazione === 'pronto' ? saved : null);
          setAnswer('');
          setSources([]);
          setQuestionError(null);
          void refresh();
        }}
      />
    </div>
  );
}
