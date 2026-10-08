// NOW: the three suggestions, entry tasks, what is coming up, and the seasonal checklist.

import { BY_ID, ENTRY_ACTIONS, PARK } from '../data/park';
import { chatgptSummary } from '../lib/export';
import { LIVE_FEED_URL } from '../lib/live';
import { halloweenChecklist } from '../lib/planner';
import { dataStatus, type Energy } from '../lib/state';
import { agoLabel, fmtIso, fmtRange, fmtTime } from '../lib/time';
import { useApp } from './AppContext';
import { CheckIcon, CopyIcon, PumpkinIcon, RefreshIcon } from './icons';
import { SuggestionCard } from './SuggestionCard';
import { DataChip, SectionHeader } from './ui';

const ENERGIES: Energy[] = ['aggressive', 'balanced', 'relaxed'];

export function NowTab() {
  const { state, update, patchItem, now, rec, copy, refreshing, doRefresh, toast } = useApp();
  const status = dataStatus(state);
  const openActions = ENTRY_ACTIONS.filter((a) => !state.entryActions[a.id]);
  const inLineIds = Object.entries(state.items)
    .filter(([, item]) => item.status === 'in_line')
    .map(([id]) => id);
  const upcoming = rec.commits.filter((c) => c.blockEnd > now).slice(0, 4);
  const checklist = halloweenChecklist(state, now);

  return (
    <div className="pb-6">
      {now < PARK.open && (
        <section className="panel mt-4 p-4" aria-label="Before park opening">
          <div className="eyebrow text-gold">Before park opening</div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-sunk p-2">
              <dt className="text-[11px] font-semibold text-muted">Arrive</dt>
              <dd className="font-display text-[15px] font-bold leading-tight tnum">
                {fmtRange(PARK.arriveStart, PARK.arriveEnd)}
              </dd>
            </div>
            <div className="rounded-xl bg-sunk p-2">
              <dt className="text-[11px] font-semibold text-muted">Happy Entry</dt>
              <dd className="font-display text-[15px] font-bold leading-tight tnum">≈ {fmtTime(PARK.happyEntry)}</dd>
            </div>
            <div className="rounded-xl bg-sunk p-2">
              <dt className="text-[11px] font-semibold text-muted">Park hours</dt>
              <dd className="font-display text-[15px] font-bold leading-tight tnum">9 AM–9 PM</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted">
            Happy Entry is about 15 minutes before general admission. Head straight to Pooh’s Hunny Hunt and do the app
            tasks in line.
          </p>
        </section>
      )}

      {inLineIds.map((id) => (
        <div
          key={id}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-soon-soft px-4 py-3 text-soon"
        >
          <div className="min-w-0">
            <div className="eyebrow">In line</div>
            <div className="truncate font-semibold text-ink">
              {BY_ID[id].short}
              {state.items[id].postedWait != null && (
                <span className="text-muted"> · posted {state.items[id].postedWait} min</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn bg-card text-go"
            onClick={() => {
              patchItem(id, { status: 'completed' });
              toast(`${BY_ID[id].short} completed`);
            }}
          >
            <CheckIcon size={18} />
            Done
          </button>
        </div>
      ))}

      {openActions.length > 0 && now >= PARK.arriveStart - 60 && (
        <section
          className="mt-4 rounded-2xl border-2 border-gold/50 bg-gold-soft p-4"
          aria-label="App tasks at park entry"
        >
          <div className="eyebrow text-gold">Do these right at park entry</div>
          <ul className="mt-2 space-y-1">
            {ENTRY_ACTIONS.map((a) => (
              <li key={a.id}>
                <label className="flex min-h-[48px] cursor-pointer items-start gap-3 py-1.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--accent)]"
                    checked={!!state.entryActions[a.id]}
                    onChange={(e) =>
                      update((s) => ({ ...s, entryActions: { ...s.entryActions, [a.id]: e.target.checked } }))
                    }
                  />
                  <span>
                    <span
                      className={`block font-semibold leading-snug ${state.entryActions[a.id] ? 'text-muted line-through' : 'text-ink'}`}
                    >
                      {a.label}
                    </span>
                    <span className="block text-xs text-muted">{a.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5 flex items-end justify-between gap-2 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">What Should I Do Next?</h2>
      </div>
      <p className="mb-3 px-1 text-sm text-muted">
        For {state.land} at {fmtTime(now)} · {state.energy} pace{state.halloween ? ' · Halloween first' : ''}
      </p>
      {rec.alerts.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {rec.alerts.map((alert) => (
            <li key={alert} className="rounded-xl bg-skip-soft px-3 py-2 text-sm font-semibold text-skip">
              {alert}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3">
        <SuggestionCard s={rec.best} />
        <SuggestionCard s={rec.lowWait} />
        <SuggestionCard s={rec.relaxed} />
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-[54px] text-base"
          onClick={doRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshIcon size={20} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh Live Park Data'}
        </button>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          <DataChip state={state} />
          <span>{status.at ? `Last update ${fmtIso(status.at)} (${agoLabel(status.at)})` : 'No refresh yet'}</span>
        </div>
        {state.lastRefresh && !state.lastRefresh.ok && (
          <p className="rounded-xl bg-sunk px-3 py-2 text-xs text-muted">
            {state.lastRefresh.message}{' '}
            <a
              className="font-semibold text-accent underline"
              href={LIVE_FEED_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the live feed
            </a>
            , copy all, then paste it on the Status tab.
          </p>
        )}
        <button
          type="button"
          className="btn btn-gold min-h-[54px] text-base"
          onClick={() => copy(chatgptSummary(state, now, rec), 'Current state for ChatGPT')}
        >
          <CopyIcon size={20} />
          Copy Current State for ChatGPT
        </button>
      </div>

      <SectionHeader>Right now</SectionHeader>
      <div className="panel space-y-3 p-4">
        <label className="block text-xs font-semibold text-muted" htmlFor="currently">
          What I’m doing
          <input
            id="currently"
            className="field mt-1"
            placeholder="e.g. Walking toward Haunted Mansion"
            value={state.currently}
            onChange={(e) => update((s) => ({ ...s, currently: e.target.value }))}
          />
        </label>
        <div>
          <div className="mb-1 text-xs font-semibold text-muted">Pace</div>
          <div className="seg" role="group" aria-label="Energy">
            {ENERGIES.map((energy) => (
              <button
                key={energy}
                type="button"
                aria-pressed={state.energy === energy}
                onClick={() => update((s) => ({ ...s, energy }))}
              >
                {energy[0].toUpperCase() + energy.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-[44px] items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold">
            <PumpkinIcon size={20} className="text-hallow" />
            Prioritize Halloween
          </span>
          <input
            type="checkbox"
            role="switch"
            className="h-6 w-11 accent-[var(--hallow)]"
            checked={state.halloween}
            onChange={(e) => update((s) => ({ ...s, halloween: e.target.checked }))}
          />
        </label>
      </div>

      {upcoming.length > 0 && (
        <>
          <SectionHeader>Coming up</SectionHeader>
          <ol className="panel divide-y divide-line">
            {upcoming.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-[74px] shrink-0 font-display text-[15px] font-bold leading-tight tnum">
                  {fmtTime(c.arriveBy)}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug">{c.label}</span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <SectionHeader right={<span className="chip bg-hallow-soft text-hallow">Seasonal</span>}>
        Halloween left today
      </SectionHeader>
      <ul className="panel divide-y divide-line">
        {checklist.map((h) => (
          <li key={h.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
            {h.itemId ? (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${h.done ? 'bg-go text-card' : 'border-2 border-hallow/50'}`}
              >
                {h.done && <CheckIcon size={14} />}
              </span>
            ) : (
              <input
                type="checkbox"
                aria-label={`Mark ${h.title} done`}
                className="h-6 w-6 shrink-0 accent-[var(--hallow)]"
                checked={h.done}
                onChange={(e) => update((s) => ({ ...s, extras: { ...s.extras, [h.key]: e.target.checked } }))}
              />
            )}
            <span className={`min-w-0 flex-1 text-sm ${h.done ? 'text-muted line-through' : 'font-semibold'}`}>
              {h.title}
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted tnum">{h.when}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted">
        Full character costumes aren’t permitted Oct 1–15. Night High Halloween can be cancelled for wind.
      </p>
    </div>
  );
}
