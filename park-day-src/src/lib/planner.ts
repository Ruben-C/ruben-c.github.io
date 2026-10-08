// The "What should I do next?" engine: fixed commitments (parades, DPA
// windows, shows, dining), ride scoring from live waits, and the three
// suggestions (best, low-wait, relaxed) for the NOW tab.

import {
  ATTRACTIONS,
  BY_ID,
  ENTRY_ACTIONS,
  EXTRAS,
  PARK,
  RESTAURANTS,
  findRestaurant,
  menuUrl,
  t,
  walkMinutes,
  type Attraction,
  type Land,
  type Uniq,
} from '../data/park';
import { dataStatus, waitFor, type AppState } from './state';
import { fmtRange, fmtTime } from './time';

export type Urgency = 'GO NOW' | 'SOON' | 'FLEXIBLE' | 'LATER' | 'SKIP FOR NOW';
export type CommitKind = 'parade' | 'fireworks' | 'dpa-ride' | 'show' | 'dining';

/** Something with a time you must honour today. */
export interface Commitment {
  id: string;
  itemId?: string;
  label: string;
  kind: CommitKind;
  land: Land | 'anywhere';
  start: number;
  end: number;
  arriveBy: number;
  /** The span other activities must not run into. */
  blockStart: number;
  blockEnd: number;
  detail: string;
}

const byEnergy = (state: AppState, relaxed: number, balanced: number, aggressive: number) =>
  state.energy === 'relaxed' ? relaxed : state.energy === 'aggressive' ? aggressive : balanced;

export function commitments(state: AppState): Commitment[] {
  const out: Commitment[] = [];
  for (const a of ATTRACTIONS) {
    const item = state.items[a.id];
    if (!item || item.status === 'completed' || item.status === 'skipped') continue;

    if (a.id === 'frenzy') {
      const start = a.fixedTime ?? 0;
      if (item.status === 'reserved' && item.resStart != null) {
        out.push({
          id: 'frenzy',
          itemId: 'frenzy',
          label: 'Villains Halloween Parade (DPA)',
          kind: 'parade',
          land: a.land,
          start,
          end: start + a.duration,
          arriveBy: item.resStart,
          blockStart: item.resStart - 5,
          blockEnd: start + a.duration,
          detail: `Arrive by your DPA admission time, ${fmtTime(item.resStart)}. Parade at ${fmtTime(start)}.`,
        });
      } else {
        const early = byEnergy(state, 45, 40, 30);
        out.push({
          id: 'frenzy',
          itemId: 'frenzy',
          label: 'Villains Halloween Parade',
          kind: 'parade',
          land: a.land,
          start,
          end: start + a.duration,
          arriveBy: start - early,
          blockStart: start - early,
          blockEnd: start + a.duration,
          detail: `No DPA: find a viewing spot by ${fmtTime(start - early)} (30–45 min early).`,
        });
      }
      continue;
    }

    if (a.id === 'epd') {
      const start = item.status === 'reserved' && item.resStart != null ? item.resStart : (a.fixedTime ?? 0);
      const early = byEnergy(state, 30, 20, 15);
      out.push({
        id: 'epd',
        itemId: 'epd',
        label: 'Electrical Parade Dreamlights',
        kind: 'parade',
        land: a.land,
        start,
        end: start + a.duration,
        arriveBy: start - early,
        blockStart: start - early,
        blockEnd: start + a.duration,
        detail: `Parade at ${fmtTime(start)}. Find a spot about ${early} min early.`,
      });
      continue;
    }

    if (a.id === 'nhh') {
      const start = a.fixedTime ?? 0;
      out.push({
        id: 'nhh',
        itemId: 'nhh',
        label: 'Night High Halloween',
        kind: 'fireworks',
        land: 'anywhere',
        start,
        end: start + a.duration,
        arriveBy: start - 5,
        blockStart: start - 5,
        blockEnd: start + a.duration,
        detail: 'Fireworks, about 5 min. Visible park-wide; avoid the spot right in front of the castle.',
      });
      continue;
    }

    if (item.status !== 'reserved' || item.resStart == null) continue;

    if (a.kind === 'ride' || a.kind === 'walkthrough') {
      const end = item.resEnd ?? item.resStart + 60;
      out.push({
        id: `res-${a.id}`,
        itemId: a.id,
        label: `${a.short} ${item.resType ?? 'DPA'}`,
        kind: 'dpa-ride',
        land: a.land,
        start: item.resStart,
        end,
        arriveBy: item.resStart,
        blockStart: item.resStart,
        blockEnd: Math.min(end, item.resStart + 30),
        detail: `Return window ${fmtRange(item.resStart, end)}.`,
      });
    } else {
      const early = a.arriveEarly ?? 15;
      out.push({
        id: `res-${a.id}`,
        itemId: a.id,
        label: `${a.short} (${item.resType ?? 'reserved'})`,
        kind: 'show',
        land: a.land,
        start: item.resStart,
        end: item.resEnd ?? item.resStart + a.duration,
        arriveBy: item.resStart - early,
        blockStart: item.resStart - early,
        blockEnd: item.resEnd ?? item.resStart + a.duration,
        detail: `Show at ${fmtTime(item.resStart)}${a.venue ? `, ${a.venue}` : ''}. Arrive about ${early} min early.`,
      });
    }
  }

  for (const f of state.food) {
    if (!f.isReservation || f.time == null || f.done) continue;
    const restaurant = findRestaurant(f.place);
    out.push({
      id: `food-${f.id}`,
      label: `${f.kind}: ${f.place || 'Dining reservation'}`,
      kind: 'dining',
      land: restaurant?.land ?? state.land,
      start: f.time,
      end: f.time + f.duration,
      arriveBy: f.time - 5,
      blockStart: f.time - 5,
      blockEnd: f.time + f.duration,
      detail: `Reservation at ${fmtTime(f.time)}.`,
    });
  }

  return out.sort((a, b) => a.blockStart - b.blockStart);
}

function walkTo(from: string, to: string): number {
  return to === 'anywhere' ? 0 : walkMinutes(from, to);
}

/** The first commitment an activity of `minutes` would run into, or park closing. */
export function conflictFor(
  now: number,
  from: string,
  to: string,
  minutes: number,
  commits: Commitment[],
  skipItemId?: string,
  slack = 0,
): { label: string } | null {
  const finish = now + walkTo(from, to) + minutes;
  for (const c of commits) {
    if (c.blockEnd <= now || (skipItemId && c.itemId === skipItemId)) continue;
    if (finish + walkTo(to, c.land) > c.blockStart) return c;
  }
  return finish > PARK.close + slack ? { label: 'park closing' } : null;
}

const UNIQ_BONUS: Record<Uniq, number> = { unique: 15, variation: 8, overlap: -12 };

interface ScoredRide {
  c: Attraction;
  score: number;
  urgency: Urgency;
  reasons: string[];
  wait: number;
  waitKnown: boolean;
  source: string;
  walk: number;
  favorable: boolean;
  excluded?: string;
}

function scoreRides(state: AppState, now: number, commits: Commitment[]): ScoredRide[] {
  const out: ScoredRide[] = [];
  const lastHalfHour = now >= t(20, 35);
  const earlyMorning = now < t(10, 15);
  const sinceEntry = now - PARK.happyEntry;

  for (const a of ATTRACTIONS) {
    if (a.kind !== 'ride' && a.kind !== 'walkthrough') continue;
    const item = state.items[a.id];
    const done = item.status === 'completed';
    if (item.status === 'skipped' || item.status === 'in_line' || (done && !lastHalfHour)) continue;

    const info = waitFor(state, a.id);
    const reasons: string[] = [];
    let excluded: string | undefined;
    let forced: Urgency | null = null;

    // Beauty and the Beast is a DPA ride: only suggest standby when asked, and only with a known wait.
    if (
      (a.id === 'bnb' && item.resStart != null && item.status === 'reserved' && !item.standbyOk) ||
      (a.id === 'bnb' && !(info.wait != null && info.source !== 'none'))
    ) {
      continue;
    }

    if (
      !(info.status === 'CLOSED' && now < PARK.open + 15) &&
      (info.status === 'CLOSED' || info.status === 'DOWN' || info.status === 'REFURBISHMENT')
    ) {
      excluded = info.status === 'DOWN' ? 'Temporarily closed' : 'Closed';
    }

    const liveWait = info.wait;
    const known = liveWait != null && info.source !== 'none';
    let wait = known ? liveWait : (a.typicalWait ?? 20);
    if (!known && sinceEntry >= 0 && sinceEntry < 45) wait = Math.round(wait * 0.4);
    if (!known && sinceEntry < 0) wait = Math.round((a.typicalWait ?? 20) * 0.35);

    const walk = walkMinutes(state.land, a.land);
    let score = a.priority + UNIQ_BONUS[a.uniq];
    if (state.halloween && a.halloween) score += 25;
    let waitScore = wait <= 10 ? 35 : wait <= 20 ? 25 : wait <= 30 ? 12 : wait <= 45 ? 0 : wait <= 60 ? -18 : -40;
    if (state.energy === 'aggressive') waitScore *= 1.3;
    if (state.energy === 'relaxed' && wait > 40) waitScore -= 10;
    score += waitScore;
    if (!known) score -= 5;
    score -= walk * (state.energy === 'relaxed' ? 2.6 : state.energy === 'aggressive' ? 0.8 : 1.4);

    if (earlyMorning && !done) {
      if (a.id === 'pooh') {
        score += 45;
        reasons.push('Planned rope-drop ride');
        if (sinceEntry >= 0 && sinceEntry < 45) forced = 'GO NOW';
      }
      if (a.id === 'monsters' && state.items.pooh.status === 'completed') {
        score += 30;
        reasons.push('Next in the morning plan');
      }
    }

    const typical = a.typicalWait ?? 20;
    const favorable = known && (wait <= 20 || wait <= typical * 0.6);
    let urgency: Urgency = forced ?? 'FLEXIBLE';

    if (a.id === 'pooh' && known && wait <= 15) {
      urgency = 'GO NOW';
      score += 20;
      reasons.unshift('GO NOW — excellent value');
    }
    if (a.id === 'hm') {
      if (known && wait <= 25 && !done) {
        score += 40;
        urgency = 'GO NOW';
        reasons.unshift(`Only ${wait} min. Big chance for the Halloween overlay`);
      } else if (wait > 60) {
        score -= 30;
        urgency = 'LATER';
        reasons.unshift('Over 60 min. Postpone and check again later');
      } else if (now < t(12) && wait <= 45) {
        score += 10;
        reasons.push('Good before-lunch target (≤ 45 min)');
      }
    }
    if (a.id === 'monsters' && known && wait <= 20 && !done) {
      score += 30;
      urgency = 'GO NOW';
      reasons.unshift('Strong pick: very different from Anaheim’s Monsters, Inc.');
    }
    if (a.id === 'bnb' && !item.standbyOk && known && wait <= 40) {
      score += 30;
      urgency = 'GO NOW';
      reasons.unshift(`Standby only ${wait} min. Rare for this ride`);
    }
    if (a.uniq === 'overlap') {
      reasons.push(known && wait <= 10 ? 'Optional filler. Similar to Anaheim' : 'Lower Priority for Anaheim Regulars');
    } else if (a.uniq === 'unique' && reasons.length < 2) {
      reasons.push(a.anaheimNote ?? 'Tokyo-only');
    }
    if (done && lastHalfHour) {
      score = score * 0.5;
      reasons.unshift('Repeat ride for the last half hour');
    }
    if (urgency === 'FLEXIBLE') {
      if (favorable && a.priority >= 40) urgency = 'GO NOW';
      else if (known && wait <= typical * 0.8 && a.priority >= 20) urgency = 'SOON';
      else if (wait > 60) urgency = 'LATER';
    }
    if (!excluded) {
      const hit = conflictFor(now, state.land, a.land, wait + a.duration, commits, a.id);
      if (hit) excluded = `Would run into ${hit.label}`;
    }
    if (excluded) urgency = 'SKIP FOR NOW';

    out.push({
      c: a,
      score,
      urgency,
      reasons,
      wait,
      waitKnown: known,
      source: known ? info.source : 'typical',
      walk,
      favorable,
      excluded,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export type Slot = 'best' | 'lowwait' | 'relaxed';

export interface Suggestion {
  slot: Slot;
  key: string;
  itemId?: string;
  title: string;
  land: string;
  timeLabel: string;
  walk: number | null;
  why: string;
  uniq: Uniq | null;
  uniqScore: number | null;
  urgency: Urgency;
  waitSource: string;
  /** Official menu page, for restaurant suggestions. */
  menu?: string;
}

function rideSuggestion(slot: Slot, r: ScoredRide): Suggestion {
  const timeLabel = r.waitKnown ? `Wait ${r.wait} min` : `No live wait · typical ~${r.c.typicalWait ?? '?'} min`;
  return {
    slot,
    key: r.c.id,
    itemId: r.c.id,
    title: r.c.name,
    land: r.c.land,
    timeLabel,
    walk: r.walk,
    why:
      r.reasons
        .slice(0, 2)
        .map((s) => s.replace(/\.$/, ''))
        .join('. ') + (r.reasons.length ? '.' : '') || 'Good value right now.',
    uniq: r.c.uniq,
    uniqScore: r.c.uniqScore,
    urgency: r.urgency,
    waitSource: r.source,
  };
}

interface RelaxedOption {
  key: string;
  itemId?: string;
  title: string;
  land: Land;
  minutes: number;
  base: number;
  why: string;
  kind: 'snack' | 'meal' | 'merch' | 'photo' | 'show';
  halloween?: boolean;
}

const BREAK_IDS = ['philharmagic', 'tiki', 'countrybear', 'stitch', 'cinderella', 'wrr', 'omnibus', 'marktwain'];

function relaxedOptions(state: AppState, now: number): RelaxedOption[] {
  const out: RelaxedOption[] = [];
  const ate = (kind: string) => state.food.some((f) => f.kind === kind && f.done);
  const lunch = now >= t(11) && now < t(14) && !ate('Lunch');
  const dinner = now >= t(17) && now < t(19, 30) && !ate('Dinner');
  const visited = new Set(state.food.filter((f) => f.done).map((f) => f.place.trim().toLowerCase()));

  for (const r of RESTAURANTS) {
    if (r.closed || visited.has(r.name.toLowerCase())) continue;
    const snack = r.style === 'Snack';
    let base = snack ? 18 : 12;
    let why = `No-seafood pick: ${r.noSeafoodPick}.`;
    if (!snack && (lunch || dinner)) {
      base += 35;
      why = `${lunch ? 'Lunch' : 'Dinner'} window. ${why}`;
    }
    if (snack && now >= t(14) && now < t(17)) base += 10;
    if (r.halloween) why = `Halloween special. ${why}`;
    out.push({
      key: `food-${r.id}`,
      title: r.name,
      land: r.land,
      minutes: snack ? 15 : 45,
      base,
      why,
      kind: snack ? 'snack' : 'meal',
      halloween: r.halloween,
    });
  }

  for (const x of EXTRAS) {
    if (x.kind === 'food') continue;
    out.push({
      key: x.id,
      title: x.name,
      land: x.land,
      minutes: x.kind === 'merch' ? 25 : 15,
      base: 16,
      why: x.detail,
      kind: x.kind,
      halloween: true,
    });
  }

  out.push({
    key: 'castle',
    title: 'Castle forecourt photos and atmosphere',
    land: 'World Bazaar',
    minutes: 15,
    base: 10,
    why: 'Low effort; Halloween decor around the hub.',
    kind: 'photo',
  });
  if (now >= t(20, 35)) {
    out.push({
      key: 'wb-shop',
      title: 'World Bazaar shopping',
      land: 'World Bazaar',
      minutes: 25,
      base: 30,
      why: 'Last block of the night. Shops are on your way out.',
      kind: 'merch',
      halloween: true,
    });
  }

  for (const id of BREAK_IDS) {
    const a = BY_ID[id];
    const status = state.items[id]?.status;
    if (status === 'completed' || status === 'skipped') continue;
    const info = waitFor(state, id);
    if (info.status === 'CLOSED' || info.status === 'DOWN') continue;
    const wait = info.wait ?? a.typicalWait ?? 15;
    let base = a.indoor ? 16 : 10;
    if (a.indoor && now >= t(12) && now < t(16)) base += 8;
    if (a.uniq !== 'overlap') base += 4;
    out.push({
      key: id,
      itemId: id,
      title: a.name,
      land: a.land,
      minutes: wait + a.duration,
      base,
      why: `${a.indoor ? 'Seated indoor break' : 'Easy sit-down ride'}. ${a.anaheimNote ?? ''}`.trim(),
      kind: 'show',
    });
  }
  return out;
}

export interface Recommendation {
  best: Suggestion;
  lowWait: Suggestion;
  relaxed: Suggestion;
  alerts: string[];
  commits: Commitment[];
  inLine: string[];
}

export function recommend(state: AppState, now: number): Recommendation {
  const commits = commitments(state);
  const alerts: string[] = [];
  const inLine = ATTRACTIONS.filter((a) => state.items[a.id]?.status === 'in_line').map((a) => a.short);

  if (dataStatus(state).label === 'Stale') alerts.push('Wait data is stale. Refresh before you commit to a line.');
  if (now >= t(8, 40) && now < t(14)) {
    const open = ENTRY_ACTIONS.filter((x) => !state.entryActions[x.id]);
    if (open.length) alerts.push(`${open.length} app task${open.length > 1 ? 's' : ''} at entry still unchecked.`);
  }
  for (const a of ATTRACTIONS) {
    if (a.priority < 40) continue;
    const info = waitFor(state, a.id);
    const status = state.items[a.id]?.status;
    if (
      (info.status === 'DOWN' || (info.status === 'CLOSED' && now >= PARK.open && now < PARK.close - 30)) &&
      status !== 'completed' &&
      status !== 'skipped'
    ) {
      alerts.push(`${a.short} is ${info.status === 'DOWN' ? 'temporarily closed' : 'showing closed'}.`);
    }
  }

  if (now < PARK.happyEntry) {
    const best: Suggestion =
      state.items.pooh.status === 'completed'
        ? {
            slot: 'best',
            key: 'arrive',
            title: 'Arrive and do the app tasks at entry',
            land: 'World Bazaar',
            timeLabel: `Arrive ${fmtRange(PARK.arriveStart, PARK.arriveEnd)}`,
            walk: null,
            why: 'Happy Entry is about 15 min before the 9:00 AM opening.',
            uniq: null,
            uniqScore: null,
            urgency: 'SOON',
            waitSource: 'scheduled',
          }
        : {
            slot: 'best',
            key: 'pooh',
            itemId: 'pooh',
            title: 'Pooh’s Hunny Hunt at Happy Entry',
            land: 'Fantasyland',
            timeLabel: `Happy Entry ≈ ${fmtTime(PARK.happyEntry)}`,
            walk: walkMinutes('World Bazaar', 'Fantasyland'),
            why: `Arrive ${fmtRange(PARK.arriveStart, PARK.arriveEnd)}. Do the app tasks in line. Pooh is the planned first ride.`,
            uniq: 'unique',
            uniqScore: 5,
            urgency: now >= t(8, 25) ? 'GO NOW' : 'SOON',
            waitSource: 'scheduled',
          };
    return {
      best,
      lowWait: {
        slot: 'lowwait',
        key: 'monsters',
        itemId: 'monsters',
        title: 'Monsters, Inc. Ride & Go Seek!',
        land: 'Tomorrowland',
        timeLabel: 'Second stop after Pooh',
        walk: walkMinutes('Fantasyland', 'Tomorrowland'),
        why: 'Morning waits are lowest. Very different from Anaheim’s Monsters, Inc.',
        uniq: 'unique',
        uniqScore: 5,
        urgency: 'FLEXIBLE',
        waitSource: 'scheduled',
      },
      relaxed: {
        slot: 'relaxed',
        key: 'hw-photo-entrance',
        title: 'Halloween photo spots at the park entrance',
        land: 'World Bazaar',
        timeLabel: 'While you wait to enter',
        walk: 2,
        why: 'New this year at the entrance. Full costumes aren’t allowed Oct 1–15.',
        uniq: null,
        uniqScore: null,
        urgency: 'FLEXIBLE',
        waitSource: 'n/a',
      },
      alerts,
      commits,
      inLine,
    };
  }

  if (now >= PARK.close) {
    const closed = (slot: Slot, title: string, why: string): Suggestion => ({
      slot,
      key: slot,
      title,
      land: 'World Bazaar',
      timeLabel: 'Park closed at 9:00 PM',
      walk: null,
      why,
      uniq: null,
      uniqScore: null,
      urgency: 'FLEXIBLE',
      waitSource: 'n/a',
    });
    return {
      best: closed('best', 'Head out through World Bazaar', 'The park day is done.'),
      lowWait: closed('lowwait', 'Mark what you finished', 'Update statuses so the recap is complete.'),
      relaxed: closed('relaxed', 'Copy your recap for ChatGPT', 'Use the Copy button below.'),
      alerts,
      commits,
      inLine,
    };
  }

  // A commitment that is (nearly) due takes the Best slot.
  let best: Suggestion | null = null;
  for (const c of commits) {
    if (c.blockEnd <= now) continue;
    const walk = walkTo(state.land, c.land);
    const leaveBy = c.arriveBy - walk;
    const inWindow = c.kind === 'dpa-ride' && now >= c.start && now < c.end;
    if (inWindow || now >= leaveBy - 10) {
      const a = c.itemId ? BY_ID[c.itemId] : undefined;
      best = {
        slot: 'best',
        key: c.id,
        itemId: c.itemId,
        title: a?.name ?? c.label,
        land: c.land,
        timeLabel:
          c.kind === 'dpa-ride'
            ? `Window ${fmtRange(c.start, c.end)}`
            : `${c.kind === 'dining' ? 'Seated' : 'Starts'} ${fmtTime(c.start)}`,
        walk: c.land === 'anywhere' ? null : walk,
        why: inWindow
          ? `Your DPA window is open until ${fmtTime(c.end)}.`
          : now >= c.blockStart
            ? `${c.detail} You should be there now.`
            : `Leave by ${fmtTime(Math.max(now, leaveBy))}. ${c.detail}`,
        uniq: a?.uniq ?? null,
        uniqScore: a?.uniqScore ?? null,
        urgency: inWindow || now >= leaveBy - 2 ? 'GO NOW' : 'SOON',
        waitSource: 'scheduled',
      };
      break;
    }
  }

  const rides = scoreRides(state, now, commits).filter((r) => !r.excluded);
  if (!best) {
    const top = rides[0];
    if (top) best = rideSuggestion('best', top);
  }

  const used = new Set<string>(best?.itemId ? [best.itemId] : []);
  const lowPick =
    rides
      .filter((r) => r.waitKnown && r.favorable && !used.has(r.c.id))
      .sort((a, b) => b.score + (30 - b.wait) - (a.score + (30 - a.wait)))[0] ??
    rides
      .filter((r) => r.waitKnown && !used.has(r.c.id))
      .sort((a, b) => a.wait / (a.c.priority + 20) - b.wait / (b.c.priority + 20))[0] ??
    rides.filter((r) => !used.has(r.c.id)).sort((a, b) => a.wait + a.walk - (b.wait + b.walk))[0];

  let lowWait: Suggestion;
  if (lowPick) {
    lowWait = rideSuggestion('lowwait', lowPick);
    if (!lowPick.waitKnown) lowWait.why = `Usually one of the shorter lines nearby. ${lowWait.why}`;
    used.add(lowPick.c.id);
  } else {
    lowWait = {
      slot: 'lowwait',
      key: 'none',
      title: 'No ride fits before your next plan',
      land: state.land,
      timeLabel: '—',
      walk: null,
      why: 'Everything open would run into a reservation or show.',
      uniq: null,
      uniqScore: null,
      urgency: 'SKIP FOR NOW',
      waitSource: 'n/a',
    };
  }

  const relaxedPick = relaxedOptions(state, now)
    .filter((o) => !(o.itemId && used.has(o.itemId)))
    .map((o) => {
      const walk = walkMinutes(state.land, o.land);
      let sc = o.base - walk * (state.energy === 'relaxed' ? 3 : 2);
      if (state.halloween && o.halloween) sc += 20;
      if (state.energy === 'relaxed') sc += 10;
      const slack = o.kind === 'merch' || o.kind === 'photo' || o.kind === 'snack' ? 30 : 0;
      const conflict = conflictFor(now, state.land, o.land, o.minutes, commits, o.itemId, slack);
      return { o, walk, sc, conflict };
    })
    .filter((x) => !x.conflict)
    .sort((a, b) => b.sc - a.sc)[0];

  const relaxed: Suggestion = relaxedPick
    ? {
        slot: 'relaxed',
        key: relaxedPick.o.key,
        itemId: relaxedPick.o.itemId,
        title: relaxedPick.o.title,
        land: relaxedPick.o.land,
        timeLabel: relaxedPick.o.kind === 'meal' ? 'About 45 min' : `About ${relaxedPick.o.minutes} min`,
        walk: relaxedPick.walk,
        why: relaxedPick.o.why,
        uniq: relaxedPick.o.itemId ? BY_ID[relaxedPick.o.itemId].uniq : null,
        uniqScore: relaxedPick.o.itemId ? BY_ID[relaxedPick.o.itemId].uniqScore : null,
        urgency: relaxedPick.sc >= 40 ? 'SOON' : 'FLEXIBLE',
        waitSource: 'n/a',
        menu: relaxedPick.o.key.startsWith('food-')
          ? (() => {
              const r = RESTAURANTS.find((x) => `food-${x.id}` === relaxedPick.o.key);
              return r ? menuUrl(r) : undefined;
            })()
          : undefined,
      }
    : {
        slot: 'relaxed',
        key: 'rest',
        title: 'Rest near your next stop',
        land: state.land,
        timeLabel: 'A few minutes',
        walk: null,
        why: 'Your next plan starts soon. Grab a drink and sit.',
        uniq: null,
        uniqScore: null,
        urgency: 'FLEXIBLE',
        waitSource: 'n/a',
      };

  if (!best) best = { ...relaxed, slot: 'best' };
  return { best, lowWait, relaxed, alerts, commits, inLine };
}

export interface ChecklistItem {
  key: string;
  itemId?: string;
  title: string;
  when: string;
  done: boolean;
}

/** The seasonal checklist on the NOW tab. */
export function halloweenChecklist(state: AppState, now: number): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const id of ['frenzy', 'hm', 'nhh']) {
    const a = BY_ID[id];
    const status = state.items[id].status;
    out.push({
      key: id,
      itemId: id,
      title: a.short,
      when: a.fixedTime != null ? fmtTime(a.fixedTime) : 'Any time',
      done: status === 'completed' || (a.fixedTime != null && now > a.fixedTime + a.duration && status !== 'reserved'),
    });
  }
  out.push({
    key: 'hw-food',
    title: 'Halloween food (purple hot dog, special sandwich, pumpkin churro)',
    when: 'Any time',
    done:
      !!state.extras['hw-food'] ||
      state.food.some(
        (f) => f.done && /halloween|purple|pumpkin|churro|sweetheart|refreshment/i.test(`${f.place} ${f.note}`),
      ),
  });
  out.push({
    key: 'hw-merch',
    title: 'Villains Halloween merchandise',
    when: 'World Bazaar',
    done: !!state.extras['hw-merch'],
  });
  out.push({
    key: 'hw-photo',
    title: 'Halloween photo spots (entrance, Toontown)',
    when: 'Any time',
    done: !!state.extras['hw-photo'],
  });
  return out;
}
