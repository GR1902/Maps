# Norwich City Scouting Map

Two Leaflet-based tools for planning European scouting trips: a static club
map and a matchday-aware fixture/route explorer. Norwich City brand colors
throughout (canary yellow `#FFF200` / green `#00622F`).

## Project structure

```
norwich-scouting-map/
├── index.html                 Landing page linking both tools
├── europa-ligen-karte.html    Tool 1: static club map
├── spieltag-explorer.html     Tool 2: matchday explorer + routing
├── css/
│   ├── variables.css          Shared design tokens (colors)
│   ├── europa-karte.css       Styles for tool 1
│   └── spieltag-explorer.css  Styles for tool 2
├── js/
│   ├── europa-karte.js        Logic for tool 1 (fetches data/clubs_europe.json)
│   └── spieltag-explorer.js   Logic for tool 2 (fetches data/teams.json + data/fixtures.json)
└── data/
    ├── clubs_europe.json      204 clubs, 12 countries' top flights (stadium coords)
    ├── teams.json              206 club/venue records, keyed by league → team code
    └── fixtures.json          129 fixtures, keyed by league, with matchday numbers
```

Leaflet + Leaflet Routing Machine are loaded via CDN (unchanged from the
original prototypes). Everything else is local.

## Running locally

Both pages load their data via `fetch()`, which requires an HTTP server —
opening the HTML files directly (`file://`) will not work. From the project
root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Tool 1 — `europa-ligen-karte.html`
Static map of all 204 clubs across 12 countries' top divisions. Features:
- Country filter panel (toggle countries on/off)
- Club name labels permanently shown under each marker
- Point-to-point route planning (click marker → "+ Add to route" → real
  driving route via OSRM, with distance/time)

## Tool 2 — `spieltag-explorer.html`
Matchday-aware version for 12 leagues. Features:
- League dropdown + matchday dropdown (populated dynamically per league)
- Shows selected league's home fixtures highlighted; other clubs of the same
  league in a pale shade; all other leagues' clubs in muted grey
- "Combinable trips" panel: cross-league clustering algorithm (Union-Find)
  that groups fixtures into feasible multi-stop scouting trips — same-day
  trips capped at 150 km, overnight/next-day trips allowed up to 500 km
- Same point-to-point routing feature as tool 1, works across leagues

## Data structure

**`clubs_europe.json`** — flat array:
```json
{ "club": "FC Porto", "city": "Porto", "country": "Portugal",
  "league": "Primeira Liga", "lat": 41.16177, "lng": -8.583591 }
```

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

The two original prototypes (self-contained HTML artifacts with inline data)
had two latent bugs, fixed while splitting out the data/CSS/JS:

- **Country colors in the club map**: `COUNTRY_COLORS` used German country
  names ("Spanien", "Deutschland", ...) as keys, but the club data uses
  English names ("Spain", "Germany", ...). Only England and Portugal ever
  matched, so every other country's markers silently fell back to grey.
  Fixed by using English keys.
- **Missing `--gold` CSS variable in the matchday explorer**: the stylesheet
  defined `--yellow` in `:root` but referenced `var(--gold)` (undefined) for
  the route panel header/title and the "+ Add to route" button, so those
  elements lost their yellow styling. Fixed by unifying both stylesheets on
  a single shared `--gold` token in `css/variables.css`.

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

**`clubs_europe.json` vs `teams.json` roster inconsistency:** these two files
were built at different points during the original prototyping and may have
slightly different rosters for the same league (e.g. Bundesliga, Eredivisie).
`teams.json` (from the matchday explorer) is the more recently verified one.
Reconciling these into one canonical roster per league is still an open task.

## The live sports-data gap

The current-season snapshots for the big 5 leagues were fetched using a
sports-data tool that's internal to the Claude.ai chat environment and is
not exposed via the Claude Code / API surface. To keep those leagues current
from here, you'll need one of:
- A licensed sports-data API (Sportradar, API-Football, Opta, etc.)
- A "Scoutastic" export/API if your organization can provide access
- Continuing to fetch matchday data manually via Claude.ai chat and dropping
  the resulting JSON into `data/`

## Suggested next steps

1. Reconcile `clubs_europe.json` and `teams.json` into one source of truth
2. Decide on a real data-refresh strategy (see gap above) before relying on
   this for live scouting trip planning
