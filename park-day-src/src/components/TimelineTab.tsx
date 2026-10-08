// TIMELINE: the day as a vertical list of fixed and flexible blocks.

import { Fragment, type ReactNode } from 'react';
import { buildTimeline, type Block, type BlockKind } from '../lib/timeline';
import { fmtTime } from '../lib/time';
import { useApp } from './AppContext';
import { CastleIcon, ClockIcon, CoasterIcon, FoodIcon, ShowIcon, SparkIcon } from './icons';

const BLOCK_STYLE: Record<BlockKind, { dot: string; icon: ReactNode }> = {
  arrive: { dot: 'bg-later text-card', icon: <CastleIcon size={14} /> },
  entry: { dot: 'bg-gold text-card', icon: <ClockIcon size={14} /> },
  ride: { dot: 'bg-accent text-accent-ink', icon: <CoasterIcon size={14} /> },
  show: { dot: 'bg-flex text-card', icon: <ShowIcon size={14} /> },
  parade: { dot: 'bg-hallow text-card', icon: <CastleIcon size={14} /> },
  fireworks: { dot: 'bg-hallow text-card', icon: <SparkIcon size={14} /> },
  meal: { dot: 'bg-go text-card', icon: <FoodIcon size={14} /> },
  flex: { dot: 'bg-sunk text-muted', icon: <ClockIcon size={14} /> },
  final: { dot: 'bg-later text-card', icon: <CastleIcon size={14} /> },
  pending: { dot: 'bg-sunk text-muted', icon: <ShowIcon size={14} /> },
};

function TimelineRow({ b, now }: { b: Block; now: number }) {
  const { openItem } = useApp();
  const current = b.start <= now && now < b.end && !b.done;
  const style = BLOCK_STYLE[b.kind];
  return (
    <li className="relative flex gap-3 pb-4 pl-1">
      <div className="w-[62px] shrink-0 pt-0.5 text-right">
        <div className={`font-display text-[15px] font-bold leading-tight tnum ${b.done ? 'text-muted' : ''}`}>
          {/* Non-breaking space keeps "10:30 AM" on one line in the narrow column. */}
          {fmtTime(b.start).replace(' ', ' ')}
        </div>
        <div className="text-[11px] text-muted tnum">{fmtTime(b.end)}</div>
      </div>
      <div className="relative flex flex-col items-center">
        <span
          className={`z-[1] flex h-7 w-7 items-center justify-center rounded-full ${
            b.pending ? 'border-2 border-dashed border-line bg-card text-muted' : style.dot
          } ${b.done ? 'opacity-50' : ''}`}
        >
          {style.icon}
        </span>
      </div>
      <button
        type="button"
        disabled={!b.itemId}
        onClick={() => b.itemId && openItem(b.itemId)}
        className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left ${
          current
            ? 'bg-accent-soft ring-2 ring-accent'
            : b.fixed
              ? 'bg-card border border-line'
              : 'border border-dashed border-line'
        } ${b.done ? 'opacity-60' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`font-semibold leading-snug ${b.done ? 'line-through' : ''}`}>{b.title}</span>
          {current && <span className="chip bg-accent text-accent-ink">Now</span>}
          {b.done && <span className="chip bg-go-soft text-go">Done</span>}
          {!b.fixed && !b.done && <span className="chip bg-sunk text-muted">Flexible</span>}
          {b.pending && <span className="chip bg-soon-soft text-soon">Pending</span>}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{b.sub}</p>
        {b.shiftReason && <p className="mt-1 text-xs font-semibold text-flex">{b.shiftReason}</p>}
        {b.conflict && <p className="mt-1 text-xs font-semibold text-skip">⚠ {b.conflict}</p>}
        {b.noRoom && <p className="mt-1 text-xs font-semibold text-skip">No room left before close</p>}
      </button>
    </li>
  );
}

export function TimelineTab() {
  const { state, now } = useApp();
  const { blocks, waiting } = buildTimeline(state, now);
  let nowShown = false;
  return (
    <div className="pb-6">
      <div className="mt-4 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">Today’s timeline</h2>
        <p className="text-sm text-muted">
          Solid blocks are fixed times. Dashed blocks are flexible and re-flow around your reservations.
        </p>
      </div>
      {waiting.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {waiting.map((w) => (
            <li key={w} className="rounded-xl bg-soon-soft px-3 py-2 text-sm text-soon">
              {w}
            </li>
          ))}
        </ul>
      )}
      <ol className="relative mt-4" aria-label="Itinerary">
        <span aria-hidden className="absolute bottom-4 left-[86px] top-2 w-px bg-line" />
        {blocks.map((b) => {
          const showNow = !nowShown && b.start > now;
          if (showNow) nowShown = true;
          return (
            <Fragment key={b.id}>
              {showNow && (
                <li className="relative mb-4 flex items-center gap-2 pl-1" aria-label={`Now, ${fmtTime(now)}`}>
                  <span className="w-[62px] text-right font-display text-[15px] font-bold text-skip tnum">
                    {fmtTime(now)}
                  </span>
                  <span className="z-[1] ml-[9px] h-3 w-3 rounded-full bg-skip" />
                  <span className="h-0.5 flex-1 bg-skip/60" />
                  <span className="eyebrow text-skip">Now</span>
                </li>
              )}
              <TimelineRow b={b} now={now} />
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
