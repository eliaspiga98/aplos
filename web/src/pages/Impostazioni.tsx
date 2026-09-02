import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useI18n, type Language } from '../i18n';

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

type BackupSchedule = 'disabled' | 'daily' | 'weekly';

interface DatabaseSettings {
  database: {
    engine: 'PostgreSQL';
    database_name: string;
    server_host: string;
    server_port: number;
    server_address: string | null;
    data_directory: string | null;
  };
  backup: {
    backup_directory: string;
    backup_directory_resolved: string;
    backup_schedule: BackupSchedule;
    backup_retention_count: number;
    backup_last_at: string | null;
    backup_last_file: string | null;
    backup_last_size_bytes: number | null;
    backup_last_error: string | null;
    backup_running: boolean;
  };
  storage: {
    config_directory: string;
    config_directory_resolved: string;
    config_file: string;
    uploads_directory: string;
    uploads_directory_resolved: string;
    restart_required_for_config: boolean;
  };
}

interface BackupForm {
  backup_directory: string;
  backup_schedule: BackupSchedule;
  backup_retention_count: number;
}

interface StorageForm {
  config_directory: string;
  uploads_directory: string;
}

function formatBytes(value: number | null): string {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
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
  const { language, setLanguage, t, locale } = useI18n();
  const [form, setForm] = useState<AiSettings | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [databaseSettings, setDatabaseSettings] = useState<DatabaseSettings | null>(null);
  const [backupForm, setBackupForm] = useState<BackupForm | null>(null);
  const [backupSnapshot, setBackupSnapshot] = useState<BackupForm | null>(null);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [storageForm, setStorageForm] = useState<StorageForm | null>(null);
  const [storageSnapshot, setStorageSnapshot] = useState<StorageForm | null>(null);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [languageSaving, setLanguageSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (user?.ruolo !== 'admin') {
      setLoading(false);
      return;
    }
    try {
      const [s, h, database] = await Promise.all([
        api.get<AiSettings>('/api/admin/settings/ai'),
        api.get<AiHealth>('/api/admin/settings/ai/health').catch(
          (err: unknown) => (err instanceof ApiError ? null : null),
        ),
        api.get<DatabaseSettings>('/api/admin/settings/database'),
      ]);
      setForm(s);
      setSavedSnapshot(s);
      setHealth(h);
      setDatabaseSettings(database);
      const nextBackup: BackupForm = {
        backup_directory: database.backup.backup_directory,
        backup_schedule: database.backup.backup_schedule,
        backup_retention_count: database.backup.backup_retention_count,
      };
      setBackupForm(nextBackup);
      setBackupSnapshot(nextBackup);
      const nextStorage: StorageForm = {
        config_directory: database.storage.config_directory,
        uploads_directory: database.storage.uploads_directory,
      };
      setStorageForm(nextStorage);
      setStorageSnapshot(nextStorage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore di rete');
    } finally {
      setLoading(false);
    }
  }, [user?.ruolo]);

  useEffect(() => { void loadAll(); }, [loadAll]);

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

  async function onBackupSave() {
    if (!backupForm) return;
    setBackupSaving(true);
    setError(null);
    setBackupMessage(null);
    try {
      await api.put('/api/admin/settings/database/backup', backupForm);
      const database = await api.get<DatabaseSettings>('/api/admin/settings/database');
      setDatabaseSettings(database);
      const saved: BackupForm = {
        backup_directory: database.backup.backup_directory,
        backup_schedule: database.backup.backup_schedule,
        backup_retention_count: database.backup.backup_retention_count,
      };
      setBackupForm(saved);
      setBackupSnapshot(saved);
      setBackupMessage('Configurazione backup salvata.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore di rete');
    } finally {
      setBackupSaving(false);
    }
  }

  async function onBackupRun() {
    setBackupRunning(true);
    setError(null);
    setBackupMessage(null);
    try {
      const result = await api.post<{ file: string; size_bytes: number }>('/api/admin/settings/database/backup/run');
      setBackupMessage(`Backup completato: ${result.file} (${formatBytes(result.size_bytes)}).`);
      setDatabaseSettings(await api.get<DatabaseSettings>('/api/admin/settings/database'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore di rete');
    } finally {
      setBackupRunning(false);
    }
  }

  async function onStorageSave() {
    if (!storageForm) return;
    setStorageSaving(true);
    setError(null);
    setStorageMessage(null);
    try {
      await api.put('/api/admin/settings/storage', storageForm);
      const database = await api.get<DatabaseSettings>('/api/admin/settings/database');
      setDatabaseSettings(database);
      const saved = {
        config_directory: database.storage.config_directory,
        uploads_directory: database.storage.uploads_directory,
      };
      setStorageForm(saved);
      setStorageSnapshot(saved);
      setStorageMessage(t('Percorsi salvati.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Errore di rete'));
    } finally {
      setStorageSaving(false);
    }
  }

  async function onLanguageChange(next: Language) {
    if (next === language) return;
    setLanguageSaving(true);
    setError(null);
    try {
      await setLanguage(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Errore di rete'));
    } finally {
      setLanguageSaving(false);
    }
  }

  const dirty = form && savedSnapshot && (
    form.ai_provider !== savedSnapshot.ai_provider ||
    form.ai_model !== savedSnapshot.ai_model ||
    form.ollama_url !== savedSnapshot.ollama_url ||
    form.mlx_url !== savedSnapshot.mlx_url
  );
  const backupDirty = backupForm && backupSnapshot && (
    backupForm.backup_directory !== backupSnapshot.backup_directory ||
    backupForm.backup_schedule !== backupSnapshot.backup_schedule ||
    backupForm.backup_retention_count !== backupSnapshot.backup_retention_count
  );
  const storageDirty = storageForm && storageSnapshot && (
    storageForm.config_directory !== storageSnapshot.config_directory ||
    storageForm.uploads_directory !== storageSnapshot.uploads_directory
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Impostazioni</h1>
      </header>

      {loading && <p>Caricamento…</p>}
      {error && <div className="alert-error">{error}</div>}

      <section className="card settings-card">
        <header className="card-header"><h2>Preferenze personali</h2></header>
        <div className="settings-grid">
          <label>
            <span>Lingua</span>
            <select
              value={language}
              onChange={(event) => void onLanguageChange(event.target.value as Language)}
              disabled={languageSaving}
            >
              <option value="it">Italiano</option>
              <option value="en">Inglese</option>
            </select>
          </label>
        </div>
        <p className="muted">La lingua viene applicata all’interfaccia e alle risposte di Aplo’s buddy.</p>
      </section>

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

          {databaseSettings && backupForm && (
            <section className="card settings-card">
              <header className="card-header">
                <h2>Database e backup</h2>
                {databaseSettings.backup.backup_running && (
                  <span className="pill pill--tecnico">Backup in corso</span>
                )}
              </header>

              <div className="database-location">
                <div>
                  <span>Database utilizzato</span>
                  <code>{databaseSettings.database.database_name}</code>
                </div>
                <div>
                  <span>Server PostgreSQL</span>
                  <code>{databaseSettings.database.server_host}:{databaseSettings.database.server_port}</code>
                </div>
                <div className="database-location--wide">
                  <span>Percorso dati PostgreSQL</span>
                  <code>{databaseSettings.database.data_directory ?? 'Non disponibile con i permessi applicativi'}</code>
                </div>
              </div>

              <p className="muted">
                Il percorso dati è gestito da PostgreSQL e non deve essere modificato o copiato
                mentre il database è in esecuzione. Usa i backup qui sotto per creare copie consistenti.
              </p>

              {storageForm && (
                <>
                  <h3>Dati e percorsi</h3>
                  <p className="muted">
                    Configurazione e allegati esistenti vengono copiati automaticamente prima del cambio.
                  </p>
                  <div className="settings-grid">
                    <label>
                      <span>Cartella configurazione</span>
                      <input
                        type="text"
                        value={storageForm.config_directory}
                        onChange={(event) => {
                          setStorageMessage(null);
                          setStorageForm({ ...storageForm, config_directory: event.target.value });
                        }}
                        placeholder="C:\\ProgramData\\Aplos\\config"
                      />
                      <small className="muted">Percorso effettivo: {databaseSettings.storage.config_directory_resolved}</small>
                    </label>
                    <label>
                      <span>Cartella allegati</span>
                      <input
                        type="text"
                        value={storageForm.uploads_directory}
                        onChange={(event) => {
                          setStorageMessage(null);
                          setStorageForm({ ...storageForm, uploads_directory: event.target.value });
                        }}
                        placeholder="C:\\ProgramData\\Aplos\\uploads"
                      />
                      <small className="muted">Percorso effettivo: {databaseSettings.storage.uploads_directory_resolved}</small>
                    </label>
                  </div>
                  <div className="database-location" style={{ marginTop: '0.75rem' }}>
                    <div className="database-location--wide">
                      <span>File di configurazione attivo</span>
                      <code>{databaseSettings.storage.config_file}</code>
                    </div>
                  </div>
                  {databaseSettings.storage.restart_required_for_config && (
                    <p className="muted">Il cambio della cartella di configurazione sarà completo al prossimo riavvio.</p>
                  )}
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!storageDirty || storageSaving}
                      onClick={() => void onStorageSave()}
                    >
                      {storageSaving ? 'Salvataggio…' : 'Salva percorsi'}
                    </button>
                    {storageMessage && <span className="muted">{storageMessage}</span>}
                  </div>
                </>
              )}

              <div className="settings-grid">
                <label>
                  <span>Cartella di salvataggio sul PC server</span>
                  <input
                    type="text"
                    value={backupForm.backup_directory}
                    onChange={(e) => {
                      setBackupMessage(null);
                      setBackupForm({ ...backupForm, backup_directory: e.target.value });
                    }}
                    placeholder="D:\\Backup\\Aplos"
                  />
                  <small className="muted">
                    Percorso effettivo: {databaseSettings.backup.backup_directory_resolved}
                  </small>
                </label>

                <label>
                  <span>Backup automatico</span>
                  <select
                    value={backupForm.backup_schedule}
                    onChange={(e) => {
                      setBackupMessage(null);
                      setBackupForm({ ...backupForm, backup_schedule: e.target.value as BackupSchedule });
                    }}
                  >
                    <option value="disabled">Disattivato</option>
                    <option value="daily">Ogni giorno</option>
                    <option value="weekly">Ogni settimana</option>
                  </select>
                </label>

                <label>
                  <span>Numero massimo di backup conservati</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={backupForm.backup_retention_count}
                    onChange={(e) => {
                      setBackupMessage(null);
                      setBackupForm({ ...backupForm, backup_retention_count: Number(e.target.value) });
                    }}
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void onBackupSave()}
                  disabled={!backupDirty || backupSaving || backupRunning}
                >
                  {backupSaving ? 'Salvataggio…' : 'Salva configurazione'}
                </button>
                <button
                  type="button"
                  onClick={() => void onBackupRun()}
                  disabled={!!backupDirty || backupSaving || backupRunning}
                >
                  {backupRunning ? 'Backup in corso…' : 'Esegui backup ora'}
                </button>
                {backupDirty && <span className="muted">Salva prima le modifiche.</span>}
              </div>

              {backupMessage && <div className="alert-ok settings-backup-result">{backupMessage}</div>}
              {databaseSettings.backup.backup_last_error && (
                <div className="alert-error settings-backup-result">
                  Ultimo errore: {databaseSettings.backup.backup_last_error}
                </div>
              )}

              <div className="backup-last muted">
                <span>
                  Ultimo backup:{' '}
                  <strong>
                    {databaseSettings.backup.backup_last_at
                      ? new Date(databaseSettings.backup.backup_last_at).toLocaleString(locale)
                      : 'mai eseguito'}
                  </strong>
                </span>
                {databaseSettings.backup.backup_last_file && (
                  <span>File: <code>{databaseSettings.backup.backup_last_file}</code></span>
                )}
                <span>Dimensione: {formatBytes(databaseSettings.backup.backup_last_size_bytes)}</span>
              </div>
            </section>
          )}

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
