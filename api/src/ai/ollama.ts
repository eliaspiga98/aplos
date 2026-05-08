import { config } from '../config.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

interface OllamaChatOptions {
  /** Override temperature (default 0.1). */
  temperature?: number;
  /** Limita i token generati. Utile per il classifier (1 parola). */
  numPredict?: number;
}

/**
 * Chiama Ollama in modalità non-streaming. Solleva se l'endpoint non risponde.
 *
 * keep_alive: '-1' tiene il modello caricato in memoria a tempo indefinito,
 * eliminando i cold start tra una query e l'altra (default Ollama: 5 min).
 */
export async function ollamaChat(
  messages: OllamaMessage[],
  opts: OllamaChatOptions = {},
): Promise<string> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      stream: false,
      keep_alive: '-1',
      options: {
        temperature: opts.temperature ?? 0.1,
        ...(opts.numPredict !== undefined ? { num_predict: opts.numPredict } : {}),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as OllamaChatResponse;
  return data.message?.content ?? '';
}

/**
 * Stream-aware chat. Yielda i chunk di testo man mano che il modello li
 * genera. Usato per la formulazione della risposta finale all'utente,
 * dove vedere il testo apparire progressivamente migliora la latenza
 * percepita anche se il tempo totale è invariato.
 */
export async function* ollamaChatStream(
  messages: OllamaMessage[],
  opts: OllamaChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      stream: true,
      keep_alive: '-1',
      options: {
        temperature: opts.temperature ?? 0.1,
        ...(opts.numPredict !== undefined ? { num_predict: opts.numPredict } : {}),
      },
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
}

/**
 * Chiamata a vuoto per caricare il modello in memoria all'avvio del server.
 * Si comporta come "ollama run <model>" senza generare nulla di utile —
 * il keep_alive: '-1' lo mantiene caricato.
 */
export async function ollamaWarmup(): Promise<void> {
  await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages: [{ role: 'user', content: 'ok' }],
      stream: false,
      keep_alive: '-1',
      options: { num_predict: 1 },
    }),
  });
}
