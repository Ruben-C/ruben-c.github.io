import { BY_ID } from '../data/park';
import type { Slot, Suggestion } from '../lib/planner';
import { useApp } from './AppContext';
import { FoodIcon, WalkIcon } from './icons';
import { UniqChip, UniqDots, UrgencyChip } from './ui';

const SLOT_LABELS: Record<Slot, string> = {
  best: 'Best choice',
  lowwait: 'Low-wait choice',
  relaxed: 'Relaxed choice',
};

export function SuggestionCard({ s }: { s: Suggestion }) {
  const { state, patchItem, openItem, toast } = useApp();
  const id = s.itemId;
  const item = id ? state.items[id] : undefined;
  const isRide = id ? ['ride', 'walkthrough'].includes(BY_ID[id].kind) : false;
  const best = s.slot === 'best';
  return (
    <article
      className={`panel overflow-hidden ${best ? 'border-accent/40 shadow-[0_6px_24px_-12px_rgba(40,30,110,0.35)]' : ''}`}
      aria-label={SLOT_LABELS[s.slot]}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className={`eyebrow ${best ? 'text-accent' : 'text-muted'}`}>{SLOT_LABELS[s.slot]}</span>
        <UrgencyChip u={s.urgency} />
      </div>
      <button
        type="button"
        className="block w-full px-4 pb-3 pt-1 text-left"
        onClick={() => id && openItem(id)}
        disabled={!id}
      >
        <h3 className={`font-display font-bold leading-snug ${best ? 'text-[22px]' : 'text-lg'}`}>{s.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold tnum">{s.timeLabel}</span>
          {s.walk != null && (
            <span className="inline-flex items-center gap-1 text-muted">
              <WalkIcon size={15} />≈ {s.walk} min walk
            </span>
          )}
          <span className="text-muted">{s.land === 'anywhere' ? 'Park-wide' : s.land}</span>
        </div>
        <p className="mt-1.5 text-sm leading-snug">{s.why}</p>
        {(s.uniq || s.uniqScore) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UniqChip uniq={s.uniq} />
            <UniqDots n={s.uniqScore} />
          </div>
        )}
      </button>
      {s.menu && (
        <a
          href={s.menu}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[46px] items-center justify-center gap-1.5 border-t border-line text-sm font-semibold text-accent"
        >
          <FoodIcon size={16} />
          Open menu
        </a>
      )}
      {id && item && isRide && item.status !== 'completed' && (
        <div className="grid grid-cols-2 border-t border-line text-sm font-semibold">
          <button
            type="button"
            className="min-h-[46px] border-r border-line text-soon"
            onClick={() => {
              patchItem(id, { status: 'in_line' });
              toast(`In line for ${BY_ID[id].short}`);
            }}
          >
            I’m in line
          </button>
          <button
            type="button"
            className="min-h-[46px] text-go"
            onClick={() => {
              patchItem(id, { status: 'completed' });
              toast(`${BY_ID[id].short} completed`);
            }}
          >
            Done
          </button>
        </div>
      )}
    </article>
  );
}
