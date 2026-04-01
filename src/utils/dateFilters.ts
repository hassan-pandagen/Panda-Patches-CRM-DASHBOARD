/**
 * Converts a YYYY-MM-DD date string to an ISO timestamp at LOCAL midnight.
 * This ensures date filters match what the user sees in their timezone.
 *
 * Example (PKT UTC+5):
 *   localMidnightISO("2026-04-01") → "2026-03-31T19:00:00.000Z"
 *   This captures orders that show as "Apr 1" in the user's local time.
 */
export function localMidnightISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

/**
 * Returns the ISO timestamp for local midnight of the day AFTER the given date.
 * Used as the exclusive upper bound in date range queries.
 *
 * Example (PKT UTC+5):
 *   localNextDayISO("2026-04-30") → "2026-04-30T19:00:00.000Z"
 */
export function localNextDayISO(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
