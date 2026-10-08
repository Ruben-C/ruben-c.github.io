# Park Day (source)

Source for the Tokyo Disneyland Park Day planner published at
<https://ruben-c.github.io/park-day/>. The site is a static build of this
project; GitHub Pages serves the committed `../park-day/` folder as-is.

## Build and deploy

```sh
cd park-day-src
npm install
npm run build        # type-checks, then writes the site into ../park-day/
```

Commit the regenerated `park-day/` folder together with the source change and
push to `main`. GitHub Pages picks it up within a minute or two.

`npm run dev` starts a local dev server; `npm run preview` serves the last
build. The service worker is only registered over https, so offline behaviour
is best checked on the deployed site.

Every build renames the hashed `assets/*` files and stamps a new cache name
into `sw.js`, so phones that already installed the app drop the old cache on
their next visit.

## Layout

| Path | What it holds |
| --- | --- |
| `src/data/park.ts` | The visit day: hours, attractions with priorities and ThemeParks.wiki ids, restaurants, seasonal extras, walking times |
| `src/lib/live.ts` | Fetching and parsing live waits (ThemeParks.wiki, pasted JSON, simple lists, demo data) |
| `src/lib/state.ts` | The persisted day state, `waitFor()` (manual vs. feed precedence) and the freshness label |
| `src/lib/planner.ts` | Commitments, ride scoring and the three NOW suggestions |
| `src/lib/timeline.ts` | The TIMELINE tab's fixed and flexible blocks |
| `src/lib/export.ts` | The ChatGPT recap and the JSON backup |
| `src/components/` | One file per tab, plus the shared chips, icons and the attraction detail sheet |
| `src/sw.js` | Service worker template; `vite.config.ts` fills in the precache list and version |
| `public/` | Icons, manifest and `sample-live.json` (a ThemeParks.wiki response marked DEMO, for the paste box) |

Colours are CSS variables in `src/index.css` and are exposed as Tailwind
utilities by `tailwind.config.js`, which also makes opacity modifiers such as
`bg-card/95` work on variables (they emit `color-mix()`).

## Live data

Waits come from ThemeParks.wiki (unofficial; Tokyo Disney Resort has no public
API). The app refreshes on open, whenever it returns to the foreground with
data older than two minutes, and every five minutes while visible. Demo or
pasted data is never replaced automatically.

Optional build-time settings, read from a `.env` file in this folder:

| Variable | Meaning |
| --- | --- |
| `VITE_LIVE_ENDPOINT` | A same-origin proxy URL to try first (off by default) |
| `VITE_DIRECT_THEMEPARKS` | Set to `false` to stop calling ThemeParks.wiki from the browser |
| `VITE_THEMEPARKS_BASE` | Alternative API base, default `https://api.themeparks.wiki/v1` |
