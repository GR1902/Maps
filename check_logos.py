#!/usr/bin/env python3
"""
Checks every club logo in data/teams.json: reports clubs without a "logo" field
and logo links that no longer return an image (Wikipedia renames and replaces
crest files from time to time). Read-only: it changes nothing.

Usage:
    python3 check_logos.py

Exit code 0 = all logos present and reachable, 1 = problems found. To fix them,
look the club up on Wikipedia (infobox crest) and update the "logo" field;
fetch_logos.py can fill clubs that have no logo field at all.
"""
import concurrent.futures
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

TEAMS_PATH = Path(__file__).parent / "data" / "teams.json"
HEADERS = {"User-Agent": "MatchdayExplorerLogoCheck/1.0 (https://github.com/GR1902/Maps; logo audit)", "Accept": "image/*"}


def check(url):
    """Returns (url, problem) where problem is None if the URL serves an image."""
    problem = "unreachable"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=25) as r:
                if r.status == 200 and r.headers.get("Content-Type", "").startswith("image"):
                    return url, None
                return url, f"HTTP {r.status}, {r.headers.get('Content-Type', 'no content type')}"
        except urllib.error.HTTPError as e:
            if e.code == 429:  # rate limited: wait and retry
                time.sleep(3 + 3 * attempt)
                continue
            return url, f"HTTP {e.code}"
        except Exception as e:
            problem = str(e)[:60]
            time.sleep(1)
    return url, problem


def main():
    teams = json.load(open(TEAMS_PATH))
    urls, missing = {}, []
    for league, clubs in teams.items():
        for code, club in clubs.items():
            label = f"{league}/{code} ({club['name']})"
            if club.get("logo"):
                urls.setdefault(club["logo"], []).append(label)
            else:
                missing.append(label)

    broken = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for url, problem in pool.map(check, urls):
            if problem:
                broken[url] = problem

    total = sum(len(c) for c in teams.values())
    print(f"{total} clubs, {len(urls)} distinct logo links checked.")
    if missing:
        print(f"\n{len(missing)} clubs without a logo field:")
        for m in missing:
            print("  ", m)
    if broken:
        print(f"\n{len(broken)} logo links that do not return an image:")
        for url, problem in broken.items():
            print(f"   {problem}: {url}\n      used by: {', '.join(urls[url][:4])}")
    if not missing and not broken:
        print("All logos present and reachable.")
    return 1 if (missing or broken) else 0


if __name__ == "__main__":
    sys.exit(main())
