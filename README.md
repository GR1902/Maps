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
│   ├── teams.json             308 club/venue records, keyed by league → team code
│   └── fixtures.json          180 fixtures, keyed by league, with matchday numbers
└── build_standalone.py        Builds dist/matchday-explorer-standalone.html (see below)
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
- League dropdown + matchday dropdown (populated dynamically per league)
- Shows selected league's home fixtures highlighted; other clubs of the same
  league in a pale shade; all other leagues' clubs in muted grey
- "Combinable trips" panel: for the selected league + matchday's home
  fixtures ("anchors"), finds realistic multi-stop trips — including other
  leagues/countries — where every leg is checked against actual driving time
  (see below), not just distance
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time)

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

**`teams.json`** — nested by league, keyed by short team code:
```json
{ "primeira_liga": {
    "POR": { "name": "FC Porto", "city": "Porto", "lat": 41.16177, "lng": -8.583591 }
} }
```

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
| Premier League, La Liga, Bundesliga, Serie A, Ligue 1 | Live snapshot | High | Pulled from a sports-data tool internal to Claude.ai chat — **not available in Claude Code**, see below |
| Championship (ENG), 2. Bundesliga (GER), Ligue 2 (FRA) | MD1 | High | Full 2026/27 roster + confirmed opening-round kickoff times from official/press sources |
| LaLiga Hypermotion (ESP) | MD1 | Medium | Full 2026/27 roster confirmed; only 2 of 11 kickoff times were confirmed by the source found (Real Sociedad B–Castellón, Almería–Eldense) — the other 9 use **placeholder times** (typical Segunda weekend slots), dates are correct |
| Serie B (ITA) | MD1 | Medium | Full 2026/27 roster + correct matchday date (Sat 22 Aug) confirmed; **no source gave individual kickoff times**, so all 10 matches use the same **placeholder time** (18:00 CEST) |
| Primeira Liga, Eredivisie, Superliga (DEN) | MD 1–2/3 | High | Cross-verified against official calendars via press coverage |
| Pro League (BEL) | MD1 (+1 MD2 game) | High | 18 clubs (league expanded from 16) |
| Allsvenskan (SWE), Veikkausliiga (FIN) | Current round only | Medium | Calendar-year seasons already in progress; round numbers approximate |
| Eliteserien (NOR) | Round 18 | Medium | 1 of 8 fixtures (Bodø/Glimt–Start) uses a **placeholder date/time** — home/away was inferred from a season ground-pattern, not confirmed directly |

**Second-tier leagues added 2026-08-13** (Championship, LaLiga Hypermotion, 2. Bundesliga, Serie B, Ligue 2): rosters and MD1 fixtures researched via web search (Wikipedia, official league sites, sports press), not the Claude.ai sports-data tool. Stadium coordinates are from general knowledge, not individually re-verified per club — flag any that look off.

## The live sports-data gap

The current-season snapshots for the big 5 leagues were fetched using a
sports-data tool that's internal to the Claude.ai chat environment and is
not exposed via the Claude Code / API surface. To keep those leagues current
from here, you'll need one of:
- A licensed sports-data API (Sportradar, API-Football, Opta, etc.)
- A "Scoutastic" export/API if your organization can provide access
- Continuing to fetch matchday data manually via Claude.ai chat and dropping
  the resulting JSON into `data/`
