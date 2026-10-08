// The expandable detail panel for one attraction: status, reservation, and manual waits.

import { useState } from 'react';
import { BY_ID, type ResType } from '../data/park';
import type { DpaState, LiveStatus } from '../lib/live';
import { RES_TYPES, waitFor, type ItemState, type Status } from '../lib/state';
import { fmtIso, fmtTime, parseHHMM, toHHMM } from '../lib/time';
import { useApp } from './AppContext';
import { StatusPicker, UniqChip, UniqDots } from './ui';

const parseMinutes = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export function ItemSheet({ id }: { id: string }) {
  const { state, patchItem, update, toast } = useApp();
  const a = BY_ID[id];
  const item = state.items[id];
  const info = waitFor(state, id);
  const isRide = a.kind === 'ride' || a.kind === 'walkthrough';
  const [waitText, setWaitText] = useState(info.source === 'manual' && info.wait != null ? String(info.wait) : '');
  const [status, setStatus] = useState<LiveStatus>(info.status === 'UNKNOWN' ? 'OPERATING' : info.status);
  const [dpa, setDpa] = useState<DpaState>(info.dpa);

  const setItemStatus = (next: Status) => {
    const patch: Partial<ItemState> = { status: next };
    if (next === 'reserved' && !item.resType) patch.resType = a.defaultResType ?? 'DPA';
    if (next === 'in_line' && info.wait != null && item.postedWait == null) patch.postedWait = info.wait;
    patchItem(id, patch);
  };

  const saveManual = () => {
    const wait = parseMinutes(waitText);
    update((s) => ({ ...s, manual: { ...s.manual, [id]: { wait, status, dpa, at: new Date().toISOString() } } }));
    toast(`Saved manual update for ${a.short}`);
  };

  const hasReservation = item.status === 'reserved' || item.resStart != null;

  return (
    <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <UniqChip uniq={a.uniq} long />
        <UniqDots n={a.uniqScore} />
      </div>
      {(a.note || a.anaheimNote) && (
        <p className="text-sm text-muted">
          {a.note} {a.anaheimNote && <span className="text-ink">{a.anaheimNote}</span>}
        </p>
      )}

      <div>
        <div className="eyebrow mb-1.5 text-muted">My status</div>
        <StatusPicker value={item.status} onChange={setItemStatus} idBase={`st-${id}`} />
      </div>

      {hasReservation && (
        <fieldset className="rounded-xl bg-sunk p-3">
          <legend className="sr-only">Reservation</legend>
          <div className="eyebrow mb-2 text-muted">Reservation</div>
          {a.showtimes && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {a.showtimes.map((showtime) => (
                <button
                  key={showtime}
                  type="button"
                  aria-pressed={item.resStart === showtime}
                  onClick={() =>
                    patchItem(id, {
                      resStart: showtime,
                      resEnd: showtime + a.duration,
                      status: item.status === 'completed' ? 'completed' : 'reserved',
                      resType: item.resType ?? a.defaultResType ?? 'Entry Request',
                    })
                  }
                  className={`min-h-[40px] rounded-lg border px-3 text-sm font-semibold tnum ${
                    item.resStart === showtime ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-card'
                  }`}
                >
                  {fmtTime(showtime)}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-muted" htmlFor={`rs-${id}`}>
              {a.id === 'frenzy' ? 'Admission time' : a.showtimes ? 'Show time' : 'Window start'}
              <input
                id={`rs-${id}`}
                type="time"
                className="field mt-1"
                value={toHHMM(item.resStart)}
                onChange={(e) =>
                  patchItem(id, {
                    resStart: parseHHMM(e.target.value),
                    status: item.status === 'completed' ? 'completed' : 'reserved',
                  })
                }
              />
            </label>
            <label className="text-xs font-semibold text-muted" htmlFor={`re-${id}`}>
              {isRide ? 'Window end' : 'End (optional)'}
              <input
                id={`re-${id}`}
                type="time"
                className="field mt-1"
                value={toHHMM(item.resEnd)}
                onChange={(e) => patchItem(id, { resEnd: parseHHMM(e.target.value) })}
              />
            </label>
          </div>
          <label className="mt-2 block text-xs font-semibold text-muted" htmlFor={`rt-${id}`}>
            Type
            <select
              id={`rt-${id}`}
              className="field mt-1"
              value={item.resType ?? ''}
              onChange={(e) => patchItem(id, { resType: (e.target.value || null) as ResType | null })}
            >
              <option value="">Choose…</option>
              {RES_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {item.resStart != null && (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-skip underline"
              onClick={() =>
                patchItem(id, {
                  resStart: null,
                  resEnd: null,
                  status: item.status === 'reserved' ? 'planned' : item.status,
                })
              }
            >
              Clear reservation
            </button>
          )}
        </fieldset>
      )}

      {!hasReservation && (a.defaultResType || a.showtimes) && (
        <button type="button" className="btn btn-ghost w-full" onClick={() => setItemStatus('reserved')}>
          Add {a.defaultResType ?? 'reservation'} time
        </button>
      )}

      {id === 'bnb' && item.status === 'reserved' && (
        <label className="flex min-h-[44px] items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--accent)]"
            checked={!!item.standbyOk}
            onChange={(e) => patchItem(id, { standbyOk: e.target.checked })}
          />
          I also want to ride standby (otherwise the app won’t suggest standby)
        </label>
      )}

      {isRide && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-muted" htmlFor={`pw-${id}`}>
              Posted wait when I joined
              <input
                id={`pw-${id}`}
                inputMode="numeric"
                className="field mt-1 tnum"
                placeholder="min"
                value={item.postedWait ?? ''}
                onChange={(e) => patchItem(id, { postedWait: parseMinutes(e.target.value) })}
              />
            </label>
            <label className="text-xs font-semibold text-muted" htmlFor={`aw-${id}`}>
              Actual wait
              <input
                id={`aw-${id}`}
                inputMode="numeric"
                className="field mt-1 tnum"
                placeholder="min"
                value={item.actualWait ?? ''}
                onChange={(e) => patchItem(id, { actualWait: parseMinutes(e.target.value) })}
              />
            </label>
          </div>
          <div className="rounded-xl bg-sunk p-3">
            <div className="eyebrow mb-1 text-muted">Current conditions (manual)</div>
            <p className="mb-2 text-xs text-muted">
              {info.source === 'none'
                ? 'No data yet.'
                : `Now showing ${
                    info.source === 'manual' ? 'your manual entry' : info.source === 'demo' ? 'DEMO DATA' : 'live data'
                  } from ${fmtIso(info.at)}.`}
              {info.dpaPrice && ` DPA ${info.dpaPrice}.`}
              {info.dpaReturnStart && ` Next DPA return ${fmtIso(info.dpaReturnStart)}.`}
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label className="text-xs font-semibold text-muted" htmlFor={`mw-${id}`}>
                Current wait (min)
                <input
                  id={`mw-${id}`}
                  inputMode="numeric"
                  className="field mt-1 tnum"
                  value={waitText}
                  onChange={(e) => setWaitText(e.target.value)}
                  placeholder="e.g. 25"
                />
              </label>
              <div className="text-xs font-semibold text-muted">
                Ride is
                <div className="seg mt-1">
                  <button type="button" aria-pressed={status === 'OPERATING'} onClick={() => setStatus('OPERATING')}>
                    Open
                  </button>
                  <button type="button" aria-pressed={status === 'DOWN'} onClick={() => setStatus('DOWN')}>
                    Down
                  </button>
                  <button type="button" aria-pressed={status === 'CLOSED'} onClick={() => setStatus('CLOSED')}>
                    Closed
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold text-muted">
              Premier Access
              <div className="seg mt-1">
                <button type="button" aria-pressed={dpa === 'available'} onClick={() => setDpa('available')}>
                  Available
                </button>
                <button type="button" aria-pressed={dpa === 'sold_out'} onClick={() => setDpa('sold_out')}>
                  Sold out
                </button>
                <button type="button" aria-pressed={dpa === 'unknown'} onClick={() => setDpa('unknown')}>
                  Unknown
                </button>
              </div>
            </div>
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={saveManual}>
              Save manual update
            </button>
          </div>
        </>
      )}
    </div>
  );
}
