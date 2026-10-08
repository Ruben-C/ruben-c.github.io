// The TIMELINE tab: fixed blocks (arrival, reservations, parades) plus
// flexible blocks (rope-drop rides, meals, breaks) that slide around them.

import { ATTRACTIONS, BY_ID, PARK, t } from '../data/park';
import { commitments } from './planner';
import { waitFor, type AppState } from './state';
import { fmtTime } from './time';

export type BlockKind =
  | 'arrive'
  | 'entry'
  | 'ride'
  | 'show'
  | 'parade'
  | 'fireworks'
  | 'meal'
  | 'flex'
  | 'final'
  | 'pending';

export interface Block {
  id: string;
  start: number;
  end: number;
  title: string;
  sub: string;
  kind: BlockKind;
  itemId?: string;
  fixed: boolean;
  done: boolean;
  pending?: boolean;
  conflict?: string;
  shiftedFrom?: number;
  shiftReason?: string;
  noRoom?: boolean;
}

interface FlexBlock {
  id: string;
  /** Preferred start. */
  pref: number;
  dur: number;
  title: string;
  sub: string;
  kind: BlockKind;
  itemId?: string;
  done: boolean;
}

const FLEX_ORDER = ['flex-pooh', 'flex-monsters', 'flex-hm', 'flex-lunch', 'flex-dinner', 'flex-hw', 'flex-opp'];

export function buildTimeline(state: AppState, now: number): { blocks: Block[]; waiting: string[] } {
  const blocks: Block[] = [];
  const waiting: string[] = [];
  const statusOf = (id: string) => state.items[id]?.status;
  const isDone = (id: string) => statusOf(id) === 'completed';

  blocks.push({
    id: 'arrive',
    start: PARK.arriveStart,
    end: PARK.arriveEnd,
    title: 'Arrive at the main entrance',
    sub: 'Recommended arrival 8:10–8:20 AM',
    kind: 'arrive',
    fixed: true,
    done: now > PARK.arriveEnd,
  });
  blocks.push({
    id: 'entry',
    start: PARK.happyEntry,
    end: PARK.happyEntry + 5,
    title: 'Happy Entry · app tasks',
    sub: 'About 15 min before 9:00 AM. DPA for Beauty and the Beast, Entry Requests, parade DPA.',
    kind: 'entry',
    fixed: true,
    done: now > PARK.happyEntry + 5,
  });

  for (const c of commitments(state)) {
    const a = c.itemId ? BY_ID[c.itemId] : undefined;
    const kind: BlockKind =
      c.kind === 'dpa-ride'
        ? 'ride'
        : c.kind === 'dining'
          ? 'meal'
          : c.kind === 'show'
            ? 'show'
            : c.kind === 'fireworks'
              ? 'fireworks'
              : 'parade';
    let title = a?.name ?? c.label;
    if (c.kind === 'dpa-ride' && c.itemId)
      title = `${a ? a.short : c.label} · ${state.items[c.itemId].resType ?? 'DPA'}`;
    const start = c.kind === 'parade' || c.kind === 'show' || c.kind === 'fireworks' ? c.blockStart : c.start;
    const end = c.kind === 'dpa-ride' ? c.end : c.blockEnd;
    blocks.push({
      id: c.id,
      start,
      end,
      title,
      sub: c.detail,
      kind,
      itemId: c.itemId,
      fixed: true,
      done: c.itemId ? isDone(c.itemId) : false,
    });
  }

  // Completed reservations and parades still show, crossed out.
  for (const a of ATTRACTIONS) {
    const item = state.items[a.id];
    if (item.status === 'completed' && item.resStart != null && !blocks.some((b) => b.itemId === a.id)) {
      blocks.push({
        id: `done-${a.id}`,
        start: item.resStart,
        end: item.resEnd ?? item.resStart + a.duration,
        title: a.short,
        sub: `${item.resType ?? 'Reserved'} · completed`,
        kind: a.kind === 'ride' ? 'ride' : 'show',
        itemId: a.id,
        fixed: true,
        done: true,
      });
    }
    if (item.status === 'completed' && a.fixedTime != null && !blocks.some((b) => b.itemId === a.id)) {
      blocks.push({
        id: `done-${a.id}`,
        start: a.fixedTime,
        end: a.fixedTime + a.duration,
        title: a.short,
        sub: 'Completed',
        kind: a.kind === 'fireworks' ? 'fireworks' : 'parade',
        itemId: a.id,
        fixed: true,
        done: true,
      });
    }
  }

  const bnb = state.items.bnb;
  if (!(bnb.status === 'reserved' && bnb.resStart != null) && !isDone('bnb') && statusOf('bnb') !== 'skipped') {
    waiting.push('Beauty and the Beast: add your DPA return window (Rides tab) and the day will re-flow around it.');
  }
  const mmmw = state.items.mmmw;
  if (!(mmmw.status === 'reserved' && mmmw.resStart != null) && !isDone('mmmw') && statusOf('mmmw') !== 'skipped') {
    waiting.push(
      'Mickey’s Magical Music World: pick your Entry Request showtime (11:20, 12:45, 2:10, 4:15 or 5:40) in the Shows tab.',
    );
  }
  const dg4 = state.items.dg4;
  if (!(dg4.status === 'reserved' && dg4.resStart != null) && !isDone('dg4') && statusOf('dg4') !== 'skipped') {
    const target = BY_ID.dg4.targetTime ?? t(15, 10);
    blocks.push({
      id: 'dg4-target',
      start: target - 15,
      end: target + 25,
      title: 'D-Groovationz4 · target 3:10 PM',
      sub: 'Entry Request pending. Pick your actual time in the Shows tab.',
      kind: 'pending',
      itemId: 'dg4',
      fixed: true,
      done: false,
      pending: true,
    });
  }

  blocks.push({
    id: 'final',
    start: t(20, 35),
    end: PARK.close,
    title: 'Final half hour',
    sub: 'Haunted Mansion repeat, Pooh, Monsters, Inc., another short line, World Bazaar shopping, Halloween photos, or castle views.',
    kind: 'final',
    fixed: true,
    done: now >= PARK.close,
  });

  // Two fixed, timed events at once is a problem (a DPA window can flex, so rides are exempt).
  const fixedOpen = blocks.filter(
    (b) => b.fixed && !b.done && b.kind !== 'arrive' && b.kind !== 'entry' && b.kind !== 'final',
  );
  for (let i = 0; i < fixedOpen.length; i++) {
    for (let j = i + 1; j < fixedOpen.length; j++) {
      const x = fixedOpen[i];
      const y = fixedOpen[j];
      if (x.start < y.end && y.start < x.end && !(x.kind === 'ride' || y.kind === 'ride')) {
        x.conflict = `Overlaps ${y.title}`;
        y.conflict = `Overlaps ${x.title}`;
      }
    }
  }

  const hmWait = waitFor(state, 'hm').wait;
  const mealLogged = (kind: string) => state.food.some((f) => f.kind === kind && (f.done || f.time != null));
  const flex: FlexBlock[] = [];
  const addRide = (id: string, pref: number, dur: number, sub: string) => {
    const status = statusOf(id);
    if (status === 'skipped') return;
    if (status === 'reserved' && state.items[id].resStart != null) return;
    flex.push({
      id: `flex-${id}`,
      pref,
      dur,
      title: BY_ID[id].short,
      sub,
      kind: 'ride',
      itemId: id,
      done: status === 'completed',
    });
  };
  addRide('pooh', PARK.happyEntry, 30, 'Rope drop. Planned first ride.');
  addRide('monsters', t(9, 20), 35, 'Second ride of the morning. Very different from Anaheim’s.');
  addRide(
    'hm',
    t(10),
    50,
    hmWait == null
      ? 'Before lunch if the wait is about 45 min or less; otherwise later.'
      : hmWait > 60
        ? `Posted ${hmWait} min: postpone. Check again later.`
        : `Posted ${hmWait} min.`,
  );
  if (!mealLogged('Lunch')) {
    flex.push({
      id: 'flex-lunch',
      pref: t(11, 40),
      dur: 50,
      title: 'Lunch',
      sub: 'No-seafood pick for you; others can order freely. See Food tab.',
      kind: 'meal',
      done: false,
    });
  }
  flex.push({
    id: 'flex-opp',
    pref: t(13, 30),
    dur: 40,
    title: 'Short-wait rides nearby',
    sub: 'Use the Low-wait choice on the NOW tab.',
    kind: 'flex',
    done: false,
  });
  if (state.halloween) {
    flex.push({
      id: 'flex-hw',
      pref: t(17, 10),
      dur: 30,
      title: 'Halloween merch and photos',
      sub: 'World Bazaar shops; photo spots at the entrance and in Toontown.',
      kind: 'flex',
      done: false,
    });
  }
  if (!mealLogged('Dinner')) {
    flex.push({
      id: 'flex-dinner',
      pref: t(17, 45),
      dur: 50,
      title: 'Dinner',
      sub: 'Before Electrical Parade viewing.',
      kind: 'meal',
      done: false,
    });
  }

  for (const f of state.food) {
    if (f.time == null || f.isReservation) continue;
    blocks.push({
      id: `food-${f.id}`,
      start: f.time,
      end: f.time + f.duration,
      title: `${f.kind}${f.place ? `: ${f.place}` : ''}`,
      sub: f.note || (f.done ? 'Done' : 'Planned'),
      kind: 'meal',
      fixed: true,
      done: f.done,
    });
  }

  // Slide each flexible block forward until it fits between the fixed ones.
  const occupied = blocks
    .filter((b) => b.kind !== 'arrive' && b.kind !== 'entry' && !(b.done && b.end < now))
    .map((b) => ({ start: b.start, end: b.end, title: b.title }));
  for (const f of flex.sort((a, b) => FLEX_ORDER.indexOf(a.id) - FLEX_ORDER.indexOf(b.id))) {
    if (f.done) {
      blocks.push({
        id: f.id,
        start: f.pref,
        end: f.pref + f.dur,
        title: f.title,
        sub: 'Completed',
        kind: f.kind,
        itemId: f.itemId,
        fixed: false,
        done: true,
      });
      continue;
    }
    let start = Math.max(f.pref, now > f.pref ? now : f.pref);
    let bumpedBy: string | undefined;
    for (let i = 0; i < 40; i++) {
      const hit = occupied.find((o) => start < o.end && o.start < start + f.dur);
      if (!hit) break;
      bumpedBy = hit.title;
      start = hit.end;
    }
    const noRoom = start + f.dur > PARK.close;
    if (noRoom) {
      if (f.kind === 'meal' || f.kind === 'ride') {
        waiting.push(
          `No gap left for ${f.title} between your fixed plans. Fit it into a short break or drop something.`,
        );
      }
      continue;
    }
    const shiftedFrom = start - f.pref >= 10 && bumpedBy ? f.pref : undefined;
    blocks.push({
      id: f.id,
      start,
      end: start + f.dur,
      title: f.title,
      sub: f.sub,
      kind: f.kind,
      itemId: f.itemId,
      fixed: false,
      done: false,
      shiftedFrom,
      shiftReason:
        shiftedFrom != null
          ? `Moved from ${fmtTime(f.pref)} for ${bumpedBy}`
          : now > f.pref && start === now
            ? 'Not done yet, so it’s moved to now'
            : undefined,
      noRoom,
    });
    occupied.push({ start, end: start + f.dur, title: f.title });
  }

  blocks.sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed));
  return { blocks, waiting };
}
