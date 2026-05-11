/**
 * Interfaccia comune dei provider LLM. Tutti i provider espongono lo stesso
 * shape, così che il dispatcher in `llm.ts` possa instradare senza saperne
 * la natura.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  /** Override temperature (default 0.1). */
  temperature?: number;
  /** Limita i token generati. Utile per classifier (1 parola). */
  numPredict?: number;
}

export interface LlmProvider {
  /** Nome del provider, per log. */
  name: string;
  /** Modello in uso, per log e UI. */
  model: string;
  /** Chiamata non-streaming. Solleva se l'endpoint non risponde. */
  chat(messages: LlmMessage[], opts?: LlmChatOptions): Promise<string>;
  /** Streaming async — yielda chunk di testo. */
  chatStream(messages: LlmMessage[], opts?: LlmChatOptions): AsyncGenerator<string, void, unknown>;
  /** Chiamata a vuoto per scaldare il modello in memoria. */
  warmup(): Promise<void>;
  /** Diagnostica: il modello è disponibile? Quali altri ci sono? */
  healthCheck(): Promise<{ ready: boolean; installed: string[]; error?: string }>;
}
