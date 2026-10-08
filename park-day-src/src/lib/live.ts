// Live wait times. The source is ThemeParks.wiki, an unofficial aggregator:
// Tokyo Disney Resort publishes no public API. The app also accepts the same
// JSON pasted by hand, a simple {"Ride name": minutes} list, and simulated data.

import { ATTRACTIONS, BY_TP_ID, matchAttraction, PARK } from '../data/park';

export type LiveStatus = 'OPERATING' | 'DOWN' | 'CLOSED' | 'REFURBISHMENT' | 'UNKNOWN';
export type DpaState = 'available' | 'sold_out' | 'unknown';
export type SourceKind = 'live' | 'pasted' | 'json' | 'demo';

export interface LiveEntry {
  wait: number | null;
  status: LiveStatus;
  /** Disney Premier Access (paid return time). */
  dpa: DpaState;
  dpaPrice?: string | null;
  dpaReturnStart?: string | null;
  dpaReturnEnd?: string | null;
  lastUpdated?: string | null;
}

export interface LiveSnapshot {
  source: string;
  sourceKind: SourceKind;
  demo: boolean;
  /** When this app received the data. */
  fetchedAt: string;
  /** Newest lastUpdated in the feed, when it says. */
  dataAsOf: string | null;
  /** Keyed by attraction id. */
  entries: Record<string, LiveEntry>;
  /** Feed names the app does not track. */
  unmatched: string[];
}

/** The parts of a ThemeParks.wiki /entity/{id}/live response the app reads. */
interface ThemeParksLive {
  name?: string;
  liveData: ThemeParksEntity[];
}

interface ThemeParksEntity {
  id?: string;
  name?: string;
  status?: string;
  lastUpdated?: string;
  queue?: {
    STANDBY?: { waitTime?: number | null };
    PAID_RETURN_TIME?: {
      state?: string;
      price?: { formatted?: string } | null;
      returnStart?: string | null;
      returnEnd?: string | null;
    };
  };
}

function isThemeParksLive(x: unknown): x is ThemeParksLive {
  return !!x && typeof x === 'object' && Array.isArray((x as ThemeParksLive).liveData);
}

function normalizeStatus(s: string | undefined): LiveStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPERATING':
      return 'OPERATING';
    case 'DOWN':
      return 'DOWN';
    case 'CLOSED':
      return 'CLOSED';
    case 'REFURBISHMENT':
      return 'REFURBISHMENT';
    default:
      return 'UNKNOWN';
  }
}

function normalizeDpa(s: string | undefined): DpaState {
  const u = (s ?? '').toUpperCase();
  return u === 'AVAILABLE'
    ? 'available'
    : u === 'FINISHED' || u === 'TEMP_FULL' || u === 'SOLD_OUT'
      ? 'sold_out'
      : 'unknown';
}

function fromThemeParks(data: ThemeParksLive, source: string, sourceKind: SourceKind): LiveSnapshot {
  const entries: Record<string, LiveEntry> = {};
  const unmatched: string[] = [];
  let newest = 0;
  for (const item of data.liveData ?? []) {
    const attraction = (item.id && BY_TP_ID[item.id]) || (item.name ? matchAttraction(item.name) : undefined);
    if (!attraction) {
      if (item.name) unmatched.push(item.name);
      continue;
    }
    const paid = item.queue?.PAID_RETURN_TIME;
    const standby = item.queue?.STANDBY?.waitTime;
    entries[attraction.id] = {
      wait: typeof standby === 'number' ? standby : null,
      status: normalizeStatus(item.status),
      dpa: paid ? normalizeDpa(paid.state) : 'unknown',
      dpaPrice: paid?.price?.formatted ?? null,
      dpaReturnStart: paid?.returnStart ?? null,
      dpaReturnEnd: paid?.returnEnd ?? null,
      lastUpdated: item.lastUpdated ?? null,
    };
    const ts = item.lastUpdated ? new Date(item.lastUpdated).getTime() : 0;
    if (ts > newest) newest = ts;
  }
  const demo = /demo/i.test(data.name ?? '');
  return {
    source: demo ? 'DEMO DATA (sample file)' : source,
    sourceKind: demo ? 'demo' : sourceKind,
    demo,
    fetchedAt: new Date().toISOString(),
    dataAsOf: newest ? new Date(newest).toISOString() : null,
    entries,
    unmatched,
  };
}

async function fetchSource(url: string, signal: AbortSignal, label: string): Promise<LiveSnapshot> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${label} answered HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`${label} did not return JSON`);
  const body: unknown = await res.json();
  if (!isThemeParksLive(body)) throw new Error(`${label} returned an unexpected format`);
  return fromThemeParks(body, label, 'live');
}

// Build-time settings (see README): an optional same-origin proxy, and whether
// to call ThemeParks.wiki directly from the browser (its CORS policy allows it).
const THEMEPARKS_BASE: string = import.meta.env.VITE_THEMEPARKS_BASE || 'https://api.themeparks.wiki/v1';
const PROXY_URL: string = import.meta.env.VITE_LIVE_ENDPOINT || '';
const DIRECT: boolean = (import.meta.env.VITE_DIRECT_THEMEPARKS ?? 'true') !== 'false';

export const LIVE_FEED_URL = `${THEMEPARKS_BASE}/entity/${PARK.themeparksParkId}/live`;

interface Source {
  label: string;
  run: (signal: AbortSignal) => Promise<LiveSnapshot>;
}

function sources(): Source[] {
  const list: Source[] = [];
  if (PROXY_URL) {
    list.push({
      label: 'Your backend proxy',
      run: (signal) => fetchSource(PROXY_URL, signal, 'ThemeParks.wiki via proxy'),
    });
  }
  if (DIRECT) {
    list.push({ label: 'ThemeParks.wiki', run: (signal) => fetchSource(LIVE_FEED_URL, signal, 'ThemeParks.wiki') });
  }
  return list;
}

export type RefreshResult = { ok: true; snapshot: LiveSnapshot; message: string } | { ok: false; message: string };

/** Tries each source in turn; the first one with Tokyo Disneyland data wins. */
export async function refreshLive(timeoutMs = 9000): Promise<RefreshResult> {
  const failures: string[] = [];
  for (const source of sources()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const snapshot = await source.run(controller.signal);
      clearTimeout(timer);
      const count = Object.keys(snapshot.entries).length;
      if (count === 0) throw new Error('no Tokyo Disneyland attractions in the response');
      return { ok: true, snapshot, message: `Updated ${count} attractions from ${snapshot.source}.` };
    } catch (err) {
      clearTimeout(timer);
      const why = err instanceof Error ? (err.name === 'AbortError' ? 'timed out' : err.message) : String(err);
      failures.push(`${source.label}: ${why}`);
    }
  }
  return {
    ok: false,
    message:
      'Couldn’t reach a live source from this page (' +
      failures.join('; ') +
      '). Paste the live JSON on the Status tab, or enter waits by hand.',
  };
}

/** Pasted text: a ThemeParks.wiki response, or a simple list of names and waits. */
export function parsePastedLive(text: string): LiveSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That isn’t valid JSON. Copy the whole response, including the first { or [.');
  }
  if (isThemeParksLive(parsed)) {
    const snapshot = fromThemeParks(parsed, 'ThemeParks.wiki (pasted)', 'pasted');
    if (!Object.keys(snapshot.entries).length) throw new Error('No Tokyo Disneyland attractions found in that JSON.');
    return snapshot;
  }
  const rows: { name: string; value: unknown }[] = [];
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>;
        rows.push({ name: String(r.name ?? r.attraction ?? r.id ?? ''), value: r });
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    if ('items' in parsed && 'v' in parsed) {
      throw new Error('This looks like a full app state. Use “Import previous state” instead.');
    }
    for (const [name, value] of Object.entries(parsed)) rows.push({ name, value });
  } else {
    throw new Error('Expected an array or object of attractions.');
  }
  const entries: Record<string, LiveEntry> = {};
  const unmatched: string[] = [];
  for (const { name, value } of rows) {
    const attraction = matchAttraction(name);
    if (!attraction) {
      unmatched.push(name);
      continue;
    }
    entries[attraction.id] = simpleEntry(value);
  }
  if (!Object.keys(entries).length) {
    throw new Error('None of those names matched an attraction. Use names like “Pooh’s Hunny Hunt”.');
  }
  const now = new Date().toISOString();
  return { source: 'Pasted JSON', sourceKind: 'json', demo: false, fetchedAt: now, dataAsOf: now, entries, unmatched };
}

function simpleEntry(value: unknown): LiveEntry {
  if (typeof value === 'number') return { wait: value, status: 'OPERATING', dpa: 'unknown' };
  const o = (value ?? {}) as Record<string, unknown>;
  const raw = o.wait ?? o.waitTime ?? o.standby ?? o.minutes;
  const n = raw == null || raw === '' ? null : Number(raw);
  return {
    wait: n == null || Number.isNaN(n) ? null : n,
    status: statusFromText(o.status ?? o.open),
    dpa: dpaFromText(o.dpa ?? o.premierAccess),
  };
}

function statusFromText(value: unknown): LiveStatus {
  if (value === true) return 'OPERATING';
  if (value === false) return 'CLOSED';
  const s = String(value ?? '').toLowerCase();
  return !s || /(open|operating|running)/.test(s)
    ? 'OPERATING'
    : /(down|temporar|paused|suspend)/.test(s)
      ? 'DOWN'
      : /(refurb|rehab)/.test(s)
        ? 'REFURBISHMENT'
        : /(closed|close)/.test(s)
          ? 'CLOSED'
          : 'UNKNOWN';
}

function dpaFromText(value: unknown): DpaState {
  if (value === true) return 'available';
  if (value === false) return 'sold_out';
  const s = String(value ?? '').toLowerCase();
  return /avail|yes|open/.test(s) ? 'available' : /sold|no|full|finish/.test(s) ? 'sold_out' : 'unknown';
}

const DEMO_DPA_RIDES = ['bnb', 'hm', 'pooh', 'monsters', 'baymax', 'splash', 'bigthunder'];

/** Plausible simulated waits for trying the app without the real park. */
export function demoSnapshot(nowMinutes: number): LiveSnapshot {
  const entries: Record<string, LiveEntry> = {};
  const hour = nowMinutes / 60;
  const crowd = Math.max(0.35, Math.min(1.15, 0.45 + 0.7 * Math.sin(((hour - 8.5) / 11) * Math.PI)));
  let i = 0;
  for (const a of ATTRACTIONS) {
    if (!a.tpId) continue;
    i++;
    const typical = a.typicalWait ?? 15;
    const jitter = ((i * 37 + Math.floor(nowMinutes / 15) * 11) % 21) - 10;
    let wait = Math.max(5, Math.round((typical * crowd + jitter) / 5) * 5);
    if (a.id === 'pooh' && nowMinutes < 9 * 60 + 30) wait = 15;
    if (a.id === 'hm' && nowMinutes >= 13 * 60 && nowMinutes < 14 * 60) wait = 25;
    if (a.id === 'startours') wait = 5;
    const status: LiveStatus = a.id === 'rafts' && hour > 17 ? 'CLOSED' : 'OPERATING';
    entries[a.id] = {
      wait: status === 'OPERATING' ? wait : null,
      status,
      dpa: DEMO_DPA_RIDES.includes(a.id) ? (a.id === 'bnb' && hour > 14 ? 'sold_out' : 'available') : 'unknown',
      lastUpdated: new Date().toISOString(),
    };
  }
  const now = new Date().toISOString();
  return {
    source: 'DEMO DATA (simulated)',
    sourceKind: 'demo',
    demo: true,
    fetchedAt: now,
    dataAsOf: now,
    entries,
    unmatched: [],
  };
}
