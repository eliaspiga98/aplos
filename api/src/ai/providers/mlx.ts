/**
 * Provider MLX: parla con `mlx_lm.server` via API OpenAI-compatible
 * (/v1/chat/completions). MLX gira nativamente su Apple Silicon usando
 * Metal — niente GPU virtualizzata, niente CUDA stub.
 *
 * Note differenze rispetto a Ollama:
 * - Streaming è SSE ("data: {json}\n\n"), non NDJSON.
 * - Il modello è specificato come Hugging Face id (es.
 *   "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit"). Se non corrisponde
 *   al modello caricato all'avvio, il server lo scarica e ricarica
 *   on-demand — la prima chiamata può quindi essere lenta.
 * - Niente concetto di keep_alive: il modello resta caricato per la vita
 *   del processo. È compito di launchd tenere il processo vivo.
 */

import type { LlmMessage, LlmChatOptions, LlmProvider } from './types.js';

interface MlxConfig {
  url: string;
  model: string;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { role: string; content: string } }>;
  error?: { message?: string };
}

interface OpenAIStreamChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
}

function buildBody(cfg: MlxConfig, messages: LlmMessage[], opts: LlmChatOptions, stream: boolean) {
  return {
    model: cfg.model,
    messages,
    stream,
    temperature: opts.temperature ?? 0.1,
    ...(opts.numPredict !== undefined ? { max_tokens: opts.numPredict } : {}),
  };
}

// mlx_lm.server NON filtra i token di stop del chat template (es. `<|im_end|>`
// per Qwen, `<|eot_id|>` per Llama 3): finiscono dentro `delta.content` e
// `message.content`. Li rimuoviamo qui in entrata, così il resto della
// pipeline vede solo testo "pulito" come quello di Ollama.
const SPECIAL_TOKEN_RE = /<\|[^|]+\|>/g;

function stripSpecialTokens(s: string): string {
  return s.replace(SPECIAL_TOKEN_RE, '');
}

export function makeMlxProvider(cfg: MlxConfig): LlmProvider {
  return {
    name: 'mlx',
    model: cfg.model,

    async chat(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<string> {
      const res = await fetch(`${cfg.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(cfg, messages, opts, false)),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MLX HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as OpenAIChatResponse;
      if (data.error) throw new Error(`MLX error: ${data.error.message ?? 'sconosciuto'}`);
      return stripSpecialTokens(data.choices?.[0]?.message?.content ?? '');
    },

    async *chatStream(messages: LlmMessage[], opts: LlmChatOptions = {}): AsyncGenerator<string, void, unknown> {
      const res = await fetch(`${cfg.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(cfg, messages, opts, true)),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`MLX HTTP ${res.status}: ${text}`);
      }

      // SSE: ogni evento è "data: <json>\n\n", terminato da "data: [DONE]".
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // Carryover per token speciali spezzati su più chunk: se un delta
      // termina con "<" o "<|im_" lo tratteniamo finché non possiamo decidere
      // se è un tag da strippare o testo normale.
      let pending = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep = buf.search(/\r?\n\r?\n/);
        while (sep !== -1) {
          const event = buf.slice(0, sep);
          buf = buf.slice(sep).replace(/^\r?\n\r?\n/, '');
          const dataLines = event
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim());
          for (const payload of dataLines) {
            if (payload === '[DONE]') {
              const tail = stripSpecialTokens(pending);
              if (tail) yield tail;
              return;
            }
            if (!payload) continue;
            try {
              const obj = JSON.parse(payload) as OpenAIStreamChunk;
              const delta = obj.choices?.[0]?.delta?.content;
              if (!delta) continue;
              pending += delta;
              // Strippa i tag completi presenti.
              pending = pending.replace(SPECIAL_TOKEN_RE, '');
              // Trattieni eventuale tag parziale alla coda (`<` o `<|...`
              // senza chiusura). Soglia 32 char: oltre, è normale testo.
              const ltIdx = pending.lastIndexOf('<');
              if (ltIdx >= 0 && pending.length - ltIdx <= 32 && !pending.slice(ltIdx).includes('|>')) {
                const safe = pending.slice(0, ltIdx);
                if (safe) yield safe;
                pending = pending.slice(ltIdx);
              } else {
                if (pending) yield pending;
                pending = '';
              }
            } catch {
              // Frame corrotto: ignoro.
            }
          }
          sep = buf.search(/\r?\n\r?\n/);
        }
      }
      const tail = stripSpecialTokens(pending);
      if (tail) yield tail;
    },

    async warmup(): Promise<void> {
      // Forza il caricamento del modello con una richiesta minima.
      // mlx_lm.server scarica il modello da Hugging Face al primo uso
      // se non già presente — quindi questa chiamata può essere lenta
      // la primissima volta.
      await fetch(`${cfg.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(cfg, [{ role: 'user', content: 'ok' }], { numPredict: 1 }, false)),
      });
    },

    async healthCheck(): Promise<{ ready: boolean; installed: string[]; error?: string }> {
      try {
        // mlx_lm.server espone /v1/models con i modelli noti localmente.
        const res = await fetch(`${cfg.url}/v1/models`);
        if (!res.ok) return { ready: false, installed: [], error: `HTTP ${res.status}` };
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        const installed = (data.data ?? []).map((m) => m.id);
        // Il server accetta anche modelli non in /v1/models (li scarica al volo),
        // quindi consideriamo "ready" se l'endpoint risponde, indipendentemente
        // dalla presenza del modello specifico.
        return { ready: true, installed };
      } catch (err) {
        return { ready: false, installed: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
