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
└── data/
    ├── teams.json             206 club/venue records, keyed by league → team code
    └── fixtures.json          129 fixtures, keyed by league, with matchday numbers
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

## Features
- League dropdown + matchday dropdown (populated dynamically per league)
- Shows selected league's home fixtures highlighted; other clubs of the same
  league in a pale shade; all other leagues' clubs in muted grey
- "Combinable trips" panel: cross-league clustering algorithm (Union-Find)
  that groups fixtures into feasible multi-stop scouting trips — same-day
  trips capped at 150 km, overnight/next-day trips allowed up to 500 km
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time)

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
| Primeira Liga, Eredivisie, Superliga (DEN) | MD 1–2/3 | High | Cross-verified against official calendars via press coverage |
| Pro League (BEL) | MD1 (+1 MD2 game) | High | 18 clubs (league expanded from 16) |
| Allsvenskan (SWE), Veikkausliiga (FIN) | Current round only | Medium | Calendar-year seasons already in progress; round numbers approximate |
| Eliteserien (NOR) | Round 18 | Medium | 1 of 8 fixtures (Bodø/Glimt–Start) uses a **placeholder date/time** — home/away was inferred from a season ground-pattern, not confirmed directly |

## The live sports-data gap

The current-season snapshots for the big 5 leagues were fetched using a
sports-data tool that's internal to the Claude.ai chat environment and is
not exposed via the Claude Code / API surface. To keep those leagues current
from here, you'll need one of:
- A licensed sports-data API (Sportradar, API-Football, Opta, etc.)
- A "Scoutastic" export/API if your organization can provide access
- Continuing to fetch matchday data manually via Claude.ai chat and dropping
  the resulting JSON into `data/`
