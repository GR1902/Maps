#!/usr/bin/env python3
"""
Fetches a competition-logo URL per league (not per club — see fetch_logos.py
for that) via Wikipedia's public API, using each league's Wikipedia page
title directly (more reliable than free-text search, since e.g. "Bundesliga"
as a search term can resolve to the country rather than the competition).
Writes data/leagues.json as {code: logoUrl}. Hotlinks upload.wikimedia.org
directly — nothing is downloaded into this repo.

Usage:
    python3 fetch_league_logos.py
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUT_PATH = Path(__file__).parent / "data" / "leagues.json"
HEADERS = {"User-Agent": "NorwichScoutingMap-Research/1.0 (personal scouting-map project)"}

LEAGUE_WIKI_TITLE = {
    "epl": "Premier League",
    "championship": "EFL Championship",
    "league_one": "EFL League One",
    "la_liga": "La Liga",
    "la_liga_2": "Segunda División",
    "bundesliga": "Bundesliga",
    "bundesliga_2": "2. Bundesliga",
    "liga3_de": "3. Liga",
    "serie_a": "Serie A",
    "serie_b": "Serie B",
    "ligue_1": "Ligue 1",
    "ligue_2": "Ligue 2",
    "primeira_liga": "Primeira Liga",
    "eredivisie": "Eredivisie",
    "eerste_divisie": "Eerste Divisie",
    "pro_league": "Belgian Pro League",
    "challenger_pro_league": "Challenger Pro League",
    "allsvenskan": "Allsvenskan",
    "eliteserien": "Eliteserien",
    "superliga": "Danish Superliga",
    "veikkausliiga": "Veikkausliiga",
    "scottish_prem": "Scottish Premiership",
    "swiss_super_league": "Swiss Super League",
    "austrian_bundesliga": "Austrian Football Bundesliga",
    "super_league_greece": "Super League Greece",
    "super_lig": "Süper Lig",
    "ekstraklasa": "Ekstraklasa",
    "czech_first_league": "Czech First League",
    "croatian_hnl": "Croatian Football League",
}


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


def find_logo(title):
    r = api_get({
        "action": "query", "titles": title, "redirects": 1,
        "prop": "pageimages", "piprop": "original", "pilicense": "any", "format": "json",
    })
    pages = r.get("query", {}).get("pages", {})
    for p in pages.values():
        src = p.get("original", {}).get("source")
        return src.split("?")[0] if src else None
    return None


def main():
    leagues = {}
    missing = []
    for i, (code, title) in enumerate(LEAGUE_WIKI_TITLE.items()):
        try:
            url = find_logo(title)
        except Exception as e:
            url = None
            print(f"error on {code} ({title}): {e}", file=sys.stderr)
        if url:
            leagues[code] = url
        else:
            missing.append(f"{code} ({title})")
        if (i + 1) % 10 == 0:
            print(f"{i + 1}/{len(LEAGUE_WIKI_TITLE)}...", file=sys.stderr)
        time.sleep(1.0)

    json.dump(leagues, open(OUT_PATH, "w"), indent=2, ensure_ascii=False)
    print(f"\nFetched {len(leagues)}/{len(LEAGUE_WIKI_TITLE)} league logos.", file=sys.stderr)
    if missing:
        print("No logo found for:", file=sys.stderr)
        for m in missing:
            print(" -", m, file=sys.stderr)


if __name__ == "__main__":
    main()
