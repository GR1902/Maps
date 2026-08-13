#!/usr/bin/env python3
"""
Fetches a club crest URL per club in data/teams.json via Wikipedia's public
API (search by club name, take the page's main image) and writes it into
each club's "logo" field. Existing logo fields are left untouched unless
--refresh is passed. Hotlinks upload.wikimedia.org directly — nothing is
downloaded into this repo.

Usage:
    python3 fetch_logos.py                 # fill in only clubs missing a logo
    python3 fetch_logos.py --refresh        # re-fetch every club, overwriting

Wikipedia rate-limits fairly aggressively; this runs at ~1 request/sec with
retry+backoff on 429s, so a full run over ~500 clubs takes several minutes.
Coverage won't be 100% — some clubs (mostly obscure reserve/lower-league
sides) don't have a usable crest image on their Wikipedia page. Those are
left without a "logo" field, and the app falls back to a plain colored
marker for them automatically.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

TEAMS_PATH = Path(__file__).parent / "data" / "teams.json"
HEADERS = {"User-Agent": "NorwichScoutingMap-Research/1.0 (personal scouting-map project)"}


def api_get(params, retries=5):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(8 * (attempt + 1))
                continue
            raise


def find_logo(club_name):
    r = api_get({
        "action": "query", "generator": "search", "gsrsearch": club_name, "gsrlimit": 1,
        "prop": "pageimages", "piprop": "original", "pilicense": "any", "format": "json",
    })
    pages = r.get("query", {}).get("pages", {})
    for p in pages.values():
        src = p.get("original", {}).get("source")
        return src.split("?")[0] if src else None
    return None


def main():
    refresh = "--refresh" in sys.argv
    teams = json.load(open(TEAMS_PATH))

    todo = [
        (league, code, t)
        for league, clubs in teams.items()
        for code, t in clubs.items()
        if refresh or "logo" not in t
    ]
    print(f"Fetching logos for {len(todo)} clubs...", file=sys.stderr)

    fixed, missing = 0, []
    for i, (league, code, t) in enumerate(todo):
        try:
            url = find_logo(t["name"])
        except Exception as e:
            url = None
            missing.append(f"{league}/{code} ({t['name']}): {e}")
        if url:
            t["logo"] = url
            fixed += 1
        elif not url and f"{league}/{code}" not in str(missing):
            missing.append(f"{league}/{code} ({t['name']})")
        if (i + 1) % 20 == 0:
            print(f"{i + 1}/{len(todo)}...", file=sys.stderr)
        time.sleep(1.0)

    json.dump(teams, open(TEAMS_PATH, "w"), indent=2, ensure_ascii=False)

    total = sum(len(v) for v in teams.values())
    with_logo = sum(1 for lg in teams.values() for v in lg.values() if "logo" in v)
    print(f"\nFetched {fixed} new logos. Coverage: {with_logo}/{total} clubs.", file=sys.stderr)
    if missing:
        print(f"No logo found for {len(missing)} clubs:", file=sys.stderr)
        for m in missing:
            print(" -", m, file=sys.stderr)


if __name__ == "__main__":
    main()
