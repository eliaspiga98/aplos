function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  demoDatabaseUrl: process.env.DEMO_DATABASE_URL ?? '',
  readonlyDatabaseUrl: process.env.READONLY_DATABASE_URL ?? '',
  host: optional('API_HOST', '0.0.0.0'),
  port: Number(optional('API_PORT', '3001')),
  jwtSecret: required('JWT_SECRET'),
  sessionTtlSeconds: Number(optional('SESSION_TTL_SECONDS', '28800')),
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:5173'),
  uploadsDir: optional('UPLOADS_DIR', 'var/uploads'),
  uploadMaxBytes: Number(optional('UPLOAD_MAX_BYTES', String(50 * 1024 * 1024))),
  ollamaUrl: optional('OLLAMA_URL', 'http://localhost:11434'),
  ollamaModel: optional('OLLAMA_MODEL', 'llama3.1:8b'),
  isProduction: process.env.NODE_ENV === 'production',
};
