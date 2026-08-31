import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logAudit } from '../audit.js';
import { config } from '../config.js';
import { pool } from './pool.js';
import { isBackupDue, type BackupSchedule } from './backup-schedule.js';

interface BackupSettingsRow {
  backup_directory: string;
  backup_schedule: BackupSchedule;
  backup_retention_count: number;
  backup_last_at: string | null;
  backup_last_file: string | null;
  backup_last_size_bytes: string | number | null;
  backup_last_error: string | null;
}

export interface BackupStatus {
  backup_directory: string;
  backup_directory_resolved: string;
  backup_schedule: BackupSchedule;
  backup_retention_count: number;
  backup_last_at: string | null;
  backup_last_file: string | null;
  backup_last_size_bytes: number | null;
  backup_last_error: string | null;
  backup_running: boolean;
}

export interface DatabaseLocation {
  engine: 'PostgreSQL';
  database_name: string;
  server_host: string;
  server_port: number;
  server_address: string | null;
  data_directory: string;
}

export interface BackupResult {
  file: string;
  size_bytes: number;
  created_at: string;
  trigger: 'manual' | 'automatic';
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../');
const BACKUP_PREFIX = 'aplos-';
const BACKUP_SUFFIX = '.dump';
const CHECK_EVERY_MS = 15 * 60 * 1000;
const PG_DUMP_TIMEOUT_MS = 30 * 60 * 1000;

let backupRunning = false;
let schedulerStarted = false;

export function resolveBackupDirectory(directory: string): string {
  const requested = directory.trim();
  // Le installazioni precedenti hanno già "var/backups" nel DB. Su Windows
  // il launcher imposta un default persistente fuori dal repository: lo
  // applichiamo senza richiedere una modifica manuale delle settings.
  const trimmed = requested === 'var/backups' && config.defaultBackupDir !== 'var/backups'
    ? config.defaultBackupDir
    : requested;
  if (!trimmed) throw new Error('Il percorso di backup non può essere vuoto');
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(repoRoot, trimmed);
}

export async function ensureBackupDirectory(directory: string): Promise<string> {
  const resolved = resolveBackupDirectory(directory);
  await mkdir(resolved, { recursive: true });
  await access(resolved, fsConstants.R_OK | fsConstants.W_OK);
  return resolved;
}

async function readSettingsRow(): Promise<BackupSettingsRow> {
  const result = await pool.query<BackupSettingsRow>(
    `SELECT backup_directory, backup_schedule, backup_retention_count,
            backup_last_at, backup_last_file, backup_last_size_bytes,
            backup_last_error
       FROM app_settings
      WHERE id = 1`,
  );
  if (!result.rows[0]) throw new Error('Configurazione applicativa non trovata');
  return result.rows[0];
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const row = await readSettingsRow();
  const effectiveDirectory = row.backup_directory === 'var/backups' && config.defaultBackupDir !== 'var/backups'
    ? config.defaultBackupDir
    : row.backup_directory;
  return {
    ...row,
    backup_directory: effectiveDirectory,
    backup_directory_resolved: resolveBackupDirectory(effectiveDirectory),
    backup_retention_count: Number(row.backup_retention_count),
    backup_last_size_bytes: row.backup_last_size_bytes == null
      ? null
      : Number(row.backup_last_size_bytes),
    backup_running: backupRunning,
  };
}

export async function getDatabaseLocation(): Promise<DatabaseLocation> {
  const result = await pool.query<{
    database_name: string;
    server_address: string | null;
    server_port: number;
    data_directory: string;
  }>(
    `SELECT current_database() AS database_name,
            inet_server_addr()::text AS server_address,
            inet_server_port() AS server_port,
            current_setting('data_directory') AS data_directory`,
  );
  const row = result.rows[0]!;
  const connection = new URL(config.databaseUrl);
  return {
    engine: 'PostgreSQL',
    database_name: row.database_name,
    server_host: connection.hostname,
    server_port: Number(row.server_port ?? (connection.port || 5432)),
    server_address: row.server_address,
    data_directory: row.data_directory,
  };
}

function pgEnvironment(): NodeJS.ProcessEnv {
  const connection = new URL(config.databaseUrl);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port || '5432',
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: decodeURIComponent(connection.pathname.replace(/^\//, '')),
  };
  const sslMode = connection.searchParams.get('sslmode');
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

async function invokePgDump(outputFile: string): Promise<void> {
  const args = [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    `--file=${outputFile}`,
  ];

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(config.pgDumpPath, args, {
      env: pgEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectPromise(error);
      else resolvePromise();
    };

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_000) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      finish(new Error(`Impossibile avviare pg_dump (${config.pgDumpPath}): ${error.message}`));
    });
    child.once('close', (code) => {
      if (code === 0) finish();
      else finish(new Error(`pg_dump terminato con codice ${code}: ${stderr.trim() || 'nessun dettaglio'}`));
    });

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Backup interrotto: pg_dump ha superato 30 minuti'));
    }, PG_DUMP_TIMEOUT_MS);
  });
}

async function enforceRetention(directory: string, retentionCount: number): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const backups = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(BACKUP_PREFIX) && entry.name.endsWith(BACKUP_SUFFIX))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(backups.slice(retentionCount).map((name) => unlink(resolve(directory, name))));
}

export async function runDatabaseBackup(
  trigger: 'manual' | 'automatic',
  operatorId: number | null = null,
): Promise<BackupResult> {
  if (backupRunning) throw new Error('Un backup è già in corso');
  backupRunning = true;

  let partialFile: string | null = null;
  try {
    const settings = await readSettingsRow();
    const directory = await ensureBackupDirectory(settings.backup_directory);
    const createdAt = new Date();
    const stamp = createdAt.toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .replace(/\.\d{3}Z$/, 'Z');
    const finalFile = resolve(directory, `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`);
    partialFile = `${finalFile}.partial`;

    await invokePgDump(partialFile);
    await rename(partialFile, finalFile);
    partialFile = null;
    const fileStat = await stat(finalFile);

    await pool.query(
      `UPDATE app_settings
          SET backup_last_at = $1,
              backup_last_file = $2,
              backup_last_size_bytes = $3,
              backup_last_error = NULL
        WHERE id = 1`,
      [createdAt.toISOString(), finalFile, fileStat.size],
    );

    await enforceRetention(directory, Number(settings.backup_retention_count)).catch((error: unknown) => {
      console.warn('Pulizia dei vecchi backup fallita:', error);
    });

    await logAudit(pool, {
      idOperatore: operatorId,
      azione: trigger === 'manual' ? 'DATABASE_BACKUP_MANUAL' : 'DATABASE_BACKUP_AUTOMATIC',
      entita: 'database',
      dettagli: { file: finalFile, size_bytes: fileStat.size },
    }).catch((error: unknown) => console.warn('Audit backup fallito:', error));

    return {
      file: finalFile,
      size_bytes: fileStat.size,
      created_at: createdAt.toISOString(),
      trigger,
    };
  } catch (error) {
    if (partialFile) await unlink(partialFile).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE app_settings SET backup_last_error = $1 WHERE id = 1`,
      [message.slice(0, 2000)],
    ).catch(() => undefined);
    throw error;
  } finally {
    backupRunning = false;
  }
}

async function checkAutomaticBackup(): Promise<void> {
  if (backupRunning) return;
  try {
    const settings = await readSettingsRow();
    if (isBackupDue(settings.backup_schedule, settings.backup_last_at)) {
      await runDatabaseBackup('automatic');
    }
  } catch (error) {
    console.error('Controllo backup automatico fallito:', error);
  }
}

export function startBackupScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const initial = setTimeout(() => void checkAutomaticBackup(), 30_000);
  initial.unref();
  const interval = setInterval(() => void checkAutomaticBackup(), CHECK_EVERY_MS);
  interval.unref();
}
