// SHOWS: the parades, fireworks and Entry Request shows, plus seated indoor breaks.

import { useEffect, useRef } from 'react';
import { INDOOR_SHOWS, SHOWS, type Attraction } from '../data/park';
import { commitments } from '../lib/planner';
import { fmtTime } from '../lib/time';
import { useApp } from './AppContext';
import { ChevronIcon, ShowIcon, SparkIcon } from './icons';
import { ItemSheet } from './ItemSheet';
import { RideRow } from './RideRow';
import { StatusText, UniqChip } from './ui';

function badgeClass(a: Attraction): string {
  return a.halloween
    ? 'bg-hallow text-card'
    : a.badge === 'HIGH PRIORITY'
      ? 'bg-accent text-accent-ink'
      : a.badge === 'RECOMMENDED'
        ? 'bg-sunk text-muted'
        : 'bg-gold-soft text-gold';
}

function ShowCard({ c, open, onToggle }: { c: Attraction; open: boolean; onToggle: () => void }) {
  const { state, patchItem, now, toast } = useApp();
  const item = state.items[c.id];
  const commit = commitments(state).find((x) => x.itemId === c.id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);
  const reserved = item.resStart != null && (item.status === 'reserved' || item.status === 'completed');
  return (
    <article ref={ref} className="panel scroll-mt-40 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {c.badge && <span className={`chip ${badgeClass(c)}`}>{c.badge}</span>}
          <UniqChip uniq={c.uniq} />
          <StatusText s={item.status} />
        </div>
        <h3 className="mt-2 flex items-start gap-2 font-display text-xl font-bold leading-snug">
          {c.kind === 'fireworks' ? (
            <SparkIcon size={22} className="mt-0.5 shrink-0 text-hallow" />
          ) : (
            <ShowIcon size={22} className="mt-0.5 shrink-0 text-accent" />
          )}
          {c.name}
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          {c.venue ?? c.land}
          {c.venue && c.venue !== 'Park-wide' ? ` · ${c.land}` : ''} · about {c.duration} min
        </p>
        {c.fixedTime != null && <p className="mt-2 font-display text-2xl font-bold tnum">{fmtTime(c.fixedTime)}</p>}
        {c.showtimes && (
          <div className="mt-3">
            <div className="eyebrow mb-1.5 text-muted">
              {reserved ? 'Your showtime' : 'Potential showtimes · tap the one you got'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.showtimes.map((showtime) => {
                const picked = item.resStart === showtime;
                const past = showtime + c.duration < now;
                return (
                  <button
                    key={showtime}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => {
                      if (picked) {
                        patchItem(c.id, { resStart: null, resEnd: null, status: 'planned' });
                        toast('Showtime cleared');
                      } else {
                        patchItem(c.id, {
                          resStart: showtime,
                          resEnd: showtime + c.duration,
                          status: 'reserved',
                          resType: item.resType ?? c.defaultResType ?? 'Entry Request',
                        });
                        toast(`${c.short}: ${fmtTime(showtime)} saved. Timeline updated.`);
                      }
                    }}
                    className={`relative min-h-[44px] rounded-xl border px-3 text-sm font-bold tnum ${
                      picked
                        ? 'border-accent bg-accent text-accent-ink'
                        : past
                          ? 'border-line bg-sunk text-muted line-through'
                          : 'border-line bg-card'
                    }`}
                  >
                    {fmtTime(showtime)}
                    {c.targetTime === showtime && !picked && (
                      <span className="absolute -right-1 -top-2 rounded-full bg-gold px-1.5 text-[9px] font-bold text-card">
                        TARGET
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {reserved && item.resType && (
              <p className="mt-2 text-sm font-semibold text-accent">
                {item.resType} · {fmtTime(item.resStart)} · arrive about {c.arriveEarly ?? 15} min early
              </p>
            )}
          </div>
        )}
        {commit && (c.kind === 'parade' || c.kind === 'fireworks') && (
          <p className="mt-2 rounded-xl bg-sunk px-3 py-2 text-sm">{commit.detail}</p>
        )}
        <p className="mt-2 text-sm text-muted">{c.note}</p>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[48px] w-full items-center justify-between border-t border-line px-4 text-sm font-semibold text-accent"
      >
        {open
          ? 'Close details'
          : c.id === 'frenzy'
            ? 'Status and DPA admission time'
            : 'Status and reservation details'}
        <ChevronIcon size={18} className={`transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <ItemSheet id={c.id} />}
    </article>
  );
}

export function ShowsTab({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  return (
    <div className="pb-6">
      <div className="mt-4 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">Shows & parades</h2>
        <p className="text-sm text-muted">Pick the showtime you were given. The timeline re-flows around it.</p>
      </div>
      <div className="mt-3 space-y-3">
        {SHOWS.map((c) => (
          <ShowCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
        ))}
      </div>
      <h3 className="mb-2 mt-6 px-1 font-display text-lg font-bold">Indoor shows for a break</h3>
      <ul className="panel divide-y divide-line overflow-hidden">
        {INDOOR_SHOWS.map((c) => (
          <RideRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
        ))}
      </ul>
    </div>
  );
}
