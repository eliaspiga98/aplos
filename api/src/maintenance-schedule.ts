export type RecurrenceUnit = 'giorni' | 'mesi' | 'anni';

function addClampedMonths(date: Date, months: number) {
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
}

function addClampedYears(date: Date, years: number) {
  const originalMonth = date.getUTCMonth();
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(originalMonth);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), originalMonth + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
}

function advance(date: Date, value: number, unit: RecurrenceUnit) {
  if (unit === 'giorni') date.setUTCDate(date.getUTCDate() + value);
  if (unit === 'mesi') addClampedMonths(date, value);
  if (unit === 'anni') addClampedYears(date, value);
}

/** Prima ricorrenza successiva a oggi, mantenendo la cadenza originaria. */
export function nextMaintenanceDate(
  scheduledDate: string,
  value: number,
  unit: RecurrenceUnit,
  today: Date | string = new Date(),
): string {
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day!));
  const todayParts = typeof today === 'string'
    ? today.split('-').map(Number)
    : [today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()];
  const todayUtc = Date.UTC(todayParts[0]!, todayParts[1]! - 1, todayParts[2]!);

  // Il completamento consuma sempre l'occorrenza programmata, anche quando
  // viene registrato prima della scadenza.
  advance(next, value, unit);
  let guard = 1;
  while (next.getTime() <= todayUtc && guard < 10_000) {
    advance(next, value, unit);
    guard += 1;
  }
  return next.toISOString().slice(0, 10);
}
