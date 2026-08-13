# Norwich City Scouting Map — Matchday Explorer

A Leaflet-based tool for planning European scouting trips: league/matchday
fixture browsing plus point-to-point route planning. Norwich City brand
colors throughout (canary yellow `#FFF200` / green `#00622F`).

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
│   ├── fixtures.json          275 fixtures, keyed by league, with matchday numbers
│   └── airports.json          ~60 major European airports (name, IATA, city, lat/lng)
├── build_standalone.py        Builds dist/matchday-explorer-standalone.html (see below)
└── fetch_logos.py             Fills in data/teams.json's "logo" field via Wikipedia (see below)
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
- Club crests on this-matchday markers (hotlinked from Wikipedia, fetched
  per club by `data/teams.json`'s `logo` field — see below); falls back to
  the plain colored marker if a club has no crest on file or the image
  fails to load
- "✈️ Airports" toggle (top control bar): overlays ~60 major European
  airports (`data/airports.json`) as a reference layer, independent of the
  league/matchday filters — handy for judging how reachable a fixture
  cluster is by air, not just by road. Off by default; click the button to
  show/hide, click a plane marker for the airport name, IATA code, and city
- Radius search (top-left panel): enter an address, or click "📍 Pick point
  on map" and click anywhere on the map instead — either way, see every home
  fixture within a radius (10–500 km) of that point, across *all* 29 leagues
  and every matchday currently loaded, independent of which leagues are
  toggled on in the picker, since "what's near this point" is a different
  question from "what am I currently browsing". Scroll over the radius
  dropdown to step through distances live (re-filters instantly against the
  already-geocoded point — no repeated address lookups). Draws the search
  circle, drops a marker per match, and each result supports "+ Add to
  route" like any other marker. Geocoding (forward and reverse) via
  OpenStreetMap's free Nominatim API (same data source as the map tiles and
  OSRM routing already used elsewhere)
- "Combinable trips" panel: for the selected league + matchday's home
  fixtures ("anchors"), finds realistic multi-stop trips — including other
  leagues/countries — where every leg is checked against actual driving time
  (see below), not just distance
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time)
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

Data confidence varies significantly by league and was gathered via web
search, not a live feed (except the big 5, see below).

| League | Coverage | Confidence | Notes |
|---|---|---|---|
| Premier League | MD1–2 | High | MD2 added 2026-08-13, confirmed kickoff times |
| La Liga, Bundesliga, Serie A, Ligue 1 | Live snapshot | High | Pulled from a sports-data tool internal to Claude.ai chat — **not available in Claude Code**, see below |
| Championship (ENG), 2. Bundesliga (GER), Ligue 2 (FRA) | MD1 | High | Full 2026/27 roster + confirmed opening-round kickoff times from official/press sources |
| LaLiga Hypermotion (ESP) | MD1 | Medium | Full 2026/27 roster confirmed; only 2 of 11 kickoff times were confirmed by the source found (Real Sociedad B–Castellón, Almería–Eldense) — the other 9 use **placeholder times** (typical Segunda weekend slots), dates are correct |
| Serie B (ITA) | MD1 | Medium | Full 2026/27 roster + correct matchday date (Sat 22 Aug) confirmed; **no source gave individual kickoff times**, so all 10 matches use the same **placeholder time** (18:00 CEST) |
| Primeira Liga, Eredivisie, Superliga (DEN) | MD 1–2/3 | High | Cross-verified against official calendars via press coverage |
| Pro League (BEL) | MD1 (+1 MD2 game) | High | 18 clubs (league expanded from 16) |
| Allsvenskan (SWE), Veikkausliiga (FIN) | Current round only | Medium | Calendar-year seasons already in progress; round numbers approximate |
| Eliteserien (NOR) | Round 18 | Medium | 1 of 8 fixtures (Bodø/Glimt–Start) uses a **placeholder date/time** — home/away was inferred from a season ground-pattern, not confirmed directly |
| League One (ENG), 3. Liga (GER), Eerste Divisie (NED), Scottish Premiership, Swiss Super League, Turkish Süper Lig, Croatian HNL | MD1 | High | Full 2026/27 roster + confirmed kickoff times from official/press sources |
| Challenger Pro League (BEL) | MD1 | High | 15 clubs; one team (Club NXT) has a bye in MD1 (odd number of clubs), so it appears with no home fixture that round — expected, not a data gap |
| Austrian Bundesliga | MD1 | Medium | Full roster + 4 of 6 kickoff times confirmed; 2 matches (Wolfsberger AC–Austria Wien, Austria Lustenau–SV Ried) have a confirmed time but the **date is assumed** (same weekend as the rest of MD1, not individually verified) |
| Greek Super League | MD1 | Medium | Full roster + correct match dates (22–23 Aug) confirmed; **no source gave kickoff times**, so all 7 matches use the same **placeholder time** (20:00 EEST) |
| Polish Ekstraklasa | MD1 | Medium | Full roster + all 9 pairings confirmed; only 2 kickoff times individually confirmed (Radomiak–Wieczysta, Pogoń–Legia) — the other 7 use a **placeholder time** (Sat 14:45 CEST), dates for those 7 are assumed |
| Czech First League (Chance Liga) | MD1 | High | Full roster + 7 of 8 kickoff times confirmed; 1 match (Artis Brno–Mladá Boleslav) has confirmed date but **placeholder time** |

**12 more leagues added 2026-08-13** (League One, 3. Liga, Eerste Divisie, Challenger Pro League, Scottish Premiership, Swiss Super League, Austrian Bundesliga, Greek Super League, Süper Lig, Ekstraklasa, Czech First League, Croatian HNL): same research method as the second-tier leagues above (web search, not the Claude.ai sports-data tool). Stadium coordinates are city-level from general knowledge, not individually re-verified per club.

## Why most leagues only go 1–2 matchdays deep

We tried extending every league to matchdays 1–5 in one pass (2026-08-13) and
hit a hard limit: most federations/leagues release kickoff times in
**stages**, weeks ahead of each round, not for the whole season at once —
e.g. the DFL (Bundesliga) had only matchdays 1–4 time-confirmed at the time
of writing, with the rest following later. Beyond that point there's
nothing to fetch; it's not a research gap. The **weekly scheduled routine**
(see below) is the actual answer to "extend this over time" — it picks up
newly-confirmed matchdays automatically as each federation releases them,
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

## The live sports-data gap

The current-season snapshots for the big 5 leagues were fetched using a
sports-data tool that's internal to the Claude.ai chat environment and is
not exposed via the Claude Code / API surface. To keep those leagues current
from here, you'll need one of:
- A licensed sports-data API (Sportradar, API-Football, Opta, etc.)
- A "Scoutastic" export/API if your organization can provide access
- Continuing to fetch matchday data manually via Claude.ai chat and dropping
  the resulting JSON into `data/`
