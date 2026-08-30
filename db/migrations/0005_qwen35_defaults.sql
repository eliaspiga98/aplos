-- Aggiorna i default AI a Qwen 3.5 su entrambi i runtime locali:
--   Ollama (Windows/Linux/macOS): qwen3.5:9b-q4_K_M
--   MLX (Apple Silicon):          mlx-community/Qwen3.5-9B-MLX-4bit
--
-- Le installazioni che hanno scelto manualmente un altro modello non vengono
-- modificate: aggiorniamo soltanto i due vecchi default Qwen 2.5.

BEGIN;

ALTER TABLE app_settings
  ALTER COLUMN ai_model SET DEFAULT 'qwen3.5:9b-q4_K_M';

UPDATE app_settings
SET ai_model = CASE
      WHEN ai_provider = 'ollama'
        THEN 'qwen3.5:9b-q4_K_M'
      WHEN ai_provider = 'mlx'
        THEN 'mlx-community/Qwen3.5-9B-MLX-4bit'
      ELSE ai_model
    END,
    updated_at = NOW()
WHERE (ai_provider = 'ollama' AND ai_model = 'qwen2.5-coder:7b')
   OR (ai_provider = 'mlx' AND ai_model = 'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit');

COMMIT;
