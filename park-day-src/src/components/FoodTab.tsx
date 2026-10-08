// FOOD: log meals and breaks, and see the nearest restaurants with a no-seafood pick.

import { useState } from 'react';
import { EXTRAS, RESTAURANTS, findRestaurant, infoUrl, menuUrl, walkMinutes } from '../data/park';
import { MEAL_KINDS, uid, type FoodEntry, type MealKind } from '../lib/state';
import { fmtTime, parseHHMM, toHHMM } from '../lib/time';
import { useApp } from './AppContext';
import { ChevronIcon, FoodIcon, PumpkinIcon, WalkIcon } from './icons';
import { SectionHeader } from './ui';

export function FoodTab() {
  const { state, update, toast } = useApp();
  const [kind, setKind] = useState<MealKind>('Lunch');
  const [place, setPlace] = useState('');
  const [time, setTime] = useState('');
  const [isReservation, setIsReservation] = useState(false);
  const [note, setNote] = useState('');

  const add = () => {
    const entry: FoodEntry = {
      id: uid(),
      kind,
      place: place.trim(),
      time: parseHHMM(time),
      isReservation,
      duration: kind === 'Snack' || kind === 'Break' ? 20 : 50,
      done: false,
      note: note.trim(),
    };
    update((s) => ({ ...s, food: [...s.food, entry].sort((a, b) => (a.time ?? 9999) - (b.time ?? 9999)) }));
    setPlace('');
    setTime('');
    setNote('');
    setIsReservation(false);
    toast(`${kind} added${entry.time != null ? ` at ${fmtTime(entry.time)}` : ''}`);
  };
  const patch = (id: string, changes: Partial<FoodEntry>) =>
    update((s) => ({ ...s, food: s.food.map((f) => (f.id === id ? { ...f, ...changes } : f)) }));
  const remove = (id: string) => update((s) => ({ ...s, food: s.food.filter((f) => f.id !== id) }));

  const nearby = [...RESTAURANTS]
    .filter((r) => !r.halloween)
    .sort((a, b) => +!!a.closed - +!!b.closed || walkMinutes(state.land, a.land) - walkMinutes(state.land, b.land));
  const treats = [
    ...RESTAURANTS.filter((r) => r.halloween).map((r) => ({
      id: r.id,
      name: r.name,
      detail: r.noSeafoodPick,
      menu: menuUrl(r) as string | undefined,
    })),
    ...EXTRAS.filter((x) => x.kind === 'food').map((x) => ({
      id: x.id,
      name: x.name,
      detail: x.detail,
      menu: undefined,
    })),
  ];

  return (
    <div className="pb-6">
      <div className="mt-4 px-1">
        <h2 className="font-display text-[26px] font-bold leading-tight">Food & breaks</h2>
      </div>
      <div className="mt-3 rounded-2xl border border-go/30 bg-go-soft p-4">
        <div className="eyebrow text-go">Dietary note</div>
        <p className="mt-1 font-semibold">No seafood for you (primary guest).</p>
        <p className="text-sm text-muted">
          Everyone else in your party can order seafood. Every suggestion below has at least one substantial non-seafood
          dish.
        </p>
      </div>

      <details className="panel mt-3 overflow-hidden" open>
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 font-display text-lg font-bold">
          <span className="flex items-center gap-2">
            <FoodIcon size={20} className="text-go" />
            Food & Breaks
          </span>
          <span className="text-sm font-sans font-semibold text-muted">{state.food.length} logged</span>
        </summary>
        <div className="space-y-3 border-t border-line p-4">
          <div className="seg" role="group" aria-label="Meal type">
            {MEAL_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className="!px-1 !text-[13px]"
              >
                {k}
              </button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-muted" htmlFor="food-place">
            Where
            <input
              id="food-place"
              list="food-spots"
              className="field mt-1"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Restaurant or snack stand"
            />
            <datalist id="food-spots">
              {RESTAURANTS.filter((r) => !r.closed).map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-muted" htmlFor="food-time">
              Time
              <input
                id="food-time"
                type="time"
                className="field mt-1"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-semibold" htmlFor="food-res">
              <input
                id="food-res"
                type="checkbox"
                className="h-6 w-6 accent-[var(--accent)]"
                checked={isReservation}
                onChange={(e) => setIsReservation(e.target.checked)}
              />
              Reservation
            </label>
          </div>
          <label className="block text-xs font-semibold text-muted" htmlFor="food-note">
            Note
            <input
              id="food-note"
              className="field mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Priority Seating, mobile order"
            />
          </label>
          <button type="button" className="btn btn-primary w-full" onClick={add}>
            Add {kind.toLowerCase()}
          </button>
          {state.food.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {state.food.map((f) => {
                const restaurant = findRestaurant(f.place);
                return (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Mark ${f.kind} done`}
                      className="h-6 w-6 shrink-0 accent-[var(--go)]"
                      checked={f.done}
                      onChange={(e) => patch(f.id, { done: e.target.checked })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${f.done ? 'text-muted line-through' : ''}`}>
                        {f.kind}
                        {f.place ? ` · ${f.place}` : ''}
                      </span>
                      <span className="block text-xs text-muted">
                        {f.isReservation ? 'Reservation · ' : ''}
                        <input
                          type="time"
                          aria-label="Change time"
                          className="bg-transparent text-xs text-muted"
                          value={toHHMM(f.time)}
                          onChange={(e) => patch(f.id, { time: parseHHMM(e.target.value) })}
                        />
                        {f.note ? ` · ${f.note}` : ''}
                      </span>
                      {restaurant && (
                        <a
                          href={menuUrl(restaurant)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-accent underline"
                        >
                          Menu
                        </a>
                      )}
                    </span>
                    <button
                      type="button"
                      className="min-h-[40px] px-2 text-sm font-semibold text-skip"
                      onClick={() => remove(f.id)}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted">
            Reservations block the planner: it won’t suggest a ride that would make you late.
          </p>
        </div>
      </details>

      <SectionHeader>Nearest good options</SectionHeader>
      <ul className="panel divide-y divide-line">
        {nearby.map((r) => (
          <li key={r.id} className={`px-4 py-3 ${r.closed ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{r.name}</span>
                <span className="block text-xs text-muted">
                  {r.land} · {r.style}
                  {r.priority ? ' · Priority Seating' : ''}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
                <WalkIcon size={14} />≈ {walkMinutes(state.land, r.land)} min
              </span>
            </div>
            <p className="mt-1 text-sm">
              <span className="font-semibold text-go">No-seafood pick:</span> {r.noSeafoodPick}
            </p>
            {r.note && <p className="text-xs text-muted">{r.note}</p>}
            {r.closed ? (
              <p className="mt-1">
                <span className="chip bg-skip-soft text-skip">{r.closed}</span>
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={menuUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost !min-h-[40px] !px-3 text-sm"
                >
                  <FoodIcon size={16} />
                  Menu
                </a>
                <a
                  href={infoUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost !min-h-[40px] !px-3 text-sm text-muted"
                >
                  Hours & info
                </a>
                <button
                  type="button"
                  className="inline-flex min-h-[40px] items-center gap-1 px-1 text-sm font-semibold text-accent"
                  onClick={() => {
                    setPlace(r.name);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Log a meal here <ChevronIcon size={14} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted">
        Menu and Hours links open the official Tokyo Disney Resort pages, which show current prices and Halloween
        specials.
      </p>

      <SectionHeader right={<span className="chip bg-hallow-soft text-hallow">Seasonal</span>}>
        Halloween treats
      </SectionHeader>
      <ul className="panel divide-y divide-line">
        {treats.map((d) => (
          <li key={d.id} className="flex items-start gap-3 px-4 py-3">
            <PumpkinIcon size={20} className="mt-0.5 shrink-0 text-hallow" />
            <span className="min-w-0">
              <span className="block font-semibold">{d.name}</span>
              <span className="block text-sm text-muted">{d.detail}</span>
              {d.menu && (
                <a
                  href={d.menu}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex min-h-[36px] items-center text-sm font-semibold text-accent underline"
                >
                  Open menu
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
