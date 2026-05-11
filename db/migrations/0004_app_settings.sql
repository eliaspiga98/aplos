-- Tabella singleton per impostazioni globali dell'applicazione modificabili
-- a runtime dagli admin (provider AI e parametri di connessione).
--
-- Vincolo singleton: id deve essere sempre 1. Una sola riga.
--
-- Provider AI:
--   ollama → chiama OLLAMA_URL (default http://localhost:11434/api/chat)
--   mlx    → chiama MLX_URL    (default http://127.0.0.1:8080/v1/chat/completions)
-- ai_model è la stringa modello passata al provider. Per Ollama
-- normalmente "qwen2.5-coder:7b"; per MLX un id Hugging Face come
-- "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit".

BEGIN;

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ai_provider TEXT NOT NULL DEFAULT 'ollama' CHECK (ai_provider IN ('ollama', 'mlx')),
  ai_model TEXT NOT NULL DEFAULT 'qwen2.5-coder:7b',
  ollama_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
  mlx_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:8080',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT REFERENCES operatori(id)
);

INSERT INTO app_settings (id) VALUES (1);

COMMIT;
