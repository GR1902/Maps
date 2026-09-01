# Norwich City Scouting Map — Matchday Explorer

A Leaflet-based tool for planning European scouting trips: league/matchday
fixture browsing plus point-to-point route planning. Norwich City brand
colors used as accents (canary yellow `#FFF200` / green `#00622F`) on a
clean, flat, white/neutral-gray UI — Inter as the typeface throughout, and
a small inline-SVG icon set (`ICONS` in `js/spieltag-explorer.js`, mirrored
in `index.html`'s static markup) in place of emoji for buttons and section
headers. A few plain glyphs (☆★ for favoriting, ✕ for close, ‹› for the
trip carousel) are kept deliberately — they're simple monochrome symbols,
not colorful emoji, and match the same clean-lines aesthetic.

## Project structure

```
norwich-scouting-map/
├── index.html                 The Matchday Explorer
├── css/
│   ├── variables.css          Shared design tokens (colors)
│   └── spieltag-explorer.css  Page styles
├── js/
│   └── spieltag-explorer.js   App logic (fetches data/teams.json + data/fixtures.json)
├── data/
│   ├── teams.json             699 club/venue records, keyed by league → team code
│   ├── fixtures.json          3094 fixtures, keyed by league, with matchday numbers
│   ├── airports.json          ~60 major European airports (name, IATA, city, lat/lng)
│   └── leagues.json           Competition logo URL per league code (see below)
├── build_standalone.py        Builds dist/matchday-explorer-standalone.html (see below)
├── fetch_logos.py             Fills in data/teams.json's "logo" field via Wikipedia (see below)
└── fetch_league_logos.py      Fills in data/leagues.json's competition logos via Wikipedia (see below)
```

Leaflet + Leaflet Routing Machine are loaded via CDN. Everything else is
local.

> An earlier prototype ("Europa-Ligen-Karte", a static club map without
> matchday filtering) was dropped — the Matchday Explorer covers the same
> point-to-point routing plus league/matchday filtering and cross-league trip
> clustering on top, so it fully supersedes it.

## Running locally

The page loads its data via `fetch()`, which requires an HTTP server —
opening `index.html` directly (`file://`) will not work. From the project
root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Sharing with people who can't run a local server

Run `python3 build_standalone.py` to produce
`dist/matchday-explorer-standalone.html` — a single self-contained file with
the CSS, JS, and current contents of `data/*.json` all inlined. No fetch to
local files, so it opens directly by double-clicking, no server needed; just
send that one file. It still loads Leaflet/Leaflet Routing Machine from CDN
and calls the OSRM routing API live, so an internet connection is still
required. It's a snapshot — re-run the build script after changing
`data/*.json`, the CSS, `js/spieltag-explorer.js`, or `index.html`'s markup
to refresh it; `dist/` isn't tracked in git.

## Features
- The side panel is collapsible on two levels: each section (My Plan, a
  league's fixture list, Combinable Trips) collapses independently via its
  header's chevron, and the panel itself can be tucked away entirely — the
  narrow ‹ › tab on the map/panel border — so the map can use the full
  width. Neither is persisted across reloads or touched by "Reset filters";
  they're layout, not a filter
- League picker (multi-select checkbox panel, 33 leagues: 29 domestic
  leagues across 16 countries plus 4 UEFA club competitions — Champions
  League, Europa League, Conference League, Youth League) — each selected league gets its
  own matchday dropdown by default, since leagues don't share a common
  calendar or matchday numbering. A club playing in two selected
  competitions at once (e.g. a domestic fixture and a Champions League
  fixture the same window) gets a single marker with a pageable "1 / 2 ‹ ›"
  popup instead of two overlapping ones — see "UEFA club competitions"
  below. A "By matchday" / "By date range" toggle at the top of the picker
  switches every selected league at once to a single global **date range**
  instead — every selected league then shows *all* its home fixtures whose
  kickoff falls inside that From/To window, spanning as many matchdays as
  the range covers, instead of one chosen matchday each (each league's
  fixture-list header shows the date range in place of the matchday
  dropdown while this mode is active). Defaults to today+14 days the first
  time it's switched on, then stays exactly as edited. Combines for free
  with Combinable Trips' own candidate-pool date range below — that range
  auto-derives from whatever's currently anchored, so a wide date-range
  selection here naturally widens it too, the same way a matchday selection
  already did
- Shows every selected league's home fixtures highlighted (own color per
  league); other clubs of the same league in a pale shade; unselected
  leagues' clubs in muted grey
- "↺ Reset filters" (top control bar): puts leagues/matchdays, the airports
  layer, the cross-border toggle, any single-game trip focus, and the
  radius search all back to their defaults in one click. Deliberately
  leaves route planning and the "My Plan" watchlist alone — those are
  content you built on purpose, not a filter, and already have their own
  Clear/rename/delete controls
- Club crests on this-matchday markers (hotlinked from Wikipedia, fetched
  per club by `data/teams.json`'s `logo` field — see below); falls back to
  the plain colored marker if a club has no crest on file or the image
  fails to load
- Competition logos (`data/leagues.json`, all 29 leagues) next to each
  league in the picker checklist and at the top of that league's fixture
  block in the side panel; falls back to the plain color swatch/dot if a
  logo is missing or fails to load
- "✈️ Airports" toggle (top control bar): overlays ~60 major European
  airports (`data/airports.json`) as a reference layer, independent of the
  league/matchday filters — handy for judging how reachable a fixture
  cluster is by air, not just by road. Off by default; click the button to
  show/hide, click a plane marker for the airport name, IATA code, city, and
  a "🏁 Set as start point" button (see route planning below)
- Radius search ("📍 Radius Search" in the top control bar, opens as a
  dropdown like the league picker): enter an address, or click "📍 Pick point
  on map" and click anywhere on the map instead — either way, see every home
  fixture within a radius of that point, across *all* 33 leagues and every
  matchday currently loaded, independent of which leagues are toggled on in
  the picker, since "what's near this point" is a different question from
  "what am I currently browsing". The radius is a continuous slider (5–500
  km, 5 km steps) — drag it or scroll over it and results re-filter live
  against the already-geocoded point, no "Search" click needed (Search is
  only for the initial address lookup). Draws the search circle, drops a
  club-crest marker per match (same crest badge as the main fixture
  markers, with the same colored-swatch fallback), and both the map markers
  and each result row in the list show the crest; each result also supports
  "+ Add to route" like any other marker. A "🏁 Use as route start" button
  turns the searched/picked center point itself into the route's origin
  (see route planning below). Geocoding (forward and reverse) via
  OpenStreetMap's free Nominatim API (same data source as the map tiles and
  OSRM routing already used elsewhere)
- "Combinable trips" panel: for the selected league + matchday's home
  fixtures ("anchors"), finds realistic multi-stop trips — where every leg
  is checked against actual driving time (see below), not just distance.
  Sorted most-effective-first: the most games, and among trips with the
  same number of games, the fewest total driving km. A visible **From/To
  date range** controls which calendar dates the candidate pool is allowed
  to draw connecting legs from — auto-filled from the actual date span of
  the currently selected anchors (padded a couple of days either side) any
  time it's empty or no longer overlaps the anchors at all (e.g. after
  switching to a league whose matchday falls on completely different
  dates), so it recognizes when a fresh default is needed instead of
  silently reusing an unrelated leftover range; edit it directly (or hit
  "Auto" to snap back to the anchors' own span) to keep old or unwanted
  matchdays from a densely-scheduled league (e.g. Championship/League One,
  full season loaded) from flowing in uninvited. The anchors themselves are
  always kept regardless of the range, same as the weekday/country filters
  below. Each game shown on a trip card also has a small "×" to exclude
  just that one fixture from Combinable Trips entirely (works even on an
  anchor) — an "N game(s) excluded — Clear" bar appears above the carousel
  once anything's excluded, and "Reset filters" clears it too. A "Days" bar
  (Mo–Su) controls which weekdays are eligible to be chained into a trip at
  all —
  e.g. turn off Mon–Thu to only ever see Fri/Sat/Sun trips; the anchor
  game(s) are always kept regardless of this filter, since they're what
  the trip is built around, not a candidate to exclude. By default only
  same-country trips are shown — "same-country" meaning the countries of
  your *currently selected* anchor leagues, so e.g. selecting two
  same-country leagues (Pro League + Challenger Pro League, both Belgium)
  never needs the toggle just to combine those two; a "🌍 Include
  cross-border trips" toggle above the list opts in to also letting legs
  reach into a country outside that set. This restricts the candidate pool
  itself before the routing request, not just which already-computed
  trips are displayed (toggling it re-runs the OSRM lookup) — a
  display-only filter turned out to hide valid same-country trips too
  whenever the single longest chain for a given anchor happened to pad
  itself with a foreign leg, since only one (the longest) candidate chain
  is ever kept per anchor. Shown as
  a swipeable/scrollable carousel — one trip card at a time by default,
  with a position readout ("2 / 7") and ‹ › buttons — instead of a long
  vertical list; a "Scroll view" toggle next to the position readout flips
  it into several narrower cards visible side by side instead, for
  comparing trips at a glance rather than one at a time ("Swipe view" to
  flip back); **clicking a trip card also loads it as your active route** (see
  route planning below), so the map immediately shows the real driving
  line, not just a bounding-box zoom. A "🔀 Suggest trip" button on any
  single fixture (list row, radius result, marker popup, or Calendar row)
  pins the panel to trip suggestions built around just that one game,
  independent of whatever leagues/matchdays are currently toggled on. A
  "🔀 Suggest trips for My Plan" button in the watchlist toolbar does the
  same but anchored on *every* game currently in your active My Plan at
  once — useful once you've starred several games — though a trip is still
  only ever built within the currently-enabled weekday window per anchor,
  so a plan spanning several weeks produces multiple separate short trip
  clusters, not one long multi-week itinerary. Either kind of focus clears
  via "✕ Show all trips"
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time). The button itself toggles:
  once a fixture's on the route, the same button reads "✓ Remove from
  route" (and turns red-bordered) — click it again to take that stop back
  off without having to find it in the route panel; stops and the running
  distance/time summary live under "🚗 Plan Route" in the top control bar,
  same dropdown pattern as the league picker and radius search. Stops are
  always ordered chronologically by kickoff time — the only sensible order
  when games have fixed start times — and each leg between consecutive
  stops shows its own driving time/distance (fetched the same way as
  Combinable Trips' per-leg breakdown), not just the trip total. Optionally
  set a 🏁 start point — from an airport's popup or the radius search's
  "Use as route start" — so the route is driven from that origin (e.g. the
  airport you're flying into) instead of starting at the first added
  fixture; only one start point at a time, shown ahead of the numbered
  stops and removable on its own without clearing the whole route. Every
  fixture currently on the route is also marked directly on the map and in
  every list it appears in (fixture list, radius search results) — its
  marker gets a small gold numbered badge matching its position in the
  route panel, plus a gold ring around the marker itself, and its list
  row(s) get a matching gold left-border highlight — so it's clear at a
  glance which games are already in the route without having to open the
  route panel or a popup. Updates live as stops are added/removed/cleared,
  without needing a full re-render of the map
- "⭐ My Plan" watchlist (top of the side panel) — separate from the route
  planner: this is for marking games you want to see, not for building a
  drivable itinerary. Add a fixture by clicking its ☆ (fixture list, radius
  results, or marker popup) or by dragging it into the panel; drag rows
  within the panel to reorder — order = priority, shown as a rank number,
  **and, once there are 2+ games, also the order driving time/distance is
  computed against**: a driving-time/distance line appears between each
  consecutive pair (fetched from OSRM, same as route planning's per-leg
  breakdown), plus a total ("≈ X km · Y hr Z min total driving") once
  everything's settled — unlike the route planner, which always forces
  chronological order by kickoff time, My Plan keeps whatever manual order
  you last dragged it into, and re-fetches the distances for that exact
  order every time you reorder, add, or remove a game.
  **Multiple named plans**: the dropdown at the top of the panel switches
  between plans (e.g. one per scout/person), with buttons to rename, create,
  or delete a plan (the last remaining plan can't be deleted — rename it
  instead). Everything's persisted in the browser's `localStorage`, so it
  survives reloads (but is local to one browser/device — there's no account
  or sync between devices)
- "📅 Calendar" (top control bar): a full-screen **month view** over the
  map area — header/controls bar stays visible and usable — for the
  currently *selected* leagues, bounded by a **From/To date range** (a
  ‹month year› header navigates month-to-month independently of that
  range; days outside the range render but aren't clickable). Each day
  with fixtures shows a count badge and, directly in the tile, up to 3
  abbreviated matchups (e.g. "Arsenal–Coventry", "+2 more" if there are
  more) so you can read what's on at a glance without hovering or
  clicking — tiles size to fit this (no longer a fixed square).
  **Hovering a day still previews the full list** (time + matchup, up to
  6) in a tooltip; clicking opens the full list below the grid — this
  doubles as search-by-date, since setting the range **is** the
  filter. A day is auto-selected when you open the Calendar or change
  month (today if it has games, else the first day that does), so the
  list below the grid is never empty by default. There's a "Today"
  shortcut (resets to the current month and a 30-day range). Each row in
  the day list has the same
  ☆ star as everywhere else to add it to My Plan, and clicking a row jumps
  back to the map, switches that league to the right matchday, and centers
  on the fixture. Deliberately an in-app overlay rather than a real second
  page/URL, so it shares all in-memory state (loaded data, league
  selection, plan) instead of duplicating it

### How "Combinable Trips" works

A trip is a chronological sequence of home fixtures where every consecutive
leg is individually feasible: you can leave the earlier match after
full-time and reach the next stadium with time to spare before kickoff.

- **Full-time** is assumed 2 hours after kickoff (`POST_MATCH_BUFFER_MIN`).
- You need to arrive at least 15 minutes before the next kickoff
  (`PRE_MATCH_BUFFER_MIN`).
- So a leg is feasible if `real driving time ≤ (next kickoff − 15 min) −
  (this kickoff + 2h)` **and** the driving distance is at most 600 km
  (`MAX_LEG_KM`) — plenty of schedule slack doesn't make an 800 km overnight
  drive "combinable". Driving time and distance both come from a single
  batched request per render to OSRM's public `table` service
  (`js/spieltag-explorer.js` → `fetchDurationMatrix`) — not straight-line
  distance.
- Every combinable trip shown must include at least one fixture from the
  currently selected league + matchday (the "★" marked entries); the other
  legs can come from any league or country, on any matchday, as long as the
  timing and distance work.
- Only games on a weekday enabled in the "Days" bar (Mo–Su, all on by
  default) are eligible to be chained in — anchors are always kept
  regardless. A fixed, generous 9-day span cap (`MAX_TRIP_SPAN_H`) is a
  separate internal safety net on top of that, so legs don't chain into an
  unrealistic multi-week itinerary just because each individual hop was
  technically drive-feasible; it's not user-facing since the weekday
  picker is the actual semantic control (an earlier version exposed a
  plain "N days" slider instead, but that turned out to be ambiguous —
  which weekdays "3 days" covers depends on where the anchor happens to
  fall, so it wasn't something you could actually target, e.g. "only ever
  suggest weekend trips").
- Legs where OSRM can't find a road route at all (e.g. islands reachable
  only by ferry) are treated as infeasible and excluded.

This means the routing service is called live every time you change league
or matchday — same public OSRM demo server already used for the point-to-
point route panel, so the same "not for heavy production use" caveat
applies (see console warning). If it's ever unavailable, the panel shows an
error instead of silently falling back to straight-line guesses.

## UEFA club competitions

Champions League, Europa League, and Conference League are league codes
`champions_league`, `europa_league`, `conference_league` like any other —
added 2026-08-13, currently covering only the **play-off round** (the last
qualifying round before the League Phase), since that's what UEFA had
actually scheduled at the time. Officially announced League Phase MD1
windows (no fixtures yet — participants aren't decided until the play-off
round finishes): Champions League 8–10 Sep 2026, Europa League 16–17 Sep
2026, Conference League 15 Oct 2026. The **weekly scheduled routine** (see
below) picks these up automatically once UEFA publishes them — no separate
routine was needed, since it already re-checks every league it finds in
`data/fixtures.json` generically.

A club that's also in one of the 29 domestic leagues (about 55 of the 84
play-off clubs are, e.g. Celtic, Ajax, Benfica, Rangers) keeps the **exact
same team code, name, city, and stadium coordinates** in its competition
entry — deliberately not a fresh, duplicate record — specifically so that
when the same club has both a domestic fixture and a UEFA fixture visible
at once, the app's marker-merging (grouped by venue coordinate — see
`renderAll()`'s `venueGroups` in `js/spieltag-explorer.js`) puts them on
**one marker with a pageable "1 / 2 ‹ ›" popup** instead of two markers
sitting on top of each other. Genuinely new clubs (the other ~29) get a
fresh entry the normal way (city-level lat/lng, Wikipedia crest where
found). Each competition team record also carries an explicit `"country"`
field — unlike a domestic league, a single UEFA competition spans dozens of
countries, so there's no one `COUNTRY_TAG` to give the whole league (used
for the Combinable Trips cross-border check and the country badge in trip
cards). This is deliberately *not* a global code→country lookup: team
codes are only unique **within** a league, not across all 32 (e.g. `"PAR"`
is Parma in `serie_a` but Partizan in `conference_league`), so a global
lookup would silently resolve to the wrong club's country for any colliding
code.

## Data structure

**`teams.json`** — nested by league, keyed by short team code. `logo` is
optional (present for ~572/592 clubs):
```json
{ "primeira_liga": {
    "POR": { "name": "FC Porto", "city": "Porto", "lat": 41.16177, "lng": -8.583591,
             "logo": "https://upload.wikimedia.org/wikipedia/en/f/f1/FC_Porto.svg" }
} }
```

**Club crests**: fetched once via Wikipedia's API (`action=query&generator=search&prop=pageimages&pilicense=any`,
searching each club's name and taking the page's main image) and hotlinked
directly from `upload.wikimedia.org` — not downloaded into this repo. These
are club logos/crests, typically hosted under a "fair use" rationale for
identification, not a freely-licensed asset; fine for this kind of internal
tool, but don't treat them as cleared for arbitrary reuse. A handful of
clubs (mostly obscure reserve/lower-league sides) have no `logo` field
because the search didn't turn up a usable image — the map falls back to
the plain colored marker for those automatically. Run `python3
fetch_logos.py` to fill in any club still missing one (safe to re-run,
skips clubs that already have a `logo`), or `python3 fetch_logos.py
--refresh` to re-fetch everything.

**`leagues.json`** — flat map of league code → competition logo URL:
```json
{ "epl": "https://upload.wikimedia.org/wikipedia/en/f/f2/Premier_League_Logo.svg" }
```
Fetched once via `fetch_league_logos.py`, which looks up each league's
Wikipedia page directly (by title, not free-text search — a search for e.g.
"Bundesliga" can resolve to the country rather than the competition) and
takes the page's main image. Same hotlinking/fair-use caveat as club crests
above applies. Re-run `python3 fetch_league_logos.py` to refresh all 29 (it
always overwrites — there's no per-league skip-if-present logic since the
whole file is small enough to just regenerate).

**`fixtures.json`** — nested by league, array of fixtures referencing team codes:
```json
{ "primeira_liga": [
    { "home": "POR", "away": "ALV", "start": "2026-08-09T17:00:00+00:00", "matchday": 1 }
] }
```

## Fixes made during the refactor

The original prototype (a self-contained HTML artifact with inline data) had
a latent bug, fixed while splitting out the data/CSS/JS:

- **Missing `--gold` CSS variable**: the stylesheet defined `--yellow` in
  `:root` but referenced `var(--gold)` (undefined) for the route panel
  header/title and the "+ Add to route" button, so those elements lost their
  yellow styling. Fixed by defining a shared `--gold` token in
  `css/variables.css`.

## ⚠️ Known data gaps / confidence levels — read before extending

Data confidence varies by league and was gathered via web search, not a
licensed live feed (see "On accuracy vs. an official API" below).

All 29 leagues were re-researched end-to-end on 2026-08-13 by 10 parallel
research passes (one per country/region), each reusing the same official
source already vetted for that league (see the per-league notes below) and
extending coverage to **every upcoming matchday with an officially
confirmed kickoff date+time** — not a fixed count. A league stops wherever
its federation's own publishing horizon stops; nothing beyond a confirmed
source was guessed. Several passes also caught and fixed outright errors in
the previous MD1-only data (wrong dates, swapped home/away, stale-season
data) — noted per league below.

| League | Coverage | Confidence | Notes |
|---|---|---|---|
| Premier League | MD1–7 (21 Aug–19 Oct) | High for MD1–5, Medium for MD6–7 | premierleague.com; **2026-08-24:** MD6 (10–12 Oct) added via cross-corroborated press (site unreachable that session). **2026-08-31:** MD7 (17–19 Oct) added in full, all 10 fixtures cross-corroborated across 2+ independent outlets (club sites, Sky Sports, NBC Sports, ESPN, worldfootball.net), after resolving an Everton–Chelsea kickoff-time discrepancy; premierleague.com itself remains unreachable this session so verification stayed WebSearch-snippet-based. MD8–9 broadcast selections are confirmed as announced but times only partially/inconsistently corroborated (one MD9 snippet conflicted with the already-stored MD6 Liverpool–Man City date and was discarded as season-conflated) — left unadded, recheck next pass |
| Championship, League One (ENG) | MD1–46, full season (Aug 2026–May 2027) | High through ~MD25 (early Jan), Moderate after | EFL publishes the full season's default schedule immediately, unlike other leagues — later Saturday 15:00 slots remain subject to further TV rearrangement per EFL's rolling confirmation policy; 2026-08-24 spot-check for postponements found nothing to change |
| La Liga | MD1–5 (15 Aug–14 Sep) | High | laliga.com structured match data; **corrected several wrong MD1 fixtures** from the previous internal-tool snapshot (wrong pairings/dates); 2026-08-24: MD5 could not be verified (laliga.com unreachable, snippets said TBD). **2026-08-31:** MD5 added (10 fixtures, 11–14 Sep) — LaLiga released MD5-7 kickoff times on 2026-08-30 per convergent WebSearch sources (cope.es, eldesmarque.com, lagrada.org, vamosmisevillafc.com), a complete round-robin of all 20 codes. MD6/MD7 (incl. the Atlético–Real Madrid derbi) are confirmed to exist but per-fixture times were mutually contradictory across queries, so not added — recheck next pass |
| LaLiga Hypermotion | MD1–4 (14 Aug–7 Sep) | High | laliga.com; replaced the old mostly-placeholder MD1 times with real confirmed ones for all 11 fixtures; 2026-08-24: MD5 could not be verified (same access issue). **2026-08-31:** still unverified — laliga.com did publish an MD5 kickoff-times article, but every WebSearch summary of it was internally inconsistent or season-conflated (one attributed a Levante–Espanyol pairing to it, impossible in Hypermotion since both are primera clubs); nothing cleared the 2-source bar, recheck next pass |
| Bundesliga | MD1–4 (28 Aug–20 Sep) | High | OpenLigaDB (official DFL/DFB mirror), cross-verified against bundesliga.com; MD5+ not yet time-confirmed — 2026-08-24 re-check confirms MD1–4 unchanged, DFL's next scheduling batch expected calendar week 37 (7–11 Sep) |
| 2. Bundesliga | MD1–6 (7 Aug–20 Sep) | High | Same sourcing; **corrected two kickoff times** (Magdeburg–Braunschweig, Cottbus–Hannover 96) that were off by 30 min in the old data; 2026-08-24 re-check confirms MD1–6 unchanged, MD7+ not yet published |
| 3. Liga | MD1–7 (7 Aug–20 Sep) | High | Same sourcing; MD6 is a real simultaneous-kickoff midweek round (all 19:00 CEST), not a placeholder; 2026-08-24: MD8/9 reportedly time-scheduled per a dfb.de headline but WebSearch produced mutually contradictory pairings, so nothing added. **2026-08-31:** same issue persists — dfb.de again carries an MD8/9 headline, but attributed snippets name clubs absent from this season's confirmed 20-club roster (Dynamo Dresden, 1860 München, BVB II, Energie Cottbus, Arminia Bielefeld — cross-checked against kicker.de/weltfussball.de and data/teams.json), pointing to prior-season data bleeding into search summaries; needs a working direct-fetch recheck |
| Serie A | MD1–5, full 50/50 fixtures (22 Aug–20 Sep) | High | legaseriea.it via Wikipedia's mirrored calendar tables, cross-checked against a legaseriea.it news article; 2 MD4 fixtures excluded (Lazio–Milan, Sassuolo–Juventus — kickoff still conditional on the Europa League league-phase draw); 2026-08-24 re-check: still no MD6 kickoff times published. **2026-08-31:** the EL league-phase draw (28 Aug, Monaco) freed the 2 withheld MD4 fixtures — Lazio–Milan (Sat 12 Sep 18:00 CEST) and Sassuolo–Juventus (Sun 13 Sep 20:45 CEST), confirmed via milanpress.it/milannews.it/juveoggi.it/sassuolonews.net — MD4 is now complete. MD6 pairings are reported but kickoff times still not lega-confirmed |
| Serie B | MD1–5 (21 Aug–20 Sep) | High | Same sourcing; replaced the old one-flat-time-for-everyone placeholder with real per-match times; 2026-08-24 re-check confirms MD1–5 unchanged, MD6+ not yet published |
| Ligue 1 | MD1–5, 37/45 fixtures (21 Aug–22 Sep) | High for MD1–4, Low for MD5 (1/9 fixtures) | ligue1.com TV-programming articles + official club sites; **2026-08-24:** added the OM–PSG Classique (MD5, 20 Sep) via multiple independent sources — the other 8 MD5 fixtures and all of MD6+ could not be pinned down (ligue1.com/lfp.fr unreachable). **2026-08-31:** the OM–PSG Classique was **postponed** by the Bouches-du-Rhône prefecture (storm/flood alert, Vélodrome crowd-safety concerns) from Sun 20 Sep to Mon 22 Sep 20:00 CEST — corrected in place (france3-regions.franceinfo.fr, ici.fr, soccerway.com). The other 8 MD5 fixtures and MD6 still couldn't be pinned down — ligue1.com/lfp.fr remain effectively unreachable and search results kept returning mislabeled 2025-26-season pairings |
| Ligue 2 | MD1–9, 80/81 fixtures (8 Aug–19 Oct) | High for MD1–4/6/7/9, Medium for MD5, Low/partial for MD8 | LFP calendar + club sites; **2026-08-24:** MD5 completed (Boulogne–Dijon added); MD9 opened with only 2 of 9 fixtures; MD8's Dunkerque–Annecy still lacks a published kickoff time. **2026-08-31:** MD9 completed to 9/9 (7 more fixtures, 16–19 Oct, cross-checked against the 2 already-stored MD9 fixtures which matched exactly). MD8's Dunkerque–Annecy remains unresolved — search kept surfacing the 2025-26-season fixture instead of the 2026-27 one. MD10 has only a rough date window so far, no fixture-level data |
| Primeira Liga | MD1, 3–5, 39/44 fixtures (7 Aug–10 Sep) | High | ligaportugal.pt official calendar API (UTC-native); **2026-08-24:** Braga–Gil Vicente (MD2) was officially postponed indefinitely (squad illness outbreak) with no new date announced — removed rather than left stale; MD5+ could not be verified this pass. **2026-08-31:** MD5 partially added — 4 of 9 fixtures cleared the 2-source bar (POR–MOR, MAR–BEN, BRA–ALV, and SCP–NAC which moved from Fri to Sat once Sporting's Champions League opener was fixed for Wed 9 Sep); remaining 5 MD5 pairings returned contradictory/season-conflated snippets and were left out. Braga–Gil Vicente still has no confirmed make-up date |
| Eredivisie | MD1–12, 18, 33–34 (7 Aug 2026–23 May 2027) | High | eredivisie.nl live fixture feed (the *rendered page* had a 1-hour display bug — feed data was used instead, verified against press); 1 postponed fixture (NEC–Excelsior) excluded — 2026-08-24: KNVB set two conditional make-up dates (8 or 16 Sep) pending NEC's Champions League play-off return leg outcome. **2026-08-31:** resolved and added — NEC lost 1–6 on aggregate to Bodø/Glimt (25 Aug), dropping into the Europa League, which triggers the 8 Sep 18:45 CEST make-up date per KNVB/NEC's own statement. MD13–21 dates still not out — KNVB confirms that announcement is due no later than 8 Sep 2026 |
| Eerste Divisie | MD1–38, full season (7 Aug 2026–14 May 2027) | High, single-source | keukenkampioendivisie.nl's official schedule API — every match all season has a distinct real time, but from one source only; 2026-08-24 postponement spot-check could not be completed (search budget exhausted). **2026-08-31:** overdue spot-check completed (keukenkampioendivisie.nl/KNVB news) — no postponements, cancellations, or reschedules found anywhere in MD1–38; full season stands unchanged |
| Pro League (BEL) | MD1–7 (7 Aug–20 Sep) | High | proleague.be + voetbalkrant.com cross-check; **corrected several wrong kickoff times and a few home/away swaps** in the old MD1 data; **2026-08-24:** 3 MD3 fixtures (Anderlecht–KV Kortrijk, Gent–OH Leuven, Sint-Truiden–Union SG) rescheduled to 2–3 Sep; a further MD5 Anderlecht–Gent fixture is also postponed with no new date yet. **2026-08-31:** MD3 reschedule re-confirmed correct via a matching proleague.be article; MD8+ genuinely not published yet (Pro League's site states the next calendar update lands 1 Sep 2026); Anderlecht–Gent's new date still couldn't be pinned down (only hit found was 2025-26-season contamination) |
| Challenger Pro League (BEL) | MD1–6 (14 Aug–20 Sep) | High | Same sourcing; **fixed two reversed home/away fixtures** (Seraing–Lokeren, Eupen–Jong Genk); 15 clubs, rotating bye each round is expected, not a gap; 2026-08-24 re-check found no changes. **2026-08-31:** re-checked via proleague.be, voetbalprimeur.be, Sporza, voetbalkrant.com — MD7+ still has no published kickoff times league-wide; spot-checked several MD1/2/4 fixtures against multiple outlets, all match stored data exactly, no postponements found |
| Allsvenskan (SWE) | Rounds 17–23 (14 Aug–12 Oct) | High | allsvenskan.se, cross-checked against Svensk Elitfotboll; 2026-08-24: round 24+ could not be verified — WebSearch results repeatedly conflated other seasons' schedules. **2026-08-31:** round 24+ still unverified — real allsvenskan.se URLs confirm round-24 pairings exist and svenskfotboll.se confirms times are only fixed through round 23, but every attempt at a full round-24 card kept injecting teams not in the 2026 16-club league (leftovers from other seasons); spot-checked the stored postponement makeups (MJA–DJU, AIK–MJA), both confirmed correct |
| Eliteserien (NOR) | Rounds 18–22 (14 Aug–20 Sep) | High | Official NFF/fotball.no database; the old placeholder Bodø/Glimt–Start fixture was found to have **already been played back in April** and was dropped rather than given a fake future date; 2026-08-24: round 23+ could not be verified this pass. **2026-08-31:** still unverified — fotball.no confirms a scheduling announcement exists for rounds 23-30, but snippets returned only fragments or dates inconsistent with round 22 (one "round 23" snippet predated round 22), so nothing met the confidence bar |
| Superliga (DEN) | Rounds 3(makeup)–9 (14 Aug–20 Sep) | High | Live from superliga.dk (web-search summaries were discarded as stale); fixed a matchday mislabel (Randers–FCK was tagged round 3, actually round 4); 2026-08-24: round 10+ could not be verified this pass. **2026-08-31:** round 10+ genuinely not yet published, not just unverifiable — FCK's own datoplan article and a Superliga schedule doc confirm rounds 10-14 are released in week 36 (first week of Sept); existing rounds unchanged, no postponements found |
| Veikkausliiga (FIN) | Rounds 20–22, end of regular season (14–31 Aug) | High–Medium-high | Official fixtures listing; rounds 23+ (post-season split) not yet published — 2026-08-24 re-check confirms still unpublished, expected first split matchday is 9 Sep. **2026-08-31:** re-confirmed still unpublished, two independent sources agree the split schedule releases "in early September," first split matchday fixed for Wed 9 Sep |
| Scottish Premiership | MD1–6, 25/... fixtures (31 Jul–20 Sep) | High | spfl.co.uk / club statements; **2026-08-24:** Falkirk–Hearts (postponed MD2) rescheduled to 15 Sep; full MD5 round and the MD6 Old Firm derby confirmed; Rangers–St Mirren and St Johnstone–Celtic (postponed MD2) remained unconfirmed. **2026-08-31:** both postponed fixtures now confirmed for Wed 9 Sep (Rangers–St Mirren 19:45 BST, St Johnstone–Celtic 20:00 BST), sourced from official club statements plus Rangers Review/Celtic Way. MD7+ not yet published |
| Swiss Super League | MD1, 4–10 (25 Jul–11 Oct) | Very high | Official SFL/blue Sport calendar PDF, which explicitly marks Rounds 1–10 as time-confirmed; **2026-08-24:** the previously-blank Thun–Servette (MD4) fixture is now confirmed (22 Aug); rounds 11+ not yet published. **2026-08-31:** re-confirmed still unpublished — sfl.ch continues to indicate release in the second half of September; pairings-only aggregator hits for rounds 11/12 didn't clear the officially-timed bar |
| Austrian Bundesliga | MD1, 3–7 (31 Jul–20 Sep) | High | bundesliga.at team pages; **the previously-assumed MD1 dates for Wolfsberger AC–Austria Wien and Austria Lustenau–SV Ried were corrected** to the actual played date (2 Aug); **2026-08-24:** MD6 added via laola1.at alone, flagged for a follow-up spot-check. **2026-08-31:** MD6 independently cross-verified against Sky Sport Austria's report — all 6 times match exactly, no corrections needed; MD7 (18-20 Sep) added from the same round 6/7 scheduling announcement, corroborated by ligaportal.at and club sites. A three-week international break follows MD7 |
| Greek Super League | MD1–3 (22 Aug–7 Sep) | High | seleo.gr / betarades.gr; replaced the old one-flat-time placeholder with real per-match times; **2026-08-24:** MD2 (7 fixtures) added, cross-confirmed. **2026-08-31:** MD3 kickoff times confirmed (7 fixtures, 5-7 Sep), including the Panathinaikos–PAOK derby (Sun 6 Sep 21:30 EEST); sourced from protothema.gr plus the onsports.gr/thestival.gr/sportday.gr cluster, cross-checked and consistent |
| Turkish Süper Lig | MD1–4 (14 Aug–7 Sep) | High | sporx.com; MD1 unchanged from prior high-confidence data; 2026-08-24 re-check found MD4 pairings known but not yet time-confirmed. **2026-08-31:** MD4 kickoff times confirmed (9 fixtures, 4-7 Sep), incl. Başakşehir–Galatasaray (moved early for GS's UEFA commitments) and the Fenerbahçe–Beşiktaş derby (moved for Fenerbahçe's Europa League game); sourced from fotomac.com.tr, ntvspor.net, sha.com.tr plus a sporx.com-aligned cluster, cross-checked and consistent |
| Polish Ekstraklasa | MD1, 4–9, 54 fixtures (24 Jul–20 Sep) | High for MD1–7/9, Low/partial for MD8 (2 fixtures) | ekstraklasa.org official terminarz; MD1 re-derived from final-score reports, **fixing a wrong date+time** for Wisła Kraków–GKS Katowice; **2026-08-24:** Raków–Górnik Zabrze (MD5) confirmed; Zagłębie Lubuin–GKS Katowice (MD8) added; Korona Kielce–Górnik Zabrze remains undated pending Górnik's European qualifier. **2026-08-31:** MD9 fully time-confirmed (rakow.com, gornikzabrze.pl, corroborated by kkslech.com); one more MD8 fixture (Górnik Zabrze–Lech Poznań) added; Korona Kielce–Górnik Zabrze still undated — per weszlo.com it awaits the end of Górnik's European campaign, not yet concluded |
| Czech First League (Chance Liga) | MD1, 4–6 (25 Jul–2 Sep) | High | fotbal.cz; MD1's previously-uncertain Artis Brno–Mladá Boleslav game confirmed at 18:00 local; 2026-08-24: MD6+ could not be verified this pass. **2026-08-31:** MD6 added (7 of 8 fixtures, 29-30 Aug, incl. the Sparta–Slavia derby, cross-checked via isport.cz/fotbalzpravy.cz/iROZHLAS/livesport.cz); Bohemians–Mladá Boleslav (MD6) was postponed (squad illness outbreak) with no make-up date yet, so omitted. MD7 pairings reported but not time-confirmed |
| Croatian HNL | MD1, 3–5 (31 Jul–31 Aug) | High | hns-cff.hr official raspored; MD2 intentionally skipped (already played before the research date); 2026-08-24: MD5+ could not be verified this pass. **2026-08-31:** MD5 added in full (5 fixtures, 29-31 Aug), cross-checked via rezultati.com/flashscore.com/soccerway.com/hnl.hr; two fixtures shifted to Monday because Hajduk and Rijeka played Conference League play-off second legs on Thursday. MD6 pairings reported but not time-confirmed |
| UEFA Champions League | Play-off round (MD1) + League Phase MD1-6 complete (MD2-7, 108/108) + MD7 partial (MD8, 9/18), 18 Aug–19 Jan | High | Wikipedia's mirror of uefa.com's fixture calendar, cross-validated by independently converting each kickoff's two given timezones to UTC and confirming they agreed; 2026-08-24: League Phase draw set for 27 Aug — nothing to add until the draw happens. **2026-08-31:** draw held 27 Aug in Monaco (36-team single table); added confirmed MD1 fixtures for our 7 tracked play-off winners, stored as matchday 2 — treat this league's matchday numbering as competition-internal (1=play-off round, 2=League Phase MD1, ...), not UEFA's own numbering. **2026-09-01, first pass:** completed League Phase MD1 (8-10 Sep) — 18/18, plus 24 new clubs (23 reused from domestic entries via the marker-merge convention; Shakhtar Donetsk newly added — plays League Phase home fixtures at Stamford Bridge, London, confirmed via 4 independent sources). **Second pass, same day:** the user supplied direct uefa.com screenshots covering League Phase MD1 through MD7 (8-10 Sep, 13-14 Oct, 20-21 Oct, 3-4 Nov, 24-25 Nov, 8-9 Dec, 19 Jan). MD1 matched our existing data exactly, confirming the 18:45/21:00 CET reading; added MD2-6 in full (90 fixtures) and MD7 partially (9/18 — only the Tue 19 Jan half of that matchday was in the supplied screenshots, the Wed 20 Jan half isn't in yet). No new clubs needed, same 36-team table all season |
| UEFA Europa League | Play-off round, MD1 return legs (27 Aug) + League Phase MD1-6 (MD2-7, complete: 108/108, 16 Sep–10 Dec) | High — League Phase MD2-7 from direct uefa.com screenshots (user-supplied); MD1/play-off return legs medium (see below) | **2026-08-24/31:** play-off return legs (27 Aug) added, 12/12, 2+ sources per fixture; first legs (20 Aug) never added — no kickoff-time source found, and now historical. **2026-09-01, first pass:** added League Phase MD1 in full — 18/18 fixtures, 24 new clubs (22 reused from domestic/other-competition entries via the marker-merge convention plus a country tag; 2 genuinely new — Stade Rennais, Roazhon Park/Rennes coordinates confirmed via Wikipedia infobox, no crest found on Wikimedia so falls back to the plain marker; CD Torreense, who play European home games at Estádio Algarve, Faro — 300 km from their own Torres Vedras ground, confirmed via 3 independent Portuguese sources). **Second pass, same day:** the user supplied direct uefa.com screenshots covering League Phase MD1 through MD6 (16 Sep, 15 Oct, 22 Oct, 5 Nov, 26 Nov, 10 Dec) — MD1 matched our existing data exactly (12:6 split confirming the 18:45/21:00 CET reading), so added the other five matchdays (90 fixtures) straight from the screenshots, no new clubs needed (same 36-club table all season). Same timezone reading as Conference League (displayed time -1h → UTC) |
| UEFA Conference League | Play-off round (MD1), 13/61 legs (20-27 Aug) + League Phase MD1-6 (MD2-7, complete: 108/108, 15 Oct–17 Dec) | Play-off legs: medium (2+ sources per added leg, rest withheld). League Phase: **user-supplied screenshots of uefa.com's own fixtures page** — the most direct source available, but see the timezone caveat below | 2026-08-24/31: play-off round partial (8/48 legs corroborated), league-phase draw held 28 Aug. **2026-09-01, first pass:** automated research hit a wall — uefa.com unreachable via WebFetch (403/503 every attempt, including the user's own direct fixtures-results link) and via a real browser tab (page rendered blank, bot protection); nothing added that pass. **Second pass, same day:** the user supplied screenshots for MD1-3 (15/22 Oct, 5 Nov) — added all 54 fixtures plus 9 new clubs reused from europa_league entries (Trabzonspor, Kairat, CSKA Sofia, Mjällby, Egnatia, Kauno Žalgiris, Thun, Sint-Truidense, Iberia Tbilisi). **Timezone caveat (resolved by later confirmation, kept for context):** displayed times were converted to UTC by subtracting 1 hour (read as UK local time) — this conflicted with one pre-existing fixture (Copenhagen–Braga, resolved in favour of the new direct-screenshot source). **Third pass, same day:** the user supplied MD2 and MD3 again alongside three new matchdays (MD4-6: 26 Nov, 10 Dec, 17 Dec) — the MD2/MD3 screenshots matched our already-stored data exactly (same pairings, same times once the -1h reading is applied), independently confirming both the timezone reading and the transcription were correct; added the 3 new matchdays (54 fixtures) straight from the screenshots, no further clubs needed |
| UEFA Youth League | Teams only — 0 fixtures, matchday dates not yet published | Teams: high (roster from a user-supplied screenshot of UEFA's own R1/R2 Champions Path qualifying pots). Fixtures: none yet | **2026-09-01:** competition set up ahead of its fixture list at the user's request ("die Termine reiche ich nach"). 50 clubs added: 21 reused from existing domestic/other-competition entries via the marker-merge convention (Chelsea, Benfica, Rangers, Salzburg, Genk, Copenhagen, Dinamo Zagreb, Fiorentina, Hoffenheim, PAOK, AZ Alkmaar, Legia Warszawa, Hammarby, HJK Helsinki, Hradec Králové, Clermont, Kairat Almaty, Crvena Zvezda, Maccabi Tel Aviv, Pafos, Lincoln Red Imps — each got an added `country` field, since `COUNTRY_TAG` deliberately has no UEFA-competition entries), plus 29 genuinely new entries (city-level coordinates, no crest found for any of them so all fall back to the plain league-colour marker): Þór Akureyri, HB Tórshavn, Žalgiris Vilnius, Flora Tallinn, Super Nova, Ballkani, Cliftonville, UNA Strassen, Cardiff Metropolitan University, Valletta, Partizani Tirana, Mladost Podgorica, Dinamo Tbilisi, Dinamo Minsk, Zrinjski Mostar, Brera Strumica, Santa Coloma, Dynamo Kyiv, Bravo, St Patrick's Athletic, Göztepe, Stabæk, Žilina, MTK Budapest, Septemvri Sofia, Qarabağ, Zürich, Farul Constanța, Sheriff Tiraspol. Several near-identical names were checked and correctly rejected as false matches to existing entries during this pass (UNA Strassen vs. Osasuna/Deportivo/Fortuna, Cardiff Met vs. Cardiff City, Dinamo Tbilisi vs. Dinamo Zagreb, Santa Coloma vs. Racing Santander/Santa Clara, Dynamo Kyiv vs. Dynamo Dresden, St Patrick's vs. St Pauli/St Gallen). Fixtures deliberately left empty (`youth_league: []`) — the user will supply matchday dates in a follow-up |

**2026-08-24 / 2026-08-31 weekly updates — network-access caveat:** both
runs' execution environments blocked outbound `WebFetch`/direct HTTP access
to every external domain tested (official league sites, Wikipedia, even
plain control domains), so all research relied on `WebSearch` result
snippets rather than directly fetched pages. That's a materially weaker
verification method than the 2026-08-13 pass — snippets were occasionally
stale, season-conflated, or internally contradictory (several 2026-08-31
research passes explicitly caught snippets naming clubs from prior seasons
or the wrong division and discarded them), so several leagues were left
unchanged (`skipped_could_not_verify` rather than risk a bad date) even
where new data likely exists, and every fixture added was held to a
stricter bar (2+ independent corroborating sources, or an official-adjacent
primary page like a club's own ticketing/terminarz listing). The
2026-08-31 run also split research across parallel per-region passes with a
shared WebSearch budget — a few leagues (Europa League's League Phase
draw, UEFA Conference League on the first pass, Czech First League,
Croatian HNL) were left for a targeted follow-up pass once the budget ran
out mid-run, noted per league above. See each row's Notes above for what
could and couldn't be confirmed. Recommend re-running the verification pass
once direct site access is restored.

Stadium coordinates are city-level from general knowledge, not individually
re-verified per club. The live current-season snapshot for the "big 5"
leagues that was previously sourced from a Claude.ai-internal tool has been
fully replaced above with open-web sourcing, so that dependency no longer
applies to any league in this dataset.

## Why matchday depth varies so much by league

Coverage now genuinely reflects each league's own publishing horizon rather
than a fixed cutoff — the differences are real, not a research gap:
- **EFL (Championship, League One)** publishes the entire season's default
  schedule on release day, so those two go all the way to May 2027.
- **Most continental top flights** (Bundesliga, Serie A, Ligue 1, La Liga,
  Primeira Liga) release kickoff times in **stages**, a few weeks at a
  time — e.g. the DFL had only matchdays 1–4 time-confirmed for the
  Bundesliga as of 2026-08-13, with the rest following later.
- **Nordic leagues** run calendar-year seasons already in progress by
  August, so coverage starts at the current round rather than MD1.
- A handful of leagues (Eredivisie, Eerste Divisie) publish much further
  ahead than their neighbors simply because their federation's own data
  feed happens to carry season-long placeholders that resolve to real times
  early.

Beyond each league's confirmed horizon there's nothing to fetch — the
**weekly scheduled routine** (see below) is the mechanism for picking up
newly-confirmed matchdays as each federation releases them over time,
rather than this being a one-time manual push.

## Automated weekly updates

A scheduled cloud agent ("Norwich Scouting Map - Weekly Fixture Update")
runs every Monday morning, checks each league in `data/fixtures.json`
against its official site (falling back to reputable sports press when the
official site isn't cleanly scrapable), adds any newly-confirmed matchdays
or corrects postponed/rescheduled fixtures, and commits + pushes the
result. It never invents placeholder dates/times — a league with nothing
newly confirmed is simply left alone until next week. Managed at
[claude.ai/code/routines](https://claude.ai/code/routines).

## On accuracy vs. an official API

Every fixture in this dataset comes from open-web research (official league
sites where possible, reputable press otherwise) rather than a licensed
sports-data feed — that's inherent to how this project is maintained, not a
gap specific to any subset of leagues. For guaranteed-accurate, always-fresh
data instead, you'd want one of:
- A licensed sports-data API (Sportradar, API-Football, Opta, etc.)
- A "Scoutastic" export/API if your organization can provide access
