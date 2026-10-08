// Small shared pieces: chips, the wait readout, the status picker, headers.

import type { ReactNode } from 'react';
import { BY_ID, PARK, type Uniq } from '../data/park';
import type { Urgency } from '../lib/planner';
import { STATUSES, STATUS_LABELS, dataStatus, waitFor, type AppState, type DataLabel, type Status } from '../lib/state';
import { fmtIso, tokyoMinutes } from '../lib/time';

const URGENCY_CLASS: Record<Urgency, string> = {
  'GO NOW': 'bg-go text-card',
  SOON: 'bg-soon-soft text-soon',
  FLEXIBLE: 'bg-flex-soft text-flex',
  LATER: 'bg-later-soft text-later',
  'SKIP FOR NOW': 'bg-skip-soft text-skip',
};

export function UrgencyChip({ u }: { u: Urgency }) {
  return <span className={`chip ${URGENCY_CLASS[u]}`}>{u}</span>;
}

export function UniqChip({ uniq, long }: { uniq: Uniq | null | undefined; long?: boolean }) {
  if (!uniq) return null;
  if (uniq === 'unique') return <span className="chip bg-accent-soft text-accent">Tokyo Unique</span>;
  if (uniq === 'variation') return <span className="chip bg-gold-soft text-gold">Tokyo Variation</span>;
  return (
    <span className={`chip bg-later-soft text-later ${long ? '!whitespace-normal text-left leading-tight' : ''}`}>
      {long ? 'Lower Priority for Anaheim Regulars' : 'Similar to Anaheim'}
    </span>
  );
}

export function UniqDots({ n }: { n: number | null | undefined }) {
  if (n == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" aria-label={`Uniqueness ${n} of 5`}>
      <span className="tnum font-semibold">Uniqueness {n}/5</span>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </span>
    </span>
  );
}

const DATA_LABEL_CLASS: Record<DataLabel, string> = {
  Live: 'bg-go-soft text-go',
  'Recently Updated': 'bg-flex-soft text-flex',
  Manual: 'bg-gold-soft text-gold',
  Stale: 'bg-soon-soft text-soon',
  'DEMO DATA': 'bg-skip text-card',
  'No data': 'bg-later-soft text-later',
};

/** The data-freshness chip. */
export function DataChip({ state, withTime }: { state: AppState; withTime?: boolean }) {
  const s = dataStatus(state);
  return (
    <span className={`chip ${DATA_LABEL_CLASS[s.label]}`} title={s.detail}>
      {s.label === 'Live' && <span className="pulse h-1.5 w-1.5 rounded-full bg-go" />}
      {s.label}
      {withTime && s.at && <span className="font-semibold normal-case tracking-normal">· {fmtIso(s.at)}</span>}
    </span>
  );
}

/** The wait in minutes (or closed / unknown) for a ride row. */
export function WaitDisplay({ state, id, large }: { state: AppState; id: string; large?: boolean }) {
  const info = waitFor(state, id);
  const a = BY_ID[id];
  const size = large ? 'text-2xl' : 'text-lg';
  const now = state.timeOverride ?? tokyoMinutes();
  if (info.status === 'CLOSED' && now < PARK.open + 15) {
    return <span className="chip bg-later-soft text-later">Not open yet</span>;
  }
  if (info.status === 'CLOSED' || info.status === 'DOWN' || info.status === 'REFURBISHMENT') {
    return <span className="chip bg-skip-soft text-skip">{info.status === 'DOWN' ? 'Temp. closed' : 'Closed'}</span>;
  }
  if (info.wait == null) {
    return (
      <span className="text-right leading-tight">
        <span className={`block font-display ${size} text-muted`}>—</span>
        <span className="block text-[11px] text-muted">typ. ~{a.typicalWait ?? '?'}m</span>
      </span>
    );
  }
  const typical = a.typicalWait ?? 30;
  const tone =
    info.wait <= Math.max(15, typical * 0.6)
      ? 'text-go'
      : info.wait > 60
        ? 'text-skip'
        : info.wait > typical
          ? 'text-soon'
          : 'text-ink';
  return (
    <span className="text-right leading-tight">
      <span className={`block font-display ${size} font-bold tnum ${tone}`}>
        {info.wait}
        <span className="text-xs font-sans font-semibold"> min</span>
      </span>
      <span className="block text-[11px] text-muted">
        {info.source === 'manual' ? 'manual' : info.source === 'demo' ? 'DEMO' : `as of ${fmtIso(info.at)}`}
      </span>
    </span>
  );
}

const STATUS_CLASS: Record<Status, string> = {
  not_done: 'bg-later-soft text-later',
  planned: 'bg-flex-soft text-flex',
  reserved: 'bg-accent-soft text-accent',
  in_line: 'bg-soon-soft text-soon',
  completed: 'bg-go-soft text-go',
  skipped: 'bg-skip-soft text-skip',
};

export function StatusPicker({
  value,
  onChange,
  idBase,
}: {
  value: Status;
  onChange: (s: Status) => void;
  idBase: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Status">
      {STATUSES.map((s) => (
        <button
          key={s}
          id={`${idBase}-${s}`}
          type="button"
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={`min-h-[42px] rounded-lg border text-sm font-semibold transition ${
            value === s ? `${STATUS_CLASS[s]} border-transparent ring-2 ring-current` : 'border-line bg-card text-muted'
          }`}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = {
  not_done: 'text-muted',
  planned: 'text-flex',
  reserved: 'text-accent',
  in_line: 'text-soon',
  completed: 'text-go',
  skipped: 'text-skip',
};

export function StatusText({ s }: { s: Status }) {
  return <span className={`text-xs font-bold ${STATUS_TEXT[s]}`}>{STATUS_LABELS[s]}</span>;
}

export function SectionHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between gap-3 px-1">
      <h2 className="font-display text-xl font-bold leading-tight">{children}</h2>
      {right}
    </div>
  );
}
