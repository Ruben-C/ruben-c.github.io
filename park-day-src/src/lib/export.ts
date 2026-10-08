// Text and JSON exports: the recap pasted into ChatGPT, and a full backup.

import { ATTRACTIONS, BY_ID, KEY_IDS, PARK } from '../data/park';
import type { Recommendation } from './planner';
import { dataStatus, waitFor, type AppState } from './state';
import { fmtIso, fmtRange, fmtTime } from './time';

const bullets = (lines: string[], empty = 'None') =>
  lines.length ? lines.map((line) => `* ${line}`).join('\n') : `* ${empty}`;

export function chatgptSummary(state: AppState, now: number, rec: Recommendation): string {
  const status = dataStatus(state);
  const completed = ATTRACTIONS.filter((a) => state.items[a.id].status === 'completed').map((a) => a.name);

  const currently: string[] = [];
  if (state.currently.trim()) currently.push(state.currently.trim());
  for (const a of ATTRACTIONS) {
    const item = state.items[a.id];
    if (item.status === 'in_line') {
      currently.push(`In line for ${a.short}${item.postedWait != null ? ` (posted ${item.postedWait} min)` : ''}`);
    }
  }

  const reservations: string[] = [];
  for (const a of ATTRACTIONS) {
    const item = state.items[a.id];
    if (item.resStart == null || item.status === 'skipped') continue;
    const name = a.id === 'frenzy' ? 'Halloween Parade' : a.short;
    const when = a.kind === 'ride' ? fmtRange(item.resStart, item.resEnd) : fmtTime(item.resStart);
    const type = item.resType ? ` ${item.resType}` : '';
    reservations.push(`${name}${type}: ${when}${item.status === 'completed' ? ' — completed' : ''}`);
  }
  for (const f of state.food) {
    if (f.isReservation && f.time != null) {
      reservations.push(
        `${f.kind} reservation${f.place ? ` at ${f.place}` : ''}: ${fmtTime(f.time)}${f.done ? ' — completed' : ''}`,
      );
    }
  }

  const waits: string[] = [];
  const order = [...KEY_IDS, ...ATTRACTIONS.map((a) => a.id).filter((id) => !KEY_IDS.includes(id))];
  for (const id of order) {
    const a = BY_ID[id];
    const info = waitFor(state, id);
    if (info.source === 'none') continue;
    if (info.status === 'CLOSED' || info.status === 'DOWN' || info.status === 'REFURBISHMENT') {
      waits.push(`${a.short}: ${info.status === 'DOWN' ? 'temporarily closed' : 'closed'}`);
    } else if (info.wait != null) {
      const dpa = info.dpa === 'available' ? ' (DPA available)' : info.dpa === 'sold_out' ? ' (DPA sold out)' : '';
      waits.push(`${a.short}: ${info.wait} min${dpa}${info.source === 'manual' ? ' [manual]' : ''}`);
    }
    if (waits.length >= 14) break;
  }

  const notDone = KEY_IDS.filter((id) => !['completed', 'skipped'].includes(state.items[id].status)).map(
    (id) => `${BY_ID[id].short}${state.items[id].status === 'reserved' ? ' (reserved)' : ''}`,
  );
  const skipped = ATTRACTIONS.filter((a) => state.items[a.id].status === 'skipped').map((a) => a.short);

  const food = state.food.map(
    (f) =>
      `${f.kind}${f.place ? ` at ${f.place}` : ''}${f.time != null ? ` ${fmtTime(f.time)}` : ''} — ${f.done ? 'completed' : 'planned'}${f.note ? ` (${f.note})` : ''}`,
  );
  food.push('No seafood for the primary user; other party members may eat seafood');

  const refresh =
    status.label === 'No data'
      ? 'none yet'
      : `${fmtIso(status.at)} (${status.label}${state.live && status.label !== 'Manual' ? `, ${state.live.source}` : ''})`;

  const lines = [
    'TOKYO DISNEYLAND LIVE UPDATE',
    `Date: ${PARK.dateLabel.replace(/^\w+, /, '')}`,
    `Current time: ${fmtTime(now)}${state.timeOverride != null ? ' (simulated in app)' : ''}`,
    `Current land: ${state.land}`,
    `Last live refresh: ${refresh}`,
    '',
    'COMPLETED:',
    bullets(completed),
    '',
    'CURRENTLY:',
    bullets(currently, 'Not specified'),
    '',
    'RESERVATIONS:',
    bullets(reservations),
    '',
    'CURRENT WAITS:',
    bullets(waits, 'No wait data entered'),
    '',
    'NOT YET DONE:',
    bullets(notDone),
  ];
  if (skipped.length) lines.push('', 'SKIPPED:', bullets(skipped));
  lines.push(
    '',
    'FOOD:',
    bullets(food),
    '',
    'ENERGY:',
    state.energy[0].toUpperCase() + state.energy.slice(1),
    '',
    'HALLOWEEN PRIORITY:',
    state.halloween ? 'On' : 'Off',
    '',
    'APP SUGGESTS RIGHT NOW:',
    bullets([
      `Best: ${rec.best.title} — ${rec.best.urgency} (${rec.best.timeLabel})`,
      `Low-wait: ${rec.lowWait.title} — ${rec.lowWait.urgency} (${rec.lowWait.timeLabel})`,
      `Relaxed: ${rec.relaxed.title}`,
    ]),
    '',
    'NOTES:',
    state.notes.trim() || '(none)',
    '',
    'QUESTION FOR CHATGPT:',
    '“Update my itinerary from this current state.”',
  );
  return lines.join('\n');
}

export function exportJson(state: AppState): string {
  return JSON.stringify({ app: 'tdl-park-day', exportedAt: new Date().toISOString(), ...state }, null, 2);
}
