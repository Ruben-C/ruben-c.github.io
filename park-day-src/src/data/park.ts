// Everything the planner knows about the park on the visit day: hours, the
// attractions and how much they matter, restaurants, and walking times.

export type Land =
  | 'World Bazaar'
  | 'Adventureland'
  | 'Westernland'
  | 'Critter Country'
  | 'Fantasyland'
  | 'Tomorrowland'
  | 'Toontown';

export type Kind = 'ride' | 'walkthrough' | 'show' | 'parade' | 'fireworks';

/** How different the attraction is from the Anaheim version. */
export type Uniq = 'unique' | 'variation' | 'overlap';

export type ResType = 'DPA' | 'Entry Request' | 'Priority Pass' | 'Dining' | 'Other';

export interface Attraction {
  id: string;
  name: string;
  short: string;
  land: Land;
  kind: Kind;
  uniq: Uniq;
  /** 1–5, shown as dots. */
  uniqScore: number;
  /** Base planning weight; higher is more important. */
  priority: number;
  /** Minutes on the ride or at the show. */
  duration: number;
  typicalWait?: number;
  /** ThemeParks.wiki entity id, when the attraction is in the live feed. */
  tpId?: string;
  defaultResType?: ResType;
  badge?: string;
  note?: string;
  anaheimNote?: string;
  /** Shown in the Rides tab (shows and parades live in the Shows tab). */
  listInRides?: boolean;
  halloween?: boolean;
  /** Minutes after midnight for parades and fireworks. */
  fixedTime?: number;
  venue?: string;
  showtimes?: number[];
  targetTime?: number;
  arriveEarly?: number;
  indoor?: boolean;
  relaxed?: boolean;
}

/** Minutes after midnight. */
export const t = (h: number, m = 0) => h * 60 + m;

export const PARK = {
  date: '2026-10-08',
  dateLabel: 'Thursday, October 8, 2026',
  open: t(9),
  close: t(21),
  happyEntry: t(8, 45),
  arriveStart: t(8, 10),
  arriveEnd: t(8, 20),
  /** Tokyo Disneyland on ThemeParks.wiki. */
  themeparksParkId: '3cc919f1-d16d-43e0-8c3f-1dd269bd1a42',
} as const;

export const ATTRACTIONS: Attraction[] = [
  {
    id: 'bnb',
    name: 'Enchanted Tale of Beauty and the Beast',
    short: 'Beauty and the Beast',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 5,
    priority: 100,
    duration: 10,
    typicalWait: 75,
    tpId: 'e76670f0-9f5f-4918-8491-9bf51e73a596',
    defaultResType: 'DPA',
    badge: 'TOP PRIORITY',
    note: 'Use Disney Premier Access. Ride during your assigned window.',
    anaheimNote: 'No equivalent in Anaheim.',
    listInRides: true,
  },
  {
    id: 'frenzy',
    name: 'The Villains’ Halloween “Into the Frenzy”',
    short: 'Villains Halloween Parade',
    land: 'World Bazaar',
    kind: 'parade',
    uniq: 'unique',
    uniqScore: 5,
    priority: 95,
    duration: 45,
    halloween: true,
    fixedTime: t(16, 15),
    venue: 'Parade route',
    defaultResType: 'DPA',
    badge: 'MUST DO — HALLOWEEN',
    note: 'With DPA, arrive by your assigned admission time. Without DPA, claim a viewing spot 30–45 minutes early.',
    anaheimNote: 'Tokyo-only seasonal parade.',
  },
  {
    id: 'mmmw',
    name: 'Mickey’s Magical Music World',
    short: 'Mickey’s Magical Music World',
    land: 'Fantasyland',
    kind: 'show',
    uniq: 'unique',
    uniqScore: 5,
    priority: 90,
    duration: 25,
    arriveEarly: 15,
    showtimes: [t(11, 20), t(12, 45), t(14, 10), t(16, 15), t(17, 40)],
    venue: 'Fantasyland Forest Theatre',
    defaultResType: 'Entry Request',
    badge: 'HIGH PRIORITY',
    indoor: true,
    note: 'Entry Request in the Tokyo Disney Resort app (inside the park), or DPA.',
    anaheimNote: 'Tokyo-only stage show.',
  },
  {
    id: 'hm',
    name: 'Haunted Mansion “Holiday Nightmare”',
    short: 'Haunted Mansion',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 3,
    priority: 85,
    duration: 15,
    typicalWait: 45,
    halloween: true,
    tpId: '8fce6b54-e3e4-40bb-a574-93c8327c3fab',
    note: 'Target before lunch if the wait is about 45 min or less. Postpone if it’s over about 60.',
    anaheimNote: 'Similar overlay concept to Anaheim’s Haunted Mansion Holiday, with Tokyo’s own staging.',
    listInRides: true,
  },
  {
    id: 'pooh',
    name: 'Pooh’s Hunny Hunt',
    short: 'Pooh’s Hunny Hunt',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 5,
    priority: 80,
    duration: 5,
    typicalWait: 50,
    tpId: 'a88464b5-2cf5-4ef1-b38f-96e07b233bf2',
    badge: 'ROPE DROP',
    note: 'Recommended first ride at Happy Entry.',
    anaheimNote: 'Trackless ride system, nothing like Anaheim’s Pooh.',
    listInRides: true,
  },
  {
    id: 'dg4',
    name: 'The D-Groovationz4 Live',
    short: 'D-Groovationz4',
    land: 'Tomorrowland',
    kind: 'show',
    uniq: 'unique',
    uniqScore: 5,
    priority: 75,
    duration: 25,
    arriveEarly: 15,
    showtimes: [t(12, 20), t(13, 45), t(15, 10), t(17, 15), t(18, 40)],
    targetTime: t(15, 10),
    venue: 'Showbase',
    defaultResType: 'Entry Request',
    indoor: true,
    badge: 'NEW THIS SEASON',
    note: 'Entry Request in the app (inside the park) or DPA. Preferred: 3:10 PM.',
    anaheimNote: 'New Tokyo show, premiered Sept 30, 2026.',
  },
  {
    id: 'monsters',
    name: 'Monsters, Inc. Ride & Go Seek!',
    short: 'Monsters, Inc.',
    land: 'Tomorrowland',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 5,
    priority: 70,
    duration: 6,
    typicalWait: 40,
    tpId: '4ed6a812-df04-4aa8-acb9-c6b164dbb706',
    note: 'Interactive flashlight ride.',
    anaheimNote: 'Very different from Anaheim’s Monsters, Inc. ride.',
    listInRides: true,
  },
  {
    id: 'epd',
    name: 'Tokyo Disneyland Electrical Parade Dreamlights',
    short: 'Electrical Parade',
    land: 'World Bazaar',
    kind: 'parade',
    uniq: 'variation',
    uniqScore: 3,
    priority: 60,
    duration: 45,
    fixedTime: t(19, 15),
    venue: 'Parade route',
    badge: 'RECOMMENDED',
    note: 'Recommended, but ranked below the Tokyo-exclusive attractions.',
    anaheimNote: 'Related to Anaheim’s Main Street Electrical Parade; Tokyo’s own Dreamlights version.',
  },
  {
    id: 'nhh',
    name: 'Night High Halloween',
    short: 'Night High Halloween',
    land: 'World Bazaar',
    kind: 'fireworks',
    uniq: 'unique',
    uniqScore: 4,
    priority: 58,
    duration: 5,
    halloween: true,
    fixedTime: t(20, 30),
    venue: 'Park-wide',
    badge: 'HALLOWEEN PRIORITY',
    note: 'About 5 minutes. Visible park-wide, though some spots right in front of the castle are poor. May be cancelled for wind.',
    anaheimNote: 'Tokyo seasonal fireworks.',
  },
  {
    id: 'baymax',
    name: 'The Happy Ride with Baymax',
    short: 'Baymax',
    land: 'Tomorrowland',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 4,
    priority: 45,
    duration: 3,
    typicalWait: 35,
    tpId: 'ca00a0e8-f069-4d0a-9d5e-10cb63010956',
    anaheimNote: 'Not in Anaheim.',
    listInRides: true,
  },
  {
    id: 'stitch',
    name: 'Stitch Encounter',
    short: 'Stitch Encounter',
    land: 'Tomorrowland',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 3,
    priority: 32,
    duration: 15,
    typicalWait: 15,
    tpId: '05c7400b-866d-4d47-9cb1-8722fe6b22da',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Interactive show, Japanese-language.',
    listInRides: true,
  },
  {
    id: 'philharmagic',
    name: 'Mickey’s PhilharMagic',
    short: 'PhilharMagic',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 3,
    priority: 32,
    duration: 12,
    typicalWait: 15,
    tpId: '392ca2e8-afe0-4103-b296-c45bd373d036',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Not at the Disneyland Resort (also in Florida and Hong Kong).',
    listInRides: true,
  },
  {
    id: 'goofy',
    name: 'Goofy’s Paint ’n’ Play House',
    short: 'Goofy’s Paint ’n’ Play',
    land: 'Toontown',
    kind: 'ride',
    uniq: 'unique',
    uniqScore: 4,
    priority: 26,
    duration: 8,
    typicalWait: 20,
    tpId: '74f17654-ceb1-4f12-9c19-ce6ed0587f33',
    indoor: true,
    anaheimNote: 'Interactive paint game; Tokyo-only.',
    listInRides: true,
  },
  {
    id: 'tiki',
    name: 'The Enchanted Tiki Room: Stitch Presents “Aloha E Komo Mai!”',
    short: 'Tiki Room (Stitch)',
    land: 'Adventureland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 3,
    priority: 24,
    duration: 12,
    typicalWait: 10,
    tpId: '4f0b3416-0b0a-419b-ba8c-6ee00b7d7144',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Stitch version, unlike Anaheim’s classic show.',
    listInRides: true,
  },
  {
    id: 'countrybear',
    name: 'Country Bear Theater',
    short: 'Country Bear Theater',
    land: 'Westernland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 3,
    priority: 22,
    duration: 15,
    typicalWait: 10,
    tpId: '83f11a48-0d22-4429-8e59-43fd611d6795',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Gone from Anaheim since 2001.',
    listInRides: true,
  },
  {
    id: 'jungle',
    name: 'Jungle Cruise: Wildlife Expeditions',
    short: 'Jungle Cruise',
    land: 'Adventureland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 2,
    priority: 24,
    duration: 10,
    typicalWait: 25,
    tpId: 'e0887415-3da2-458c-8b88-0691e6b8ab63',
    anaheimNote: 'Same concept; Tokyo’s finale differs.',
    listInRides: true,
  },
  {
    id: 'wrr',
    name: 'Western River Railroad',
    short: 'Western River Railroad',
    land: 'Adventureland',
    kind: 'ride',
    uniq: 'variation',
    uniqScore: 2,
    priority: 20,
    duration: 15,
    typicalWait: 20,
    tpId: '6ee0697f-57ba-4c7b-8216-7c55b21288d4',
    relaxed: true,
    anaheimNote: 'Loop route, not a park circle like Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'cinderella',
    name: 'Cinderella’s Fairy Tale Hall',
    short: 'Cinderella’s Fairy Tale Hall',
    land: 'Fantasyland',
    kind: 'walkthrough',
    uniq: 'unique',
    uniqScore: 3,
    priority: 18,
    duration: 15,
    typicalWait: 15,
    tpId: 'f82709b6-51a3-4b65-8d6f-c2472f5053df',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Walk-through inside the castle.',
    listInRides: true,
  },
  {
    id: 'splash',
    name: 'Splash Mountain',
    short: 'Splash Mountain',
    land: 'Critter Country',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 2,
    priority: 22,
    duration: 10,
    typicalWait: 50,
    tpId: 'dfe25d8e-e234-4020-a261-30c6825d0680',
    anaheimNote: 'Same ride system as Anaheim’s Tiana’s Bayou Adventure; Tokyo still runs the original theme.',
    listInRides: true,
  },
  {
    id: 'bigthunder',
    name: 'Big Thunder Mountain',
    short: 'Big Thunder',
    land: 'Westernland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 18,
    duration: 5,
    typicalWait: 45,
    tpId: 'e3577b4a-f1d9-4ec5-aacf-b99977ea88c9',
    anaheimNote: 'Very similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'startours',
    name: 'Star Tours: The Adventures Continue',
    short: 'Star Tours',
    land: 'Tomorrowland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 15,
    duration: 7,
    typicalWait: 25,
    tpId: '512fd34c-2f0a-4e0a-bcc1-ef4d15c5f803',
    anaheimNote: 'Same ride as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'pirates',
    name: 'Pirates of the Caribbean',
    short: 'Pirates',
    land: 'Adventureland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 15,
    duration: 15,
    typicalWait: 15,
    tpId: '52eb0fc9-5853-49c8-8c72-1e5e83aae1c1',
    indoor: true,
    anaheimNote: 'Very similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'peterpan',
    name: 'Peter Pan’s Flight',
    short: 'Peter Pan',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 12,
    duration: 3,
    typicalWait: 35,
    tpId: 'e541ad8f-1457-469a-8f35-457555f475ad',
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'smallworld',
    name: '“it’s a small world”',
    short: 'it’s a small world',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 12,
    duration: 10,
    typicalWait: 15,
    tpId: '0de1b543-46fd-4c3f-81c8-31d0cab9ef63',
    indoor: true,
    relaxed: true,
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'snowwhite',
    name: 'Snow White’s Adventures',
    short: 'Snow White',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 10,
    duration: 3,
    typicalWait: 20,
    tpId: 'a853aadd-2337-435a-b0a3-2c03db96e5e1',
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'pinocchio',
    name: 'Pinocchio’s Daring Journey',
    short: 'Pinocchio',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 10,
    duration: 3,
    typicalWait: 15,
    tpId: '6922377e-0ff4-481f-9da3-35051938732a',
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'rogerrabbit',
    name: 'Roger Rabbit’s Car Toon Spin',
    short: 'Roger Rabbit',
    land: 'Toontown',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 10,
    duration: 4,
    typicalWait: 30,
    tpId: '73384e33-a86a-4601-996f-61dbffba6ec2',
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'gadget',
    name: 'Gadget’s Go Coaster',
    short: 'Gadget’s Go Coaster',
    land: 'Toontown',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 8,
    duration: 2,
    typicalWait: 25,
    tpId: '52c5e406-67e2-4d37-aee8-987644d87b63',
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'alice',
    name: 'Alice’s Tea Party',
    short: 'Alice’s Tea Party',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 6,
    duration: 2,
    typicalWait: 15,
    tpId: 'cfaa7d1c-111e-49b9-b21b-134eac4000e8',
    anaheimNote: 'Same as Anaheim’s teacups.',
    listInRides: true,
  },
  {
    id: 'carrousel',
    name: 'Castle Carrousel',
    short: 'Castle Carrousel',
    land: 'Fantasyland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 5,
    duration: 3,
    typicalWait: 10,
    tpId: '1fb05b7d-953a-4fa7-b7ed-db2eb62b85bf',
    anaheimNote: 'Same as Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'marktwain',
    name: 'Mark Twain Riverboat',
    short: 'Mark Twain Riverboat',
    land: 'Westernland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 8,
    duration: 15,
    typicalWait: 10,
    tpId: '02a96ff7-da13-48b5-b1a8-f29d9f6109fc',
    relaxed: true,
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'canoes',
    name: 'Beaver Brothers Explorer Canoes',
    short: 'Explorer Canoes',
    land: 'Critter Country',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 5,
    duration: 12,
    typicalWait: 15,
    tpId: '037a13bf-b06e-4902-aa12-02d758d1718d',
    anaheimNote: 'Similar to Anaheim’s canoes.',
    listInRides: true,
  },
  {
    id: 'rafts',
    name: 'Tom Sawyer Island Rafts',
    short: 'Tom Sawyer Island',
    land: 'Westernland',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 4,
    duration: 30,
    typicalWait: 10,
    tpId: '077c390c-c214-40c4-83e9-93d8f8621141',
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'minnie',
    name: 'Minnie’s House',
    short: 'Minnie’s House',
    land: 'Toontown',
    kind: 'walkthrough',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 4,
    duration: 10,
    typicalWait: 15,
    tpId: '534ca90a-2626-4a45-9b7b-1964ed15678e',
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'chipdale',
    name: 'Chip ’n Dale’s Treehouse',
    short: 'Chip ’n Dale’s Treehouse',
    land: 'Toontown',
    kind: 'walkthrough',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 3,
    duration: 5,
    typicalWait: 5,
    tpId: 'a0a63e1c-3fc6-4433-b9b1-f5e798ab1f00',
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'donaldboat',
    name: 'Donald’s Boat',
    short: 'Donald’s Boat',
    land: 'Toontown',
    kind: 'walkthrough',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 3,
    duration: 5,
    typicalWait: 5,
    tpId: '2d215a6d-77a2-4c44-a2e3-c293c1289876',
    anaheimNote: 'Similar to Anaheim’s.',
    listInRides: true,
  },
  {
    id: 'swiss',
    name: 'Swiss Family Treehouse',
    short: 'Swiss Family Treehouse',
    land: 'Adventureland',
    kind: 'walkthrough',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 3,
    duration: 10,
    typicalWait: 5,
    tpId: 'f9321bc7-aa96-4a70-b963-681482384d1b',
    anaheimNote: 'Similar to Anaheim’s treehouse.',
    listInRides: true,
  },
  {
    id: 'omnibus',
    name: 'Omnibus',
    short: 'Omnibus',
    land: 'World Bazaar',
    kind: 'ride',
    uniq: 'overlap',
    uniqScore: 1,
    priority: 5,
    duration: 10,
    typicalWait: 10,
    tpId: 'cf1e721e-ba51-4e48-a2bc-b07883091e88',
    relaxed: true,
    anaheimNote: 'Similar to Anaheim’s Main Street vehicles.',
    listInRides: true,
  },
];

export const BY_ID: Record<string, Attraction> = Object.fromEntries(ATTRACTIONS.map((a) => [a.id, a]));
export const BY_TP_ID: Record<string, Attraction> = Object.fromEntries(
  ATTRACTIONS.filter((a) => a.tpId).map((a) => [a.tpId as string, a]),
);
export const RIDE_LIST = ATTRACTIONS.filter((a) => a.listInRides);
/** The Shows tab, in display order. */
export const SHOWS = ['mmmw', 'dg4', 'frenzy', 'epd', 'nhh'].map((id) => BY_ID[id]);
/** Seated indoor attractions offered as a break on the Shows tab. */
export const INDOOR_SHOWS = ['philharmagic', 'tiki', 'countrybear', 'stitch'].map((id) => BY_ID[id]);
/** The must-dos, in the order they are reported. Also the items that start out "planned". */
export const KEY_IDS = ['bnb', 'frenzy', 'mmmw', 'hm', 'pooh', 'dg4', 'monsters', 'epd', 'nhh'];

export interface EntryAction {
  id: string;
  label: string;
  detail: string;
}

/** Things to do in the official app right after entering the park. */
export const ENTRY_ACTIONS: EntryAction[] = [
  {
    id: 'dpa-bnb',
    label: 'Buy Disney Premier Access for Beauty and the Beast',
    detail: 'Enter the return window in the Rides tab once you have it.',
  },
  {
    id: 'er-mmmw',
    label: 'Make an Entry Request for Mickey’s Magical Music World',
    detail: 'Pick the showtime you get in the Shows tab.',
  },
  { id: 'er-dg4', label: 'Make an Entry Request for The D-Groovationz4 Live', detail: 'Aim for the 3:10 PM show.' },
  {
    id: 'dpa-frenzy',
    label: 'Consider DPA for The Villains’ Halloween “Into the Frenzy”',
    detail: 'Guaranteed viewing. Without it, plan to hold a spot from about 3:30 PM.',
  },
];

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

const NAME_ALIASES: Record<string, string> = {
  beautyandthebeast: 'bnb',
  bnb: 'bnb',
  hauntedmansion: 'hm',
  pooh: 'pooh',
  poohshunnyhunt: 'pooh',
  monstersinc: 'monsters',
  monsters: 'monsters',
  bigthunder: 'bigthunder',
  startours: 'startours',
  splash: 'splash',
  pirates: 'pirates',
  baymax: 'baymax',
  peterpan: 'peterpan',
  smallworld: 'smallworld',
  mmmw: 'mmmw',
  mickeysmagicalmusicworld: 'mmmw',
  dgroovationz4: 'dg4',
  dg4: 'dg4',
};

/** Finds an attraction from a free-text name (feed names, pasted lists, nicknames). */
export function matchAttraction(raw: string): Attraction | undefined {
  const key = normalizeName(raw);
  if (!key) return undefined;
  const exact = ATTRACTIONS.find(
    (a) => normalizeName(a.name) === key || normalizeName(a.short) === key || a.id === key,
  );
  if (exact) return exact;
  if (NAME_ALIASES[key]) return BY_ID[NAME_ALIASES[key]];
  return ATTRACTIONS.find(
    (a) => key.length >= 5 && (normalizeName(a.name).includes(key) || key.includes(normalizeName(a.short))),
  );
}

export interface Restaurant {
  id: string;
  /** Id on tokyodisneyresort.jp, used for the menu and info links. */
  tdrId: number;
  name: string;
  land: Land;
  style: 'Buffet-style' | 'Counter service' | 'Table service' | 'Snack';
  noSeafoodPick: string;
  note?: string;
  closed?: string;
  priority?: boolean;
  halloween?: boolean;
}

const TDR_RESTAURANTS = 'https://www.tokyodisneyresort.jp/en/tdl/restaurant';
export const menuUrl = (r: Restaurant) => `${TDR_RESTAURANTS}/food/${r.tdrId}/`;
export const infoUrl = (r: Restaurant) => `${TDR_RESTAURANTS}/detail/${r.tdrId}/`;

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'queenofhearts',
    tdrId: 349,
    name: 'Queen of Hearts Banquet Hall',
    land: 'Fantasyland',
    style: 'Buffet-style',
    noSeafoodPick: 'Roast beef or chicken plates',
    note: 'Pick items cafeteria-style. Close to Pooh, Haunted Mansion and Mickey’s show.',
  },
  {
    id: 'grandmasara',
    tdrId: 344,
    name: 'Grandma Sara’s Kitchen',
    land: 'Critter Country',
    style: 'Counter service',
    noSeafoodPick: 'Omelet rice or hamburger-steak style plates',
    note: 'Indoor seating, usually calmer.',
  },
  {
    id: 'hungrybear',
    tdrId: 338,
    name: 'Hungry Bear Restaurant',
    land: 'Westernland',
    style: 'Counter service',
    noSeafoodPick: 'Beef or pork curry',
    note: 'Fast; good before parade viewing on the Westernland side.',
  },
  {
    id: 'pangalactic',
    tdrId: 353,
    name: 'Pan Galactic Pizza Port',
    land: 'Tomorrowland',
    style: 'Counter service',
    noSeafoodPick: 'Salami pizza or chicken calzone',
    note: 'Next to Showbase for D-Groovationz4.',
  },
  {
    id: 'tlterrace',
    tdrId: 357,
    name: 'Tomorrowland Terrace',
    land: 'Tomorrowland',
    style: 'Counter service',
    noSeafoodPick: 'Beef burger or chicken set',
    note: 'Some sets use shrimp; the burger sets usually don’t.',
  },
  {
    id: 'plazapavilion',
    tdrId: 335,
    name: 'Plaza Pavilion Restaurant',
    land: 'Westernland',
    style: 'Counter service',
    noSeafoodPick: 'Meat-based Western-style plates',
    note: 'Near the castle hub.',
    closed: 'Closed until Nov 1',
  },
  {
    id: 'cowboycookhouse',
    tdrId: 499,
    name: 'Cowboy Cookhouse',
    land: 'Westernland',
    style: 'Counter service',
    noSeafoodPick: 'Smoked turkey leg',
    note: 'Quick bite; Mobile Order in the app.',
  },
  {
    id: 'eastside',
    tdrId: 300,
    name: 'Eastside Cafe',
    land: 'World Bazaar',
    style: 'Table service',
    noSeafoodPick: 'Meat pasta or meat main course',
    note: 'Priority Seating recommended.',
    priority: true,
  },
  {
    id: 'hokusai',
    tdrId: 313,
    name: 'Restaurant Hokusai',
    land: 'World Bazaar',
    style: 'Table service',
    noSeafoodPick: 'Chicken or pork set',
    note: 'Tempura sets often include shrimp. Order the meat sets for the primary guest.',
    priority: true,
  },
  {
    id: 'bluebayou',
    tdrId: 318,
    name: 'Blue Bayou Restaurant',
    land: 'Adventureland',
    style: 'Table service',
    noSeafoodPick: 'Beef or chicken course',
    note: 'Priority Seating recommended.',
    priority: true,
  },
  {
    id: 'hueydewey',
    tdrId: 362,
    name: 'Huey, Dewey and Louie’s Good Time Cafe',
    land: 'Toontown',
    style: 'Counter service',
    noSeafoodPick: 'Pizza or chicken sandwich',
  },
  {
    id: 'sweetheart',
    tdrId: 316,
    name: 'Sweetheart Cafe',
    land: 'World Bazaar',
    style: 'Snack',
    noSeafoodPick: 'Halloween special sandwich',
    note: 'Seasonal sandwich this Halloween.',
    halloween: true,
  },
  {
    id: 'refreshment',
    tdrId: 303,
    name: 'Refreshment Corner',
    land: 'World Bazaar',
    style: 'Snack',
    noSeafoodPick: 'Purple Halloween hot dog',
    note: 'Seasonal Halloween item.',
    halloween: true,
  },
];

export const findRestaurant = (name: string) =>
  RESTAURANTS.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());

export interface Extra {
  id: string;
  name: string;
  land: Land;
  kind: 'merch' | 'photo' | 'food';
  detail: string;
}

/** Seasonal things to do that are not attractions. */
export const EXTRAS: Extra[] = [
  {
    id: 'hw-merch',
    name: 'Villains Halloween merchandise',
    land: 'World Bazaar',
    kind: 'merch',
    detail: 'Parade-themed wearables and goods in the World Bazaar shops.',
  },
  {
    id: 'hw-photo-entrance',
    name: 'Halloween photo spots: park entrance',
    land: 'World Bazaar',
    kind: 'photo',
    detail: 'New for 2026 at the entrance area.',
  },
  {
    id: 'hw-photo-toontown',
    name: 'Halloween photo spots: Toontown',
    land: 'Toontown',
    kind: 'photo',
    detail: 'New for 2026 in Toontown.',
  },
  {
    id: 'hw-churro',
    name: 'Maple pumpkin churro',
    land: 'World Bazaar',
    kind: 'food',
    detail: 'Seasonal churro at several wagons around the park.',
  },
];

export const LANDS: Land[] = [
  'World Bazaar',
  'Adventureland',
  'Westernland',
  'Critter Country',
  'Fantasyland',
  'Tomorrowland',
  'Toontown',
];

/** Rough walking minutes between lands. */
const WALK_PAIRS: [Land, Land, number][] = [
  ['World Bazaar', 'Adventureland', 4],
  ['World Bazaar', 'Westernland', 7],
  ['World Bazaar', 'Critter Country', 11],
  ['World Bazaar', 'Fantasyland', 6],
  ['World Bazaar', 'Tomorrowland', 4],
  ['World Bazaar', 'Toontown', 10],
  ['Adventureland', 'Westernland', 4],
  ['Adventureland', 'Critter Country', 8],
  ['Adventureland', 'Fantasyland', 7],
  ['Adventureland', 'Tomorrowland', 8],
  ['Adventureland', 'Toontown', 13],
  ['Westernland', 'Critter Country', 4],
  ['Westernland', 'Fantasyland', 6],
  ['Westernland', 'Tomorrowland', 10],
  ['Westernland', 'Toontown', 12],
  ['Critter Country', 'Fantasyland', 8],
  ['Critter Country', 'Tomorrowland', 14],
  ['Critter Country', 'Toontown', 15],
  ['Fantasyland', 'Tomorrowland', 6],
  ['Fantasyland', 'Toontown', 6],
  ['Tomorrowland', 'Toontown', 7],
];

const WALK = new Map<string, number>();
for (const [a, b, minutes] of WALK_PAIRS) {
  WALK.set(`${a}|${b}`, minutes);
  WALK.set(`${b}|${a}`, minutes);
}

/** Walking minutes between two lands; 2 within a land. */
export function walkMinutes(from: string, to: string): number {
  return from === to ? 2 : (WALK.get(`${from}|${to}`) ?? 8);
}
