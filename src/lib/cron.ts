/**
 * Compute the next run Date from a cron expression.
 *
 * Supported patterns (subset):
 *   '* /5 * * * *'  → every 5 minutes  (next 5-min mark)
 *   '0 * * * *'     → every hour       (top of next hour)
 *   '0 H * * *'     → daily at H:00 UTC
 *   anything else   → fallback: now + 1 hour
 *
 * @param schedule  Cron expression string
 * @param _timezone Timezone string (reserved for future use; computation is in UTC)
 */
export function computeNextRun(schedule: string, _timezone = "UTC"): Date {
  const now = new Date();
  const parts = schedule.trim().split(/\s+/);

  // Every-N-minutes pattern: */N * * * *
  if (parts.length === 5 && /^\*\/(\d+)$/.test(parts[0]) && parts[1] === "*") {
    const match = parts[0].match(/^\*\/(\d+)$/);
    const interval = match ? parseInt(match[1], 10) : 5;
    const ms = interval * 60 * 1000;
    const next = new Date(Math.ceil(now.getTime() / ms) * ms);
    return next;
  }

  // Every hour: 0 * * * *
  if (
    parts.length === 5 &&
    parts[0] === "0" &&
    parts[1] === "*" &&
    parts[2] === "*" &&
    parts[3] === "*" &&
    parts[4] === "*"
  ) {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  // Daily at specific hour: 0 H * * *
  if (
    parts.length === 5 &&
    parts[0] === "0" &&
    /^\d+$/.test(parts[1]) &&
    parts[2] === "*" &&
    parts[3] === "*" &&
    parts[4] === "*"
  ) {
    const hour = parseInt(parts[1], 10);
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    // If we've already passed that hour today, schedule for tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Fallback: 1 hour from now
  return new Date(now.getTime() + 60 * 60 * 1000);
}
