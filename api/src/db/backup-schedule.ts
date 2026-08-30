export type BackupSchedule = 'disabled' | 'daily' | 'weekly';

export function isBackupDue(
  schedule: BackupSchedule,
  lastAt: string | null,
  now = new Date(),
): boolean {
  if (schedule === 'disabled') return false;
  if (!lastAt) return true;
  const last = new Date(lastAt).getTime();
  if (!Number.isFinite(last)) return true;
  const interval = schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return now.getTime() - last >= interval;
}
