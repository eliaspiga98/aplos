/**
 * Provider Ollama: parla con l'API nativa di Ollama (/api/chat).
 *
 * keep_alive: -1 (intero) tiene il modello caricato in memoria a tempo
 * indefinito, eliminando i cold start tra una query e l'altra (default Ollama:
 * 5 min). NB: dev'essere un numero — Ollama parsa la stringa come Go duration
 * e rifiuta "-1" perché manca l'unità di tempo.
 *
 * Qwen 3.5 abilita il reasoning per default. Aplo's richiede output molto
 * vincolati (classificazione di una parola e SQL senza spiegazioni), quindi
 * inviamo `think: false` in ogni richiesta. Il reasoning resta separato dal
 * contenuto nell'API Ollama, ma consumerebbe il piccolo budget del classifier
 * prima che il modello possa emettere DATI/INFO.
 */

import type { LlmMessage, LlmChatOptions, LlmProvider } from './types.js';

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

interface OllamaConfig {
  url: string;
  model: string;
}

function buildOptions(opts: LlmChatOptions) {
  return {
    temperature: opts.temperature ?? 0.1,
    ...(opts.numPredict !== undefined ? { num_predict: opts.numPredict } : {}),
  };
}

export function makeOllamaProvider(cfg: OllamaConfig): LlmProvider {
  return {
    name: 'ollama',
    model: cfg.model,

    async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<string> {
      const res = await fetch(`${cfg.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: false,
          think: false,
          keep_alive: -1,
          options: buildOptions(opts),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as OllamaChatResponse;
      return data.message?.content ?? '';
    },

    async *chatStream(messages: LlmMessage[], opts: LlmChatOptions = {}): AsyncGenerator<string, void, unknown> {
      const res = await fetch(`${cfg.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: true,
          think: false,
          keep_alive: -1,
          options: buildOptions(opts),
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status}: ${text}`);
      }

      // Ollama in stream mode emette NDJSON: una riga JSON per chunk.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.length > 0) {
            try {
              const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
              const chunk = obj.message?.content;
              if (chunk) yield chunk;
            } catch {
              // Riga incompleta o malformata: ignoro.
            }
          }
          nl = buf.indexOf('\n');
        }
      }
    },

    async warmup(): Promise<void> {
      await fetch(`${cfg.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'user', content: 'ok' }],
          stream: false,
          think: false,
          keep_alive: -1,
          options: { num_predict: 1 },
        }),
      });
    },

    async healthCheck(): Promise<{ ready: boolean; installed: string[]; error?: string }> {
      try {
        const res = await fetch(`${cfg.url}/api/tags`);
        if (!res.ok) return { ready: false, installed: [], error: `HTTP ${res.status}` };
        const data = (await res.json()) as { models?: { name: string }[] };
        const installed = (data.models ?? []).map((m) => m.name);
        return { ready: installed.includes(cfg.model), installed };
      } catch (err) {
        return { ready: false, installed: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
