#!/usr/bin/env python3
"""
Builds a single self-contained HTML file (dist/matchday-explorer-standalone.html)
with CSS, JS, and the team/fixture JSON data all inlined — no local server or
fetch() to local files required, so it opens directly via file://.

Leaflet, Leaflet Routing Machine, and the OSRM routing API are still loaded
from their CDNs / public endpoints, so an internet connection is still
needed for the map tiles, routes, and combinable-trip calculations.

Run this again after changing data/*.json, css/*.css, js/spieltag-explorer.js,
or index.html to refresh the standalone file.
"""
import re
from pathlib import Path

root = Path(__file__).parent

css = (root / "css/variables.css").read_text() + "\n" + (root / "css/spieltag-explorer.css").read_text()
teams_json = (root / "data/teams.json").read_text()
fixtures_json = (root / "data/fixtures.json").read_text()

js = (root / "js/spieltag-explorer.js").read_text()

js, n = re.subn(
    r"^let TEAMS = \{\};\nlet FIXTURES = \{\};$",
    f"let TEAMS = {teams_json};\nlet FIXTURES = {fixtures_json};",
    js,
    count=1,
    flags=re.M,
)
if n != 1:
    raise SystemExit("Could not find the TEAMS/FIXTURES declaration to replace — source file changed?")

js, n = re.subn(
    r"// ===== Bootstrap: load data, then render =====\nasync function loadData\(\)\{.*?\}\n\nloadData\(\);",
    "// ===== Bootstrap: data is embedded above, render immediately =====\nonLeagueChange();",
    js,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit("Could not find the loadData() bootstrap to replace — source file changed?")

index_html = (root / "index.html").read_text()
body_match = re.search(r"<body>(.*)</body>", index_html, re.S)
if not body_match:
    raise SystemExit("Could not find <body>...</body> in index.html")
body = body_match.group(1)
body = re.sub(r"<script[^>]*>.*?</script>\s*", "", body, flags=re.S).strip()

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Matchday Explorer – Home Fixtures &amp; Scouting Routes</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.min.css" />
<style>
{css}
</style>
</head>
<body>
{body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.min.js"></script>
<script>
{js}
</script>
</body>
</html>
"""

out_dir = root / "dist"
out_dir.mkdir(exist_ok=True)
out_file = out_dir / "matchday-explorer-standalone.html"
out_file.write_text(html)
print(f"Built {out_file} ({out_file.stat().st_size:,} bytes)")
