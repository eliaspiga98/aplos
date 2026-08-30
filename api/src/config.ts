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

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  databaseUrl: required('DATABASE_URL'),
  demoDatabaseUrl: process.env.DEMO_DATABASE_URL ?? '',
  readonlyDatabaseUrl: process.env.READONLY_DATABASE_URL ?? '',
  host: optional('API_HOST', '0.0.0.0'),
  port: Number(optional('API_PORT', '3001')),
  jwtSecret: required('JWT_SECRET'),
  sessionTtlSeconds: Number(optional('SESSION_TTL_SECONDS', '28800')),
  // In produzione Internet resta true per default. Il launcher Windows lo
  // disabilita esplicitamente per la LAN HTTP, altrimenti il browser non
  // invierebbe il cookie quando apre l'app tramite un indirizzo 192.168.x.x.
  cookieSecure: optional('COOKIE_SECURE', isProduction ? 'true' : 'false') === 'true',
  webOrigin: optional('WEB_ORIGIN', 'http://localhost:5173'),
  uploadsDir: optional('UPLOADS_DIR', 'var/uploads'),
  uploadMaxBytes: Number(optional('UPLOAD_MAX_BYTES', String(50 * 1024 * 1024))),
  // Provider AI e modello sono gestiti a runtime nella tabella `app_settings`
  // (modificabile dal pannello /impostazioni admin), non dall'environment.
  isProduction,
};
