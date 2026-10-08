// STATUS: data source and freshness, pasting live JSON, manual waits, backup, clock, reset.

import { useState } from 'react';
import { ATTRACTIONS } from '../data/park';
import { chatgptSummary, exportJson } from '../lib/export';
import { LIVE_FEED_URL, demoSnapshot, parsePastedLive, type DpaState, type LiveStatus } from '../lib/live';
import { coerceState, dataStatus, defaultState } from '../lib/state';
import { agoLabel, fmtIso, fmtTime, parseHHMM, toHHMM } from '../lib/time';
import { useApp } from './AppContext';
import { CopyIcon, RefreshIcon } from './icons';
import { DataChip, SectionHeader } from './ui';

export function StatusTab({ persistOk }: { persistOk: boolean }) {
  const { state, update, now, rec, copy, refreshing, doRefresh, toast } = useApp();
  const status = dataStatus(state);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [stateText, setStateText] = useState('');
  const [stateError, setStateError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [manualId, setManualId] = useState('hm');
  const [manualWait, setManualWait] = useState('');
  const [manualStatus, setManualStatus] = useState<LiveStatus>('OPERATING');
  const [manualDpa, setManualDpa] = useState<DpaState>('unknown');

  const importPasted = () => {
    setPasteError('');
    try {
      const snapshot = parsePastedLive(pasteText);
      const count = Object.keys(snapshot.entries).length;
      update((s) => ({
        ...s,
        live: snapshot,
        lastRefresh: {
          at: new Date().toISOString(),
          ok: true,
          message: `Imported ${count} attractions from ${snapshot.source}.`,
        },
      }));
      setPasteText('');
      toast(`Imported ${count} attractions`);
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : String(err));
    }
  };

  const importState = () => {
    setStateError('');
    try {
      const next = coerceState(JSON.parse(stateText));
      update(() => next);
      setStateText('');
      toast('Previous state restored');
    } catch (err) {
      setStateError(
        err instanceof SyntaxError
          ? 'That isn’t valid JSON. Paste everything from “Copy Full JSON State”.'
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  const saveManual = () => {
    const n = manualWait.trim() === '' ? null : Math.max(0, Math.round(Number(manualWait)));
    update((s) => ({
      ...s,
      manual: {
        ...s.manual,
        [manualId]: {
          wait: n != null && Number.isFinite(n) ? n : null,
          status: manualStatus,
          dpa: manualDpa,
          at: new Date().toISOString(),
        },
      },
    }));
    setManualWait('');
    toast('Manual update saved');
  };

  const rideOptions = ATTRACTIONS.filter((a) => a.kind === 'ride' || a.kind === 'walkthrough').sort(
    (a, b) => b.priority - a.priority,
  );
  const manualCount = Object.keys(state.manual).length;

  return (
    <div className="pb-6">
      <div className="mt-4 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">Data & status</h2>
      </div>

      <section className="panel mt-3 p-4" aria-label="Live data">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DataChip state={state} />
          <span className="text-xs text-muted">
            {status.at ? `${fmtIso(status.at)} · ${agoLabel(status.at)}` : 'Never refreshed'}
          </span>
        </div>
        <p className="mt-2 text-sm">{status.detail}</p>
        {state.live && (
          <p className="mt-1 text-xs text-muted">
            Source: {state.live.source} · {Object.keys(state.live.entries).length} attractions matched
            {state.live.unmatched.length > 0 && ` · ${state.live.unmatched.length} not tracked here`}
            {state.live.dataAsOf && ` · data as of ${fmtIso(state.live.dataAsOf)}`}
          </p>
        )}
        {state.live?.demo && (
          <p className="mt-2 rounded-lg bg-skip px-3 py-2 text-sm font-bold text-card">
            DEMO DATA: simulated waits, not the real park.
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary mt-3 w-full"
          onClick={doRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshIcon size={18} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh Live Park Data'}
        </button>
        {state.lastRefresh && (
          <p className={`mt-2 text-xs ${state.lastRefresh.ok ? 'text-go' : 'text-muted'}`}>
            {fmtIso(state.lastRefresh.at)}: {state.lastRefresh.message}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Wait data comes from ThemeParks.wiki, an unofficial third-party aggregator. Tokyo Disney Resort publishes no
          public API; the official app stays the source of truth for DPA and Entry Requests. Shows aren’t in the feed.
        </p>
      </section>

      <SectionHeader>Paste live data</SectionHeader>
      <section className="panel p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Open{' '}
            <a
              className="font-semibold text-accent underline"
              href={LIVE_FEED_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              the live Tokyo Disneyland feed
            </a>{' '}
            in your browser.
          </li>
          <li>Select all the text and copy it.</li>
          <li>Paste it below and tap Import.</li>
        </ol>
        <p className="mt-1 text-xs text-muted">
          Use this when Refresh can’t reach the feed from this page. Simple lists work too:{' '}
          <code className="rounded bg-sunk px-1">{'{"Pooh’s Hunny Hunt": 25, "Haunted Mansion": 40}'}</code>
        </p>
        <label className="sr-only" htmlFor="ride-json">
          Ride data JSON
        </label>
        <textarea
          id="ride-json"
          className="field mt-2 min-h-[110px] py-2 font-mono text-xs"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste JSON here"
        />
        {pasteError && (
          <p className="mt-1 text-sm font-semibold text-skip" role="alert">
            {pasteError}
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary" onClick={importPasted} disabled={!pasteText.trim()}>
            Import
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              update((s) => ({ ...s, live: demoSnapshot(now) }));
              toast('DEMO DATA loaded (simulated)');
            }}
          >
            Load DEMO DATA
          </button>
        </div>
        {state.live && (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-skip underline"
            onClick={() => {
              update((s) => ({ ...s, live: null }));
              toast('Live data cleared');
            }}
          >
            Clear {state.live.demo ? 'demo' : 'live'} data
          </button>
        )}
      </section>

      <SectionHeader>Manual update</SectionHeader>
      <section className="panel space-y-2 p-4">
        <label className="block text-xs font-semibold text-muted" htmlFor="m-id">
          Attraction
          <select id="m-id" className="field mt-1" value={manualId} onChange={(e) => setManualId(e.target.value)}>
            {rideOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted" htmlFor="m-wait">
            Current wait (min)
            <input
              id="m-wait"
              inputMode="numeric"
              className="field mt-1 tnum"
              value={manualWait}
              onChange={(e) => setManualWait(e.target.value)}
              placeholder="e.g. 30"
            />
          </label>
          <label className="text-xs font-semibold text-muted" htmlFor="m-status">
            Open / closed
            <select
              id="m-status"
              className="field mt-1"
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as LiveStatus)}
            >
              <option value="OPERATING">Open</option>
              <option value="DOWN">Temporarily closed</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-muted" htmlFor="m-dpa">
          Premier Access
          <select
            id="m-dpa"
            className="field mt-1"
            value={manualDpa}
            onChange={(e) => setManualDpa(e.target.value as DpaState)}
          >
            <option value="unknown">Unknown / not offered</option>
            <option value="available">Available</option>
            <option value="sold_out">Sold out</option>
          </select>
        </label>
        <button type="button" className="btn btn-primary w-full" onClick={saveManual}>
          Save manual update
        </button>
        {manualCount > 0 && (
          <button
            type="button"
            className="text-sm font-semibold text-skip underline"
            onClick={() => update((s) => ({ ...s, manual: {} }))}
          >
            Clear {manualCount} manual entr{manualCount === 1 ? 'y' : 'ies'}
          </button>
        )}
      </section>

      <SectionHeader>Share & back up</SectionHeader>
      <section className="panel space-y-2 p-4">
        <button
          type="button"
          className="btn btn-gold w-full min-h-[52px]"
          onClick={() => copy(chatgptSummary(state, now, rec), 'Current state for ChatGPT')}
        >
          <CopyIcon size={18} />
          Copy Current State for ChatGPT
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => copy(exportJson(state), 'Full JSON state')}
        >
          <CopyIcon size={18} />
          Copy Full JSON State
        </button>
        <label className="block pt-2 text-xs font-semibold text-muted" htmlFor="state-json">
          Import previous state (from “Copy Full JSON State”)
          <textarea
            id="state-json"
            className="field mt-1 min-h-[90px] py-2 font-mono text-xs"
            value={stateText}
            onChange={(e) => setStateText(e.target.value)}
            placeholder='{"app":"tdl-park-day", ...}'
          />
        </label>
        {stateError && (
          <p className="text-sm font-semibold text-skip" role="alert">
            {stateError}
          </p>
        )}
        <button type="button" className="btn btn-ghost w-full" onClick={importState} disabled={!stateText.trim()}>
          Replace my day with this state
        </button>
        {!persistOk && (
          <p className="text-xs font-semibold text-soon">
            This browser isn’t saving changes. Use Copy Full JSON State as a backup.
          </p>
        )}
      </section>

      <SectionHeader>Notes</SectionHeader>
      <label className="sr-only" htmlFor="notes">
        Notes
      </label>
      <textarea
        id="notes"
        className="field min-h-[96px] py-2"
        value={state.notes}
        onChange={(e) => update((s) => ({ ...s, notes: e.target.value }))}
        placeholder="Anything ChatGPT should know: tired feet, rain, someone wants a churro…"
      />

      <SectionHeader>Clock</SectionHeader>
      <section className="panel space-y-2 p-4">
        <p className="text-sm">
          The planner uses Tokyo time ({fmtTime(now)} now{state.timeOverride != null ? ', simulated' : ''}). Set a time
          to preview later in the day.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted" htmlFor="time-override">
            Simulated time
            <input
              id="time-override"
              type="time"
              className="field mt-1"
              value={toHHMM(state.timeOverride)}
              onChange={(e) => update((s) => ({ ...s, timeOverride: parseHHMM(e.target.value) }))}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost self-end"
            onClick={() => update((s) => ({ ...s, timeOverride: null }))}
            disabled={state.timeOverride == null}
          >
            Use real time
          </button>
        </div>
      </section>

      <SectionHeader>Start over</SectionHeader>
      <section className="panel p-4">
        {confirmReset ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              This clears every status, reservation, wait, note and food entry on this device.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                Keep my day
              </button>
              <button
                type="button"
                className="btn bg-skip text-card"
                onClick={() => {
                  update(() => defaultState());
                  setConfirmReset(false);
                  toast('Day reset');
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost w-full text-skip" onClick={() => setConfirmReset(true)}>
            Reset the whole day
          </button>
        )}
      </section>
    </div>
  );
}
