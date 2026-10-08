import { useEffect, useRef } from 'react';
import type { Attraction } from '../data/park';
import { waitFor } from '../lib/state';
import { fmtTime } from '../lib/time';
import { useApp } from './AppContext';
import { ChevronIcon } from './icons';
import { ItemSheet } from './ItemSheet';
import { StatusText, UniqChip, WaitDisplay } from './ui';

/** One attraction in a list, expanding into its detail sheet. */
export function RideRow({ c, open, onToggle }: { c: Attraction; open: boolean; onToggle: () => void }) {
  const { state } = useApp();
  const item = state.items[c.id];
  const info = waitFor(state, c.id);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [open]);
  return (
    <li ref={ref} className={`scroll-mt-40 ${open ? 'bg-card' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block font-semibold leading-snug ${item.status === 'completed' || item.status === 'skipped' ? 'text-muted' : ''}`}
          >
            {c.name}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <UniqChip uniq={c.uniq} long={c.uniq === 'overlap'} />
            {c.halloween && <span className="chip bg-hallow-soft text-hallow">Halloween</span>}
            {info.dpa === 'available' && (
              <span className="chip bg-sunk text-ink">DPA{info.dpaPrice ? ` ${info.dpaPrice}` : ''}</span>
            )}
            {info.dpa === 'sold_out' && <span className="chip bg-sunk text-muted">DPA sold out</span>}
            <StatusText s={item.status} />
            {item.status === 'reserved' && item.resStart != null && (
              <span className="text-xs font-semibold text-accent tnum">{fmtTime(item.resStart)}</span>
            )}
          </span>
        </span>
        <WaitDisplay state={state} id={c.id} />
        <ChevronIcon size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <ItemSheet id={c.id} />}
    </li>
  );
}
