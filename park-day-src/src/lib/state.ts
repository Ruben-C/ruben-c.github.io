// The day's state: what you have done, reserved and eaten, plus the latest
// wait data. It lives in localStorage under a key for the visit date.

import { useCallback, useEffect, useState } from 'react';
import { ATTRACTIONS, ENTRY_ACTIONS, KEY_IDS, LANDS, PARK, type Land, type ResType } from '../data/park';
import type { DpaState, LiveSnapshot, LiveStatus, SourceKind } from './live';
import { fmtIso, minutesSince } from './time';

export type Status = 'not_done' | 'planned' | 'reserved' | 'in_line' | 'completed' | 'skipped';
export const STATUSES: Status[] = ['not_done', 'planned', 'reserved', 'in_line', 'completed', 'skipped'];
export const STATUS_LABELS: Record<Status, string> = {
  not_done: 'Not Done',
  planned: 'Planned',
  reserved: 'Reserved',
  in_line: 'In Line',
  completed: 'Completed',
  skipped: 'Skipped',
};
export const RES_TYPES: ResType[] = ['DPA', 'Entry Request', 'Priority Pass', 'Dining', 'Other'];

export type Energy = 'aggressive' | 'balanced' | 'relaxed';
export type MealKind = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Break';
export const MEAL_KINDS: MealKind[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Break'];

export interface ItemState {
  status: Status;
  /** Reservation or return-window start, minutes after midnight. */
  resStart: number | null;
  resEnd: number | null;
  resType: ResType | null;
  postedWait: number | null;
  actualWait: number | null;
  /** Beauty and the Beast only: also suggest standby although a DPA is held. */
  standbyOk?: boolean;
  updatedAt?: string;
}

export interface FoodEntry {
  id: string;
  kind: MealKind;
  place: string;
  time: number | null;
  isReservation: boolean;
  duration: number;
  done: boolean;
  note: string;
}

export interface ManualEntry {
  wait: number | null;
  status: LiveStatus;
  dpa: DpaState;
  at: string;
}

export interface RefreshRecord {
  at: string;
  ok: boolean;
  message: string;
}

export interface AppState {
  v: 1;
  visitDate: string;
  items: Record<string, ItemState>;
  entryActions: Record<string, boolean>;
  /** Checked-off seasonal extras, keyed by checklist key. */
  extras: Record<string, boolean>;
  land: Land;
  currently: string;
  energy: Energy;
  halloween: boolean;
  notes: string;
  food: FoodEntry[];
  live: LiveSnapshot | null;
  /** Waits entered by hand, keyed by attraction id. */
  manual: Record<string, ManualEntry>;
  /** Simulated clock, minutes after midnight. */
  timeOverride: number | null;
  lastRefresh: RefreshRecord | null;
}

export const STORAGE_KEY = `tdl-park-day-${PARK.date}:v1`;

const PLANNED = new Set(KEY_IDS);

function defaultItem(id: string): ItemState {
  return {
    status: PLANNED.has(id) ? 'planned' : 'not_done',
    resStart: null,
    resEnd: null,
    resType: null,
    postedWait: null,
    actualWait: null,
  };
}

export function defaultState(): AppState {
  return {
    v: 1,
    visitDate: PARK.date,
    items: Object.fromEntries(ATTRACTIONS.map((a) => [a.id, defaultItem(a.id)])),
    entryActions: Object.fromEntries(ENTRY_ACTIONS.map((a) => [a.id, false])),
    extras: {},
    land: 'World Bazaar',
    currently: '',
    energy: 'balanced',
    halloween: true,
    notes: '',
    food: [],
    live: null,
    manual: {},
    timeOverride: null,
    lastRefresh: null,
  };
}

/** Accepts a stored or exported state and fills in anything missing. */
export function coerceState(input: unknown): AppState {
  if (!input || typeof input !== 'object') throw new Error('That isn’t an app state object.');
  const raw = input as Record<string, unknown>;
  const n = { ...((raw.state && typeof raw.state === 'object' ? raw.state : raw) as Record<string, unknown>) };
  delete n.app;
  delete n.exportedAt;
  if (n.v !== 1 || typeof n.items !== 'object' || !n.items) {
    throw new Error('Missing "v": 1 and "items". Paste the text from “Copy Full JSON State”.');
  }
  const base = defaultState();
  const items = { ...base.items };
  for (const [id, item] of Object.entries(n.items as Record<string, unknown>)) {
    if (items[id] && item && typeof item === 'object') items[id] = { ...items[id], ...(item as Partial<ItemState>) };
  }
  const land = n.land as Land;
  const live = n.live as LiveSnapshot | null | undefined;
  return {
    ...base,
    ...(n as Partial<AppState>),
    v: 1,
    items,
    entryActions: { ...base.entryActions, ...((n.entryActions as Record<string, boolean> | undefined) ?? {}) },
    extras: n.extras && typeof n.extras === 'object' ? (n.extras as Record<string, boolean>) : {},
    land: LANDS.includes(land) ? land : base.land,
    food: Array.isArray(n.food) ? (n.food as FoodEntry[]) : [],
    manual: n.manual && typeof n.manual === 'object' ? (n.manual as Record<string, ManualEntry>) : {},
    live: live && typeof live === 'object' && live.entries ? live : null,
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return coerceState(JSON.parse(raw));
  } catch {
    // Unreadable or missing: start fresh.
  }
  return defaultState();
}

export type Updater = (fn: (s: AppState) => AppState) => void;
export type PatchItem = (id: string, patch: Partial<ItemState>) => void;

export function usePersistentState() {
  const [state, setState] = useState<AppState>(loadState);
  const [persistOk, setPersistOk] = useState(true);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setPersistOk(true);
    } catch {
      setPersistOk(false);
    }
  }, [state]);
  const update: Updater = useCallback((fn) => setState((s) => fn(s)), []);
  const patchItem: PatchItem = useCallback(
    (id, patch) =>
      setState((s) => ({
        ...s,
        items: { ...s.items, [id]: { ...s.items[id], ...patch, updatedAt: new Date().toISOString() } },
      })),
    [],
  );
  return { state, setState, update, patchItem, persistOk };
}

export interface WaitInfo {
  wait: number | null;
  status: LiveStatus;
  dpa: DpaState;
  dpaPrice?: string | null;
  dpaReturnStart?: string | null;
  source: SourceKind | 'manual' | 'none';
  at: string | null;
}

/** The current wait for an attraction: a manual entry wins when it is newer than the feed. */
export function waitFor(state: AppState, id: string): WaitInfo {
  const live = state.live?.entries[id];
  const manual = state.manual[id];
  const fetchedAt = state.live?.fetchedAt ?? null;
  if (manual && (!live || !fetchedAt || new Date(manual.at) >= new Date(fetchedAt))) {
    return { wait: manual.wait, status: manual.status, dpa: manual.dpa, source: 'manual', at: manual.at };
  }
  if (live && state.live) {
    return {
      wait: live.wait,
      status: live.status,
      dpa: live.dpa,
      dpaPrice: live.dpaPrice,
      dpaReturnStart: live.dpaReturnStart,
      source: state.live.sourceKind,
      at: state.live.dataAsOf ?? state.live.fetchedAt,
    };
  }
  return { wait: null, status: 'UNKNOWN', dpa: 'unknown', source: 'none', at: null };
}

export type DataLabel = 'Live' | 'Recently Updated' | 'Manual' | 'Stale' | 'DEMO DATA' | 'No data';

export interface DataStatus {
  label: DataLabel;
  at: string | null;
  detail: string;
}

/** How fresh the wait data is, for the status chip. */
export function dataStatus(state: AppState): DataStatus {
  const live = state.live;
  const liveAt = live ? (live.dataAsOf ?? live.fetchedAt) : null;
  const manualTimes = Object.values(state.manual)
    .map((m) => m.at)
    .sort();
  const manualAt = manualTimes[manualTimes.length - 1] ?? null;
  const noData: DataStatus = {
    label: 'No data',
    at: null,
    detail: 'No waits yet. Refresh, paste live JSON, or enter waits by hand.',
  };
  if (!live && !manualAt) return noData;
  if (manualAt && (!live || !liveAt || new Date(manualAt) > new Date(live.fetchedAt))) {
    return {
      label: (minutesSince(manualAt) ?? 0) > 30 ? 'Stale' : 'Manual',
      at: manualAt,
      detail: 'Latest values were entered by hand.',
    };
  }
  if (!live) return noData;
  if (live.demo) {
    return { label: 'DEMO DATA', at: live.fetchedAt, detail: 'Simulated values for trying the app. Not real waits.' };
  }
  const age = minutesSince(live.fetchedAt) ?? 999;
  const changed = live.dataAsOf ? ` Feed last changed ${fmtIso(live.dataAsOf)}.` : '';
  if (age <= 10) return { label: 'Live', at: live.fetchedAt, detail: `From ${live.source}.${changed}` };
  if (age <= 30) return { label: 'Recently Updated', at: live.fetchedAt, detail: `From ${live.source}.${changed}` };
  return {
    label: 'Stale',
    at: live.fetchedAt,
    detail: `Last data is ${age} min old. Refresh before deciding.${changed}`,
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
