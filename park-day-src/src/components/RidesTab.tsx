// RIDES: every attraction grouped by land, nearest land first.

import { useState } from 'react';
import { LANDS, RIDE_LIST, walkMinutes, type Attraction } from '../data/park';
import { useApp } from './AppContext';
import { PinIcon } from './icons';
import { RideRow } from './RideRow';
import { DataChip } from './ui';

type Filter = 'all' | 'unique' | 'todo' | 'halloween' | 'overlap';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['unique', 'Tokyo Unique & Variation'],
  ['todo', 'Not done'],
  ['halloween', 'Halloween'],
  ['overlap', 'Lower priority'],
];

export function RidesTab({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const { state } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const lands = [state.land, ...LANDS.filter((l) => l !== state.land)];
  const matches = (a: Attraction) => {
    const status = state.items[a.id].status;
    return filter === 'unique'
      ? a.uniq !== 'overlap'
      : filter === 'halloween'
        ? !!a.halloween
        : filter === 'todo'
          ? status !== 'completed' && status !== 'skipped'
          : filter === 'overlap'
            ? a.uniq === 'overlap'
            : true;
  };
  return (
    <div className="pb-6">
      <div className="mt-4 flex items-end justify-between gap-2 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">Rides by land</h2>
        <DataChip state={state} withTime />
      </div>
      <p className="px-1 text-sm text-muted">Tap a ride to set its status, reservation, and waits.</p>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter rides">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-semibold ${
              filter === id ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {lands.map((land) => {
        const rides = RIDE_LIST.filter((a) => a.land === land && matches(a)).sort((a, b) => b.priority - a.priority);
        if (!rides.length) return null;
        return (
          <section key={land} className="mt-5">
            <h3 className="mb-2 flex items-center gap-2 px-1">
              <span className="font-display text-lg font-bold">{land}</span>
              {land === state.land ? (
                <span className="chip bg-accent text-accent-ink">
                  <PinIcon size={12} />
                  You’re here
                </span>
              ) : (
                <span className="text-xs text-muted">≈ {walkMinutes(state.land, land)} min walk</span>
              )}
            </h3>
            <ul className="panel divide-y divide-line overflow-hidden">
              {rides.map((a) => (
                <RideRow
                  key={a.id}
                  c={a}
                  open={openId === a.id}
                  onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
