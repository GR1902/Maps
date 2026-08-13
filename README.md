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
│   ├── teams.json             499 club/venue records, keyed by league → team code
│   ├── fixtures.json          2610 fixtures, keyed by league, with matchday numbers
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
- League picker (multi-select checkbox panel, 29 leagues across 16
  countries) — each selected league gets its own matchday dropdown, since
  leagues don't share a common calendar or matchday numbering
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
  fixture within a radius of that point, across *all* 29 leagues and every
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
  same number of games, the fewest total driving km. By default only
  same-country trips are shown; a "🌍 Include cross-border trips" toggle
  above the list opts in to also seeing trips that reach into a
  neighboring country's leagues, re-filtering instantly from the
  already-computed trips (no re-fetch from the routing service). Shown as
  a swipeable/scrollable carousel — one trip card at a time, with a
  position readout ("2 / 7") and ‹ › buttons — instead of a long vertical
  list. A "🔀 Suggest trip" button on any single fixture (list row, radius
  result, or marker popup) pins the panel to trip suggestions built around
  just that one game, independent of whatever leagues/matchdays are
  currently toggled on, until cleared via "✕ Show all trips"
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time); stops and the running
  distance/time summary live under "🚗 Plan Route" in the top control bar,
  same dropdown pattern as the league picker and radius search. Optionally
  set a 🏁 start point — from an airport's popup or the radius search's
  "Use as route start" — so the route is driven from that origin (e.g. the
  airport you're flying into) instead of starting at the first added
  fixture; only one start point at a time, shown ahead of the numbered
  stops and removable on its own without clearing the whole route
- "⭐ My Plan" watchlist (top of the side panel) — separate from the route
  planner: this is for marking games you want to see, not for building a
  drivable itinerary. Add a fixture by clicking its ☆ (fixture list, radius
  results, or marker popup) or by dragging it into the panel; drag rows
  within the panel to reorder — order = priority, shown as a rank number.
  **Multiple named plans**: the dropdown at the top of the panel switches
  between plans (e.g. one per scout/person), with buttons to rename, create,
  or delete a plan (the last remaining plan can't be deleted — rename it
  instead). Everything's persisted in the browser's `localStorage`, so it
  survives reloads (but is local to one browser/device — there's no account
  or sync between devices)

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
- A trip's total span (first game to last) is capped at 72h
  (`MAX_TRIP_SPAN_H`, a Friday-to-Monday matchday window) so legs don't
  chain into an unrealistic multi-day itinerary just because each
  individual hop was technically feasible.
- Legs where OSRM can't find a road route at all (e.g. islands reachable
  only by ferry) are treated as infeasible and excluded.

This means the routing service is called live every time you change league
or matchday — same public OSRM demo server already used for the point-to-
point route panel, so the same "not for heavy production use" caveat
applies (see console warning). If it's ever unavailable, the panel shows an
error instead of silently falling back to straight-line guesses.

## Data structure

**`teams.json`** — nested by league, keyed by short team code. `logo` is
optional (present for ~490/499 clubs):
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
| Premier League | MD1–5 (21 Aug–20 Sep) | High | premierleague.com; MD6+ (10 Oct onward) has no TV-selected kickoff times published yet |
| Championship, League One (ENG) | MD1–46, full season (Aug 2026–May 2027) | High through ~MD25 (early Jan), Moderate after | EFL publishes the full season's default schedule immediately, unlike other leagues — later Saturday 15:00 slots remain subject to further TV rearrangement per EFL's rolling confirmation policy |
| La Liga | MD1–4 (15 Aug–7 Sep) | High | laliga.com structured match data; **corrected several wrong MD1 fixtures** from the previous internal-tool snapshot (wrong pairings/dates) |
| LaLiga Hypermotion | MD1–4 (14 Aug–7 Sep) | High | laliga.com; replaced the old mostly-placeholder MD1 times with real confirmed ones for all 11 fixtures |
| Bundesliga | MD1–4 (28 Aug–20 Sep) | High | OpenLigaDB (official DFL/DFB mirror), cross-verified against bundesliga.com; MD5+ not yet time-confirmed |
| 2. Bundesliga | MD1–6 (7 Aug–20 Sep) | High | Same sourcing; **corrected two kickoff times** (Magdeburg–Braunschweig, Cottbus–Hannover 96) that were off by 30 min in the old data |
| 3. Liga | MD1–7 (7 Aug–20 Sep) | High | Same sourcing; MD6 is a real simultaneous-kickoff midweek round (all 19:00 CEST), not a placeholder |
| Serie A | MD1–5, 48/50 fixtures (22 Aug–20 Sep) | High | legaseriea.it via Wikipedia's mirrored calendar tables, cross-checked against a legaseriea.it news article; 2 MD4 fixtures excluded (Lazio–Milan, Sassuolo–Juventus — kickoff still conditional on European scheduling) |
| Serie B | MD1–5 (21 Aug–20 Sep) | High | Same sourcing; replaced the old one-flat-time-for-everyone placeholder with real per-match times |
| Ligue 1 | MD1–4 (21 Aug–13 Sep) | High | ligue1.com TV-programming articles + official club sites |
| Ligue 2 | MD1–8, 70/72 fixtures (8 Aug–10 Oct) | High for MD1–4/6/7, Medium-high for MD5/MD8 | LFP calendar + club sites; 2 fixtures (1 each in MD5/MD8) excluded — pairing known, exact day/time within the round unconfirmed |
| Primeira Liga | MD1–4 (7 Aug–10 Sep) | High | ligaportugal.pt official calendar API (UTC-native) |
| Eredivisie | MD1–12, 18, 33, 34 (7 Aug 2026–23 May 2027) | High | eredivisie.nl live fixture feed (the *rendered page* had a 1-hour display bug — feed data was used instead, verified against press); 1 postponed fixture (NEC–Excelsior) excluded, no new date yet |
| Eerste Divisie | MD1–38, full season (7 Aug 2026–14 May 2027) | High, single-source | keukenkampioendivisie.nl's official schedule API — every match all season has a distinct real time, but from one source only |
| Pro League (BEL) | MD1–7 (7 Aug–20 Sep) | High | proleague.be + voetbalkrant.com cross-check; **corrected several wrong kickoff times and a few home/away swaps** in the old MD1 data (Westerlo–Union SG, Charleroi–OH Leuven, and others) |
| Challenger Pro League (BEL) | MD1–6 (14 Aug–20 Sep) | High | Same sourcing; **fixed two reversed home/away fixtures** (Seraing–Lokeren, Eupen–Jong Genk); 15 clubs, rotating bye each round is expected, not a gap |
| Allsvenskan (SWE) | Rounds 17–23 (14 Aug–12 Oct) | High | allsvenskan.se, cross-checked against Svensk Elitfotboll |
| Eliteserien (NOR) | Rounds 18–22 (14 Aug–20 Sep) | High | Official NFF/fotball.no database; the old placeholder Bodø/Glimt–Start fixture was found to have **already been played back in April** and was dropped rather than given a fake future date |
| Superliga (DEN) | Rounds 3(makeup)–9 (14 Aug–20 Sep) | High | Live from superliga.dk (web-search summaries were discarded as stale); fixed a matchday mislabel (Randers–FCK was tagged round 3, actually round 4) |
| Veikkausliiga (FIN) | Rounds 20–22, end of regular season (14–31 Aug) | High–Medium-high | Official fixtures listing; rounds 23+ (post-season split) not yet published |
| Scottish Premiership | MD1, 3, 4 (31 Jul–30 Aug) | High | spfl.co.uk / club statements; **MD2's Falkirk–Hearts, Rangers–St Mirren, St Johnstone–Celtic excluded** — officially postponed for UEFA play-off involvement, new date TBC |
| Swiss Super League | MD1, 4–10 (25 Jul–11 Oct) | Very high | Official SFL/blue Sport calendar PDF, which explicitly marks Rounds 1–10 as time-confirmed; one fixture (Thun–Servette, MD4) is blank in the official source and was excluded rather than guessed |
| Austrian Bundesliga | MD1, 3–5 (31 Jul–1 Sep) | High | bundesliga.at team pages; **the previously-assumed MD1 dates for Wolfsberger AC–Austria Wien and Austria Lustenau–SV Ried were corrected** to the actual played date (2 Aug), confirmed across 5 independent sources |
| Greek Super League | MD1 only (22–23 Aug) | High | seleo.gr / betarades.gr; replaced the old one-flat-time placeholder with real per-match times; MD2+ has no per-match schedule yet |
| Turkish Süper Lig | MD1–3 (14–31 Aug) | High | sporx.com; MD1 unchanged from prior high-confidence data |
| Polish Ekstraklasa | MD1, 4–7 (24 Jul–7 Sep) | High | ekstraklasa.org official terminarz; MD1 re-derived from final-score reports, **fixing a wrong date+time** for Wisła Kraków–GKS Katowice; 3 postponed fixtures excluded, no reschedule date yet |
| Czech First League (Chance Liga) | MD1, 4–5 (25 Jul–23 Aug) | High | fotbal.cz; MD1's previously-uncertain Artis Brno–Mladá Boleslav game confirmed at 18:00 local |
| Croatian HNL | MD1, 3–4 (31 Jul–23 Aug) | High | hns-cff.hr official raspored; MD2 intentionally skipped (already played before the research date) |

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
