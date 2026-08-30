import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

type AiProvider = 'ollama' | 'mlx';

interface AiSettings {
  ai_provider: AiProvider;
  ai_model: string;
  ollama_url: string;
  mlx_url: string;
}

interface AiHealth {
  provider: AiProvider;
  model: string;
  ready: boolean;
  installed: string[];
  error?: string;
}

interface AiTestResult {
  ok: boolean;
  ms: number;
  sample?: string;
  error?: string;
}

/**
 * Suggerimenti modelli mostrati come datalist accanto al campo `ai_model`.
 * Liste curate per i due provider — l'utente può comunque digitare qualsiasi
 * id (es. un fine-tune custom).
 */
const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  ollama: [
    'qwen3.5:9b-q4_K_M',
    'qwen3:14b',
    'deepseek-r1:14b',
    'qwen2.5-coder:7b',
    'qwen3:8b',
  ],
  mlx: [
    'mlx-community/Qwen3.5-9B-MLX-4bit',
    'mlx-community/Qwen3.5-9B-OptiQ-4bit',
    'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit',
    'mlx-community/Qwen3.5-4B-MLX-4bit',
  ],
};

export function ImpostazioniPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<AiSettings | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([
        api.get<AiSettings>('/api/admin/settings/ai'),
        api.get<AiHealth>('/api/admin/settings/ai/health').catch(
          (err: unknown) => (err instanceof ApiError ? null : null),
        ),
      ]);
      setForm(s);
      setSavedSnapshot(s);
      setHealth(h);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore di rete');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  if (user?.ruolo !== 'admin') {
    return (
      <div className="page">
        <h1>Impostazioni</h1>
        <p className="muted">Pagina riservata agli amministratori.</p>
      </div>
    );
  }

  function update<K extends keyof AiSettings>(key: K, value: AiSettings[K]) {
    setSavedMsg(null);
    setTestResult(null);
    setForm((curr) => (curr ? { ...curr, [key]: value } : curr));
  }

  function switchProvider(p: AiProvider) {
    setSavedMsg(null);
    setTestResult(null);
    setForm((curr) => {
      if (!curr) return curr;
      // Quando l'utente cambia provider, suggerisco il modello di default
      // tipico per quel provider — ma solo se il campo è ancora il default
      // dell'altro provider, per non sovrascrivere una scelta manuale.
      const isDefaultForOther =
        MODEL_SUGGESTIONS[p === 'ollama' ? 'mlx' : 'ollama'].includes(curr.ai_model);
      const next: AiSettings = {
        ...curr,
        ai_provider: p,
        ai_model: isDefaultForOther ? (MODEL_SUGGESTIONS[p][0] ?? curr.ai_model) : curr.ai_model,
      };
      return next;
    });
  }

  async function onTest() {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await api.post<AiTestResult>('/api/admin/settings/ai/test', form);
      setTestResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as Partial<AiTestResult> | undefined;
        setTestResult({
          ok: false,
          ms: body?.ms ?? 0,
          error: body?.error ?? err.message,
        });
      } else {
        setError('Errore di rete');
      }
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const updated = await api.put<AiSettings>('/api/admin/settings/ai', form);
      setForm(updated);
      setSavedSnapshot(updated);
      setSavedMsg('Impostazioni salvate. Il prossimo messaggio della chat userà il nuovo provider.');
      // Ricarico anche lo stato di salute, ora riflette il nuovo provider.
      const h = await api.get<AiHealth>('/api/admin/settings/ai/health').catch(() => null);
      setHealth(h);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore di rete');
    } finally {
      setSaving(false);
    }
  }

  const dirty = form && savedSnapshot && (
    form.ai_provider !== savedSnapshot.ai_provider ||
    form.ai_model !== savedSnapshot.ai_model ||
    form.ollama_url !== savedSnapshot.ollama_url ||
    form.mlx_url !== savedSnapshot.mlx_url
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Impostazioni</h1>
      </header>

      {loading && <p>Caricamento…</p>}
      {error && <div className="alert-error">{error}</div>}

      {form && (
        <>
          <section className="card settings-card">
            <header className="card-header">
              <h2>Modello AI</h2>
              {health && (
                <span className={`pill pill--${health.ready ? 'admin' : 'tecnico'}`}>
                  {health.ready ? 'Pronto' : 'Non pronto'}
                </span>
              )}
            </header>

            <p className="muted" style={{ marginTop: 0 }}>
              Provider attivo: <strong>{savedSnapshot?.ai_provider ?? '—'}</strong>
              {savedSnapshot?.ai_model ? ` · modello: ${savedSnapshot.ai_model}` : ''}.
              {' '}Le modifiche entrano in uso dal messaggio successivo della Chat.
            </p>

            <div className="settings-grid">
              <label>
                <span>Provider</span>
                <div className="provider-toggle">
                  <button
                    type="button"
                    className={form.ai_provider === 'ollama' ? 'provider-btn provider-btn--active' : 'provider-btn'}
                    onClick={() => switchProvider('ollama')}
                  >
                    Ollama
                  </button>
                  <button
                    type="button"
                    className={form.ai_provider === 'mlx' ? 'provider-btn provider-btn--active' : 'provider-btn'}
                    onClick={() => switchProvider('mlx')}
                  >
                    MLX (Apple Silicon)
                  </button>
                </div>
              </label>

              <label>
                <span>Modello</span>
                <input
                  type="text"
                  list="ai-model-suggestions"
                  value={form.ai_model}
                  onChange={(e) => update('ai_model', e.target.value)}
                  placeholder={form.ai_provider === 'mlx'
                    ? 'mlx-community/Qwen3.5-9B-MLX-4bit'
                    : 'qwen3.5:9b-q4_K_M'}
                />
                <datalist id="ai-model-suggestions">
                  {MODEL_SUGGESTIONS[form.ai_provider].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>

              <label>
                <span>URL Ollama</span>
                <input
                  type="text"
                  value={form.ollama_url}
                  onChange={(e) => update('ollama_url', e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </label>

              <label>
                <span>URL MLX</span>
                <input
                  type="text"
                  value={form.mlx_url}
                  onChange={(e) => update('mlx_url', e.target.value)}
                  placeholder="http://127.0.0.1:8080"
                />
              </label>
            </div>

            <div className="settings-actions">
              <button type="button" onClick={() => void onTest()} disabled={testing || saving}>
                {testing ? 'Test in corso…' : 'Prova connessione'}
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving || testing || !dirty}
                className="btn-primary"
              >
                {saving ? 'Salvataggio…' : 'Salva'}
              </button>
              {!dirty && savedMsg && <span className="muted">{savedMsg}</span>}
            </div>

            {testResult && (
              <div className={testResult.ok ? 'alert-ok' : 'alert-error'} style={{ marginTop: '0.75rem' }}>
                {testResult.ok ? (
                  <>Connessione OK — round-trip <strong>{testResult.ms} ms</strong>
                  {testResult.sample ? <> · risposta: <code>{testResult.sample}</code></> : null}
                  </>
                ) : (
                  <>Connessione fallita {testResult.ms ? `(${testResult.ms} ms)` : ''} — {testResult.error}</>
                )}
              </div>
            )}

            {health?.installed && health.installed.length > 0 && (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Modelli noti al provider attivo:{' '}
                {health.installed.map((m) => (
                  <code key={m} style={{ marginRight: '0.4rem' }}>{m}</code>
                ))}
              </p>
            )}
          </section>

          <section className="card settings-help">
            <header className="card-header"><h2>Quando usare cosa</h2></header>
            <ul>
              <li>
                <strong>Ollama</strong> — provider predefinito e multipiattaforma.
                Su Windows usa direttamente le GPU NVIDIA; il modello consigliato
                è <code>qwen3.5:9b-q4_K_M</code>.
              </li>
              <li>
                <strong>MLX</strong> — runtime nativo Apple per Apple Silicon.
                Su M-series tende ad essere più rapido per token, soprattutto su
                quantizzazioni 4bit. Usa Hugging Face IDs (es.{' '}
                <code>mlx-community/Qwen3.5-9B-MLX-4bit</code>).
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
