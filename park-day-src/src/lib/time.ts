// Times inside the app are minutes after midnight in Tokyo, whatever the phone's zone.

const TOKYO_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Minutes after midnight in Tokyo for the given instant. */
export function tokyoMinutes(date = new Date()): number {
  const parts = TOKYO_CLOCK.formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return (h % 24) * 60 + m;
}

/** 630 → "10:30 AM". */
export function fmtTime(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** "10:30–11:00 AM", repeating AM/PM only when it changes. */
export function fmtRange(start: number | null | undefined, end: number | null | undefined): string {
  if (start == null) return '—';
  if (end == null) return fmtTime(start);
  const a = fmtTime(start);
  const b = fmtTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** An ISO timestamp as a Tokyo clock time. */
export function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : fmtTime(tokyoMinutes(d));
}

/** Minutes → "HH:MM" for <input type="time">. */
export function toHHMM(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "HH:MM" from <input type="time"> → minutes, or null when cleared. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? null : Math.max(0, Math.round((now - then) / 60_000));
}

export function agoLabel(iso: string | null | undefined): string {
  const m = minutesSince(iso);
  if (m == null) return '';
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
