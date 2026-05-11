/**
 * Dispatcher LLM: legge il provider corrente da `app_settings` (DB) e
 * delega al provider giusto. Cache breve in-memory (5s) per evitare
 * una query DB per ogni chiamata LLM, ma abbastanza corta da non
 * lasciar percepire ritardi quando un admin cambia provider dal pannello.
 *
 * Quando un admin scrive sul pannello, l'endpoint PUT chiama
 * `invalidateLlmCache()` esplicitamente per propagare subito.
 */

import { pool } from '../db/pool.js';
import type { LlmMessage, LlmChatOptions, LlmProvider } from './providers/types.js';
import { makeOllamaProvider } from './providers/ollama.js';
import { makeMlxProvider } from './providers/mlx.js';

export type AiProviderName = 'ollama' | 'mlx';

export interface AiSettingsRow {
  ai_provider: AiProviderName;
  ai_model: string;
  ollama_url: string;
  mlx_url: string;
}

const CACHE_TTL_MS = 5000;
let cached: { provider: LlmProvider; settings: AiSettingsRow; expiresAt: number } | null = null;

async function readSettings(): Promise<AiSettingsRow> {
  const { rows } = await pool.query<AiSettingsRow>(
    `SELECT ai_provider, ai_model, ollama_url, mlx_url FROM app_settings WHERE id = 1`,
  );
  if (rows.length === 0) {
    throw new Error('app_settings: riga singleton mancante (migration 0004 non applicata?)');
  }
  return rows[0]!;
}

function buildProvider(s: AiSettingsRow): LlmProvider {
  if (s.ai_provider === 'mlx') {
    return makeMlxProvider({ url: s.mlx_url, model: s.ai_model });
  }
  return makeOllamaProvider({ url: s.ollama_url, model: s.ai_model });
}

async function getProvider(): Promise<LlmProvider> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.provider;
  const settings = await readSettings();
  const provider = buildProvider(settings);
  cached = { provider, settings, expiresAt: now + CACHE_TTL_MS };
  return provider;
}

export function invalidateLlmCache(): void {
  cached = null;
}

export async function getCurrentSettings(): Promise<AiSettingsRow> {
  if (cached && cached.expiresAt > Date.now()) return cached.settings;
  const s = await readSettings();
  cached = { provider: buildProvider(s), settings: s, expiresAt: Date.now() + CACHE_TTL_MS };
  return s;
}

export async function llmChat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<string> {
  const p = await getProvider();
  return p.chat(messages, opts);
}

export async function* llmChatStream(messages: LlmMessage[], opts?: LlmChatOptions): AsyncGenerator<string, void, unknown> {
  const p = await getProvider();
  for await (const chunk of p.chatStream(messages, opts)) yield chunk;
}

export async function llmWarmup(): Promise<void> {
  const p = await getProvider();
  await p.warmup();
}

export async function llmHealth(): Promise<{
  provider: AiProviderName;
  model: string;
  ready: boolean;
  installed: string[];
  error?: string;
}> {
  const settings = await getCurrentSettings();
  const provider = await getProvider();
  const h = await provider.healthCheck();
  return {
    provider: settings.ai_provider,
    model: settings.ai_model,
    ready: h.ready,
    installed: h.installed,
    error: h.error,
  };
}
