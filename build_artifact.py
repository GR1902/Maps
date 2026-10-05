#!/usr/bin/env python3
"""
Builds the self-contained artifact edition (no fetch/CDN/live routing) by
inlining CSS, JS, the pre-projected Europe SVG paths, and the current
data/*.json into artifact_src/index_template.html.

Re-run after changing artifact_src/*, data/*.json, or the map projection.
"""
from pathlib import Path

root = Path(__file__).parent
src = root / "artifact_src"

css = (src / "style.css").read_text()
js = (src / "app.js").read_text()
svg_paths = (src / "europe_paths.svg").read_text()
teams_json = (root / "data/teams.json").read_text()
fixtures_json = (root / "data/fixtures.json").read_text()

template = (src / "index_template.html").read_text()
html = (template
    .replace("__CSS__", css)
    .replace("__SVG_PATHS__", svg_paths)
    .replace("__TEAMS_JSON__", teams_json)
    .replace("__FIXTURES_JSON__", fixtures_json)
    .replace("__JS__", js)
)

out_dir = root / "dist"
out_dir.mkdir(exist_ok=True)
out_file = out_dir / "matchday-explorer-artifact.html"
out_file.write_text(html)
print(f"Built {out_file} ({out_file.stat().st_size:,} bytes)")
