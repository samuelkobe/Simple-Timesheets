// ─── Rounding ────────────────────────────────────────────────────────────────

/**
 * Round minutes UP to the nearest 15-minute increment.
 * Examples: 1→15, 10→15, 16→30, 26→30, 44→45, 57→60
 */
export function roundToQuarterHour(minutes) {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 15) * 15;
}

// ─── Time formatting ──────────────────────────────────────────────────────────

/** Format total minutes as "Xh Ym" — e.g. 90 → "1h 30m" */
export function formatMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format total seconds as a live timer string "H:MM:SS" */
export function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parse a "H:MM" or "MM" string into total minutes. Returns null if invalid. */
export function parseTimeInput(value) {
  const clean = (value || '').trim();
  if (!clean) return null;

  // HH:MM format
  const colonMatch = clean.match(/^(\d{1,3}):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (m >= 60) return null;
    return h * 60 + m;
  }

  // plain number → treat as minutes
  const numMatch = clean.match(/^(\d+)$/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  return null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Return "YYYY-MM-DD" for today (local time). */
export function todayISO() {
  const d = new Date();
  return localISODate(d);
}

/** Return "YYYY-MM-DD" for any Date (local time). */
export function localISODate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Display a date string nicely — e.g. "Apr 14" or "Apr 14, 2025" */
export function displayDate(isoDate, showYear = false) {
  if (!isoDate) return '';
  const [y, mo, d] = isoDate.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  const opts = { month: 'short', day: 'numeric' };
  if (showYear) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

/** Get the Monday–Sunday ISO dates for the week containing `isoDate`. */
export function weekRange(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  const day = date.getDay(); // 0=Sun
  const diffToMon = (day === 0) ? -6 : 1 - day;
  const mon = new Date(date);
  mon.setDate(date.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: localISODate(mon), end: localISODate(sun) };
}

/** Get the first and last ISO dates for the month containing `isoDate`. */
export function monthRange(isoDate) {
  const [y, mo] = isoDate.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  return { start: localISODate(first), end: localISODate(last) };
}

/** Get the first and last ISO dates for the year containing `isoDate`. */
export function yearRange(isoDate) {
  const y = parseInt(isoDate.split('-')[0], 10);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/** Format a dollar amount — e.g. 1575 → "$1,575.00" */
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── IDs ─────────────────────────────────────────────────────────────────────

/** Generate a simple unique ID (not UUID, but sufficient for local data). */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
