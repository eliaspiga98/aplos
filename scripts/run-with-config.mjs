import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windowsState = process.platform === 'win32'
  ? join(process.env.ProgramData || 'C:\\ProgramData', 'Aplos')
  : null;
const pointer = process.env.APLOS_CONFIG_POINTER || (
  windowsState
    ? join(windowsState, 'config-location.txt')
    : join(root, 'var', 'runtime', 'config-location.txt')
);

function findConfigFile() {
  if (process.env.APLOS_CONFIG_FILE && existsSync(process.env.APLOS_CONFIG_FILE)) {
    return resolve(process.env.APLOS_CONFIG_FILE);
  }
  if (existsSync(pointer)) {
    const pointed = readFileSync(pointer, 'utf8').trim();
    if (pointed && existsSync(pointed)) return resolve(pointed);
  }
  return windowsState
    ? join(windowsState, 'config', '.env')
    : join(root, '.env');
}

const mode = process.argv[2];
const configFile = findConfigFile();
if (!existsSync(configFile)) {
  console.error(`Configurazione Aplo's non trovata: ${configFile}`);
  process.exit(1);
}

const targets = {
  server: ['api/dist/server.js'],
  migrate: ['--import', 'tsx', 'api/src/db/migrate.ts'],
  seed: ['--import', 'tsx', 'api/src/db/seed.ts'],
  'migrate:demo': ['--import', 'tsx', 'api/src/db/migrate.ts', '--target=demo'],
  'seed:demo': ['--import', 'tsx', 'api/src/db/seed-demo.ts'],
};
const target = targets[mode];
if (!target) {
  console.error(`Comando Aplo's non supportato: ${mode || '(mancante)'}`);
  process.exit(1);
}

const child = spawn(process.execPath, [`--env-file=${configFile}`, ...target], {
  cwd: root,
  env: {
    ...process.env,
    APLOS_CONFIG_FILE: configFile,
    APLOS_CONFIG_POINTER: pointer,
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
