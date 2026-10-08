// App shell: header with the clock and your land, the active tab, bottom navigation,
// toasts, the clipboard fallback, and the live-data refresh loop.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppContext, type AppContextValue, type TabId } from './components/AppContext';
import { FoodTab } from './components/FoodTab';
import { NowTab } from './components/NowTab';
import { RidesTab } from './components/RidesTab';
import { ShowsTab } from './components/ShowsTab';
import { StatusTab } from './components/StatusTab';
import { TimelineTab } from './components/TimelineTab';
import {
  BarsIcon,
  CastleIcon,
  ChevronIcon,
  ClockIcon,
  CoasterIcon,
  FoodIcon,
  PinIcon,
  RefreshIcon,
  ShowIcon,
  TimelineIcon,
} from './components/icons';
import { DataChip, UrgencyChip } from './components/ui';
import { BY_ID, INDOOR_SHOWS, LANDS, SHOWS, type Land } from './data/park';
import { refreshLive } from './lib/live';
import { recommend } from './lib/planner';
import { usePersistentState } from './lib/state';
import { fmtTime, minutesSince, tokyoMinutes } from './lib/time';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'now', label: 'NOW', icon: <ClockIcon size={22} /> },
  { id: 'timeline', label: 'TIMELINE', icon: <TimelineIcon size={22} /> },
  { id: 'rides', label: 'RIDES', icon: <CoasterIcon size={22} /> },
  { id: 'shows', label: 'SHOWS', icon: <ShowIcon size={22} /> },
  { id: 'food', label: 'FOOD', icon: <FoodIcon size={22} /> },
  { id: 'status', label: 'STATUS', icon: <BarsIcon size={22} /> },
];

const SHOW_TAB_IDS = new Set([...SHOWS, ...INDOOR_SHOWS].map((a) => a.id));

/** Live data older than this is fetched again when the app is opened or comes back to the foreground. */
const AUTO_REFRESH_AFTER_MINUTES = 2;
const AUTO_REFRESH_INTERVAL_MS = 5 * 60_000;

function initialTab(): TabId {
  const hash = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  return TABS.find((t) => t.id === hash)?.id ?? 'now';
}

export function App() {
  const { state, update, patchItem, persistOk } = usePersistentState();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<{ text: string; label: string } | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const toastTimer = useRef<number>();
  const refreshInFlight = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30_000);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const now = state.timeOverride ?? tokyoMinutes(new Date(tick));
  const rec = useMemo(() => recommend(state, now), [state, now]);

  const toast = useCallback((message: string) => {
    setToastText(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  const switchTab = useCallback((id: TabId) => {
    setTab(id);
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      // Some embedded browsers refuse; the tab still switches.
    }
    window.scrollTo({ top: 0 });
  }, []);

  const copy = useCallback(
    (text: string, label: string) => {
      const done = () => toast(`${label} copied`);
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(done, () => setCopyFallback({ text, label }));
          return;
        }
      } catch {
        // Fall through to the manual copy dialog.
      }
      setCopyFallback({ text, label });
    },
    [toast],
  );

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      setRefreshing(true);
      try {
        const result = await refreshLive();
        const at = new Date().toISOString();
        update((s) => ({
          ...s,
          live: result.ok ? result.snapshot : s.live,
          lastRefresh: { at, ok: result.ok, message: result.message },
        }));
        if (!silent) toast(result.ok ? 'Live data updated' : 'Live source unreachable. See Status for options.');
      } finally {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    },
    [update, toast],
  );

  // Keep waits fresh without a tap: on open, when the app returns to the
  // foreground, and every five minutes while it is visible. Demo and pasted
  // data are left alone so they are not replaced behind your back.
  const liveRef = useRef(state.live);
  liveRef.current = state.live;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const autoRefresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      const live = liveRef.current;
      if (live && live.sourceKind !== 'live') return;
      if (live && (minutesSince(live.fetchedAt) ?? Infinity) < AUTO_REFRESH_AFTER_MINUTES) return;
      void refreshRef.current({ silent: true });
    };
    autoRefresh();
    document.addEventListener('visibilitychange', autoRefresh);
    const timer = window.setInterval(autoRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', autoRefresh);
      clearInterval(timer);
    };
  }, []);

  const openItem = useCallback((id: string) => {
    if (!BY_ID[id]) return;
    setOpenId(id);
    setTab(SHOW_TAB_IDS.has(id) ? 'shows' : 'rides');
  }, []);

  const ctx: AppContextValue = {
    state,
    update,
    patchItem,
    now,
    rec,
    toast,
    setTab: switchTab,
    copy,
    refreshing,
    doRefresh: () => void refresh(),
    openItem,
  };

  return (
    <AppContext.Provider value={ctx}>
      <header className="band sticky z-30" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-[560px] items-center gap-3 px-4 pb-2.5 pt-3">
          <CastleIcon size={30} className="band-gold shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow band-muted">Tokyo Disneyland · Thu Oct 8</div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="whitespace-nowrap font-display text-[26px] font-bold leading-none tnum">
                {fmtTime(now)}
              </span>
              {state.timeOverride != null && (
                <span className="chip bg-[var(--band-gold)] text-[var(--band)]">Simulated</span>
              )}
              {!online && <span className="chip bg-skip text-card">Offline</span>}
            </div>
          </div>
          <label
            className="relative flex min-h-[44px] max-w-[46%] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 pl-3 pr-2 text-sm font-semibold"
            htmlFor="land-select"
          >
            <PinIcon size={16} className="band-gold shrink-0" />
            <span className="sr-only">I’m currently here:</span>
            <select
              id="land-select"
              className="w-full min-w-0 appearance-none truncate bg-transparent pr-4 text-[15px] font-semibold text-[var(--band-ink)] outline-none"
              value={state.land}
              onChange={(e) => {
                const land = e.target.value as Land;
                update((s) => ({ ...s, land }));
                toast(`You’re in ${land}`);
              }}
            >
              {LANDS.map((land) => (
                <option key={land} value={land} className="text-black">
                  {land}
                </option>
              ))}
            </select>
            <ChevronIcon size={14} className="pointer-events-none absolute right-2 rotate-90 opacity-70" />
          </label>
        </div>
        <div className="mx-auto flex max-w-[560px] items-center gap-2 px-4 pb-2.5 text-xs">
          <span className="band-muted tnum">Park hours 9:00 AM–9:00 PM</span>
          <span className="flex-1" />
          <DataChip state={state} withTime />
          <button
            type="button"
            aria-label="Refresh Live Park Data"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[var(--band-ink)]"
          >
            <RefreshIcon size={17} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
        {tab !== 'now' && (
          <button
            type="button"
            onClick={() => switchTab('now')}
            className="block w-full border-b border-line bg-card text-left text-ink"
          >
            <span className="mx-auto flex max-w-[560px] items-center gap-2.5 px-4 py-2.5">
              <UrgencyChip u={rec.best.urgency} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">Next: {rec.best.title}</span>
                <span className="block truncate text-xs text-muted">
                  {rec.best.timeLabel}
                  {rec.best.walk != null ? ` · ≈ ${rec.best.walk} min walk` : ''}
                </span>
              </span>
              <ChevronIcon size={16} className="shrink-0 text-muted" />
            </span>
          </button>
        )}
      </header>

      <main className="mx-auto max-w-[560px] px-4 pb-28">
        {tab === 'now' && <NowTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'rides' && <RidesTab openId={openId} setOpenId={setOpenId} />}
        {tab === 'shows' && <ShowsTab openId={openId} setOpenId={setOpenId} />}
        {tab === 'food' && <FoodTab />}
        {tab === 'status' && <StatusTab persistOk={persistOk} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Sections"
      >
        <div className="mx-auto grid max-w-[560px] grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold tracking-wide ${
                tab === t.id ? 'text-accent' : 'text-muted'
              }`}
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-full ${tab === t.id ? 'bg-accent-soft' : ''}`}
              >
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
      >
        {toastText && (
          <div className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-lg">{toastText}</div>
        )}
      </div>

      {copyFallback && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Copy ${copyFallback.label}`}
        >
          <div className="panel w-full max-w-[540px] p-4">
            <h2 className="font-display text-xl font-bold">Copy {copyFallback.label}</h2>
            <p className="text-sm text-muted">
              This view blocked automatic copying. The text is selected: use your phone’s Copy.
            </p>
            <textarea
              readOnly
              className="field mt-2 h-64 py-2 font-mono text-xs"
              value={copyFallback.text}
              ref={(el) => {
                if (el) {
                  el.focus();
                  el.select();
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => setCopyFallback(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
