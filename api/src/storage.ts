import { constants as fsConstants } from 'node:fs';
import { access, copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { pool } from './db/pool.js';

interface StorageSettingsRow {
  config_directory: string;
  uploads_directory: string;
}

export interface StorageStatus {
  config_directory: string;
  config_directory_resolved: string;
  config_file: string;
  uploads_directory: string;
  uploads_directory_resolved: string;
  restart_required_for_config: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../');

function resolveFromRepo(value: string): string {
  const trimmed = value.trim();
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(repoRoot, trimmed);
}

function currentConfigFile(): string {
  return resolveFromRepo(config.configFile);
}

function defaultConfigDirectory(): string {
  return dirname(currentConfigFile());
}

function defaultUploadsDirectory(): string {
  return resolveFromRepo(config.uploadsDir);
}

async function ensureWritableDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  await access(directory, fsConstants.R_OK | fsConstants.W_OK);
  return directory;
}

async function readSettings(): Promise<StorageSettingsRow> {
  const result = await pool.query<StorageSettingsRow>(
    `SELECT config_directory, uploads_directory FROM app_settings WHERE id = 1`,
  );
  if (!result.rows[0]) throw new Error('Configurazione applicativa non trovata');
  return result.rows[0];
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const row = await readSettings();
  const configDirectory = row.config_directory.trim()
    ? resolveFromRepo(row.config_directory)
    : defaultConfigDirectory();
  const uploadsDirectory = row.uploads_directory.trim()
    ? resolveFromRepo(row.uploads_directory)
    : defaultUploadsDirectory();
  return {
    config_directory: row.config_directory || defaultConfigDirectory(),
    config_directory_resolved: configDirectory,
    config_file: join(configDirectory, '.env'),
    uploads_directory: row.uploads_directory || defaultUploadsDirectory(),
    uploads_directory_resolved: uploadsDirectory,
    restart_required_for_config: resolve(currentConfigFile()) !== resolve(join(configDirectory, '.env')),
  };
}

export async function getUploadsRoot(): Promise<string> {
  const status = await getStorageStatus();
  return ensureWritableDirectory(status.uploads_directory_resolved);
}

async function copyExistingUploads(source: string, destination: string): Promise<void> {
  if (resolve(source) === resolve(destination)) return;
  try {
    await access(source, fsConstants.R_OK);
  } catch {
    return;
  }
  await mkdir(destination, { recursive: true });
  // force:false evita di sovrascrivere un allegato già migrato. I nomi fisici
  // sono UUID, quindi una collisione indica normalmente lo stesso file.
  await cp(source, destination, { recursive: true, force: false, errorOnExist: false });
}

async function writeUploadsPathToConfig(configFile: string, uploadsDirectory: string): Promise<void> {
  const normalized = uploadsDirectory.replace(/\\/g, '/');
  const text = await readFile(configFile, 'utf8');
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith('UPLOADS_DIR='));
  if (index >= 0) lines[index] = `UPLOADS_DIR=${normalized}`;
  else lines.push(`UPLOADS_DIR=${normalized}`);
  await writeFile(configFile, lines.join('\n'), 'utf8');
}

export async function updateStorageSettings(
  configDirectoryInput: string,
  uploadsDirectoryInput: string,
): Promise<StorageStatus> {
  const before = await getStorageStatus();
  const configDirectory = resolveFromRepo(configDirectoryInput);
  const uploadsDirectory = resolveFromRepo(uploadsDirectoryInput);
  await ensureWritableDirectory(configDirectory);
  await ensureWritableDirectory(uploadsDirectory);

  await copyExistingUploads(before.uploads_directory_resolved, uploadsDirectory);

  const sourceConfig = currentConfigFile();
  const targetConfig = join(configDirectory, '.env');
  if (resolve(sourceConfig) !== resolve(targetConfig)) {
    await copyFile(sourceConfig, targetConfig);
  }
  await writeUploadsPathToConfig(targetConfig, uploadsDirectory);

  // Il launcher Windows legge questo puntatore prima di avviare Node. Viene
  // scritto solo dopo che il nuovo .env è stato copiato con successo.
  if (config.configPointer) {
    const pointer = resolveFromRepo(config.configPointer);
    await mkdir(dirname(pointer), { recursive: true });
    await writeFile(pointer, targetConfig, 'utf8');
  }

  await pool.query(
    `UPDATE app_settings
        SET config_directory = $1,
            uploads_directory = $2,
            updated_at = now()
      WHERE id = 1`,
    [configDirectoryInput.trim(), uploadsDirectoryInput.trim()],
  );
  return getStorageStatus();
}
