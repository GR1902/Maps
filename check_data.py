#!/usr/bin/env python3
"""
Consistency check for the Matchday Explorer data, run by GitHub Actions on every
push and pull request (and weekly) and usable by hand before committing.
Read-only: it changes nothing.

Usage:
    python3 check_data.py                    # errors fail (exit 1), warnings do not
    python3 check_data.py --max-age-days 10  # also fail when data/meta.json "checked" is older

What is an ERROR (the app would show wrong or broken data):
  - a JSON file that does not parse, or a missing/wrong field
  - a fixture whose home/away code is not in teams.json for that league, a club playing itself
  - the same game twice (same pairing and start, or same pairing and matchday)
  - the same pairing twice within 21 days in a domestic league (a game stored under two
    matchday numbers, as happened once in the Scottish Premiership)
  - a club twice in one matchday, or two games of a club less than 20 h apart (domestic
    leagues; UEFA matchday 1 = qualifying rounds is exempt)
  - more games in a matchday than teams/2 (domestic leagues)
  - a league without a label, country or time zone mapping in js/spieltag-explorer.js
  - a file referenced by index.html, sw.js or manifest.webmanifest that does not exist
  - a review_queue.json item for an unknown league, a malformed changelog.json

What is only a WARNING (worth a look, never blocks):
  - unverified flags on games that have already been played (counted per league)
  - a matchday of 4+ games that all share one start time at a typical placeholder hour
  - a club without a logo (check_logos.py audits the links), a domestic club without any game
  - "checked" in meta.json in the future

Incomplete matchdays are listed as notes: leagues publish their rounds piece by piece.
"""
import argparse
import collections
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
JS = ROOT / "js" / "spieltag-explorer.js"

errors, warnings, notes = [], [], []


def err(where, msg):
    errors.append((where, msg))


def warn(where, msg):
    warnings.append((where, msg))


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        err(str(path.relative_to(ROOT)), "file is missing")
    except ValueError as e:
        err(str(path.relative_to(ROOT)), f"not valid JSON: {e}")
    return None


def parse_utc(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def js_tables():
    """COUNTRY_TAG, COUNTRY_TZ and LEAGUE_LABELS as the app defines them."""
    src = JS.read_text(encoding="utf-8")

    def block(name):
        m = re.search(r"const %s = \{(.*?)\n?\};" % name, src, re.S)
        return m.group(1) if m else ""

    tag = dict(re.findall(r"(\w+):\s*\"([A-Z]{3})\"", block("COUNTRY_TAG")))
    tz = dict(re.findall(r"([A-Z]{3}):\s*'([^']+)'", block("COUNTRY_TZ")))
    labels = set(re.findall(r"(\w+):\s*\"", block("LEAGUE_LABELS")))
    if not tag or not tz or not labels:
        err("js/spieltag-explorer.js", "could not read COUNTRY_TAG / COUNTRY_TZ / LEAGUE_LABELS")
    return tag, tz, labels


UEFA = {"champions_league", "europa_league", "conference_league", "youth_league"}
PLACEHOLDER_HOURS = {(23, 0), (0, 0), (22, 0), (1, 0)}  # UTC; what unscheduled rounds often show
SEASON_START = dt.datetime(2026, 7, 1, tzinfo=dt.timezone.utc)
SEASON_END = dt.datetime(2027, 7, 15, tzinfo=dt.timezone.utc)
CODE_RE = re.compile(r"^[A-Z0-9]{2,5}(_[A-Z0-9]{1,2})?$")  # HAC_S etc. separate clubs that share a code
START_RE = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\+00:00|Z)$")


def check_teams(teams):
    where = "data/teams.json"
    for league, clubs in teams.items():
        if not isinstance(clubs, dict) or not clubs:
            err(where, f"{league}: no clubs")
            continue
        names = collections.defaultdict(list)
        for code, c in clubs.items():
            tag = f"{league}/{code}"
            if not CODE_RE.match(code):
                err(where, f"{tag}: odd team code")
            if not isinstance(c, dict):
                err(where, f"{tag}: not an object")
                continue
            for k in ("name", "city"):
                if not isinstance(c.get(k), str) or not c[k].strip():
                    err(where, f"{tag}: missing {k}")
            lat, lng = c.get("lat"), c.get("lng")
            if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (lat, lng)):
                err(where, f"{tag}: lat/lng missing or not numbers")
            elif not (25 <= lat <= 72 and -30 <= lng <= 80):
                err(where, f"{tag} ({c.get('name')}): coordinates {lat}, {lng} are outside Europe (swapped?)")
            logo = c.get("logo")
            if not logo:
                warn(where, f"{tag} ({c.get('name')}): no logo")
            elif not str(logo).startswith("https://"):
                err(where, f"{tag}: logo is not an https link")
            if isinstance(c.get("name"), str):
                names[c["name"].strip().lower()].append(code)
        for n, codes in names.items():
            if len(codes) > 1:
                err(where, f"{league}: club name '{n}' used for several codes {codes}")


def check_fixtures(teams, fixtures, tag_map, tz_map, labels):
    where = "data/fixtures.json"
    now = dt.datetime.now(dt.timezone.utc)
    for league in fixtures:
        if league not in teams:
            err(where, f"league {league} has fixtures but no entry in teams.json")
    for league in teams:
        if league not in fixtures:
            err(where, f"league {league} is in teams.json but has no fixtures")
        if league not in labels:
            err("js/spieltag-explorer.js", f"league {league} has no entry in LEAGUE_LABELS")
        if league not in tag_map and league not in UEFA:
            err("js/spieltag-explorer.js", f"league {league} is neither in COUNTRY_TAG nor a UEFA competition")
    for league, country in tag_map.items():
        if country not in tz_map:
            err("js/spieltag-explorer.js", f"{league}: country {country} (COUNTRY_TAG) has no time zone in COUNTRY_TZ")

    for league, games in fixtures.items():
        if league not in teams:
            continue
        clubs = teams[league]
        domestic = league in tag_map
        per_md = collections.defaultdict(list)
        per_club = collections.defaultdict(list)
        pairs = collections.defaultdict(list)
        seen = set()
        played_clubs = set()
        stale_flags = 0
        for g in games:
            ref = f"{league} MD{g.get('matchday')} {g.get('home')}-{g.get('away')}"
            extra = set(g) - {"home", "away", "start", "matchday", "unverified"}
            missing = {"home", "away", "start", "matchday"} - set(g)
            if extra or missing:
                err(where, f"{ref}: wrong fields (extra {sorted(extra)}, missing {sorted(missing)})")
                continue
            h, a = g["home"], g["away"]
            for side, c in (("home", h), ("away", a)):
                if c not in clubs:
                    err(where, f"{ref}: {side} code {c} is not in teams.json for {league}")
            if h == a:
                err(where, f"{ref}: a club plays itself")
            md = g["matchday"]
            if not isinstance(md, int) or isinstance(md, bool) or md < 1:
                err(where, f"{ref}: matchday must be a whole number from 1")
                continue
            if not isinstance(g["start"], str) or not START_RE.match(g["start"]):
                err(where, f"{ref}: start '{g['start']}' is not an ISO UTC time")
                continue
            start = parse_utc(g["start"])
            if not SEASON_START <= start <= SEASON_END:
                err(where, f"{ref}: start {g['start']} is outside the 2026/27 season")
            if start.minute % 5:
                warn(where, f"{ref}: odd kickoff minute {g['start']}")
            if "unverified" in g:
                if g["unverified"] is not True:
                    err(where, f"{ref}: unverified must be true or absent")
                elif start < now - dt.timedelta(hours=3):
                    stale_flags += 1
            key = (h, a, g["start"])
            if key in seen:
                err(where, f"{ref}: listed twice at {g['start']}")
            seen.add(key)
            per_md[md].append((g, start))
            pairs[(h, a)].append((md, start))
            played_clubs.update((h, a))
            for c in (h, a):
                per_club[c].append((md, start))

        if stale_flags:
            warn(where, f"{league}: {stale_flags} played game(s) still carry the unverified flag (harmless, the app only warns for upcoming games)")

        for pair, items in pairs.items():
            mds = collections.Counter(m for m, _ in items)
            for m, n in mds.items():
                if n > 1:
                    err(where, f"{league} MD{m} {pair[0]}-{pair[1]}: pairing appears {n} times in one matchday")
            items.sort(key=lambda x: x[1])
            if domestic:
                for (m1, s1), (m2, s2) in zip(items, items[1:]):
                    if (s2 - s1) < dt.timedelta(days=21):
                        err(where, f"{league} {pair[0]}-{pair[1]}: stored for MD{m1} ({s1:%d %b}) and MD{m2} ({s2:%d %b}), less than 21 days apart (same game twice?)")

        for md, items in per_md.items():
            counts = collections.Counter(c for g, _ in items for c in (g["home"], g["away"]))
            for c, n in counts.items():
                if n > 1 and (domestic or md > 1):
                    err(where, f"{league} MD{md}: {c} plays {n} times in one matchday")
            if domestic and len(items) > len(clubs) // 2:
                err(where, f"{league} MD{md}: {len(items)} games for {len(clubs)} clubs (at most {len(clubs) // 2})")
            starts = {s for _, s in items}
            if len(items) >= 4 and len(starts) == 1:
                s = next(iter(starts))
                if (s.hour, s.minute) in PLACEHOLDER_HOURS:
                    warn(where, f"{league} MD{md}: all {len(items)} games at {s:%H:%M} UTC on {s:%d %b}, looks like a placeholder time")

        if domestic:
            for c, items in per_club.items():
                items.sort(key=lambda x: x[1])
                for (m1, s1), (m2, s2) in zip(items, items[1:]):
                    if (s2 - s1) < dt.timedelta(hours=20):
                        err(where, f"{league}: {c} has two games less than 20 h apart (MD{m1} {s1:%d %b %H:%M} and MD{m2} {s2:%d %b %H:%M})")
            for c in clubs:
                if c not in played_clubs:
                    warn(where, f"{league}: {c} ({clubs[c].get('name')}) has no game at all")
            mx = max((md for md in per_md), default=0)
            partial = sorted(md for md, items in per_md.items() if md < mx and len(items) < len(clubs) // 2)
            if partial:
                notes.append(f"{league}: incomplete matchdays {partial} of {len(clubs) // 2} games each (postponed or not yet published)")

        # a hosting club needs a time zone, taken from the league's country or the club's own
        for club in {g["home"] for g in games if g.get("home") in clubs}:
            country = tag_map.get(league) or clubs[club].get("country")
            if country not in tz_map:
                err(where, f"{league}/{club}: no time zone (country '{country}' is not in COUNTRY_TZ)")


def check_small_files(teams, fixtures):
    leagues = load(DATA / "leagues.json")
    if isinstance(leagues, dict):
        for l in fixtures:
            if l not in leagues:
                warn("data/leagues.json", f"{l}: no competition logo")
        for l, url in leagues.items():
            if l not in fixtures:
                err("data/leagues.json", f"{l}: not a known league")
            if not str(url).startswith("https://"):
                err("data/leagues.json", f"{l}: logo is not an https link")

    meta = load(DATA / "meta.json")
    checked = None
    if isinstance(meta, dict):
        try:
            checked = dt.date.fromisoformat(meta.get("checked", ""))
        except ValueError:
            err("data/meta.json", f"'checked' must be YYYY-MM-DD, got {meta.get('checked')!r}")
        if checked and checked > dt.datetime.now(dt.timezone.utc).date() + dt.timedelta(days=1):
            warn("data/meta.json", f"'checked' {checked} is in the future")

    queue = load(DATA / "review_queue.json")
    if isinstance(queue, dict):
        ids = set()
        for it in queue.get("items", []):
            ref = f"{it.get('id')}"
            for k in ("id", "league", "matchday", "type", "priority", "note", "added"):
                if k not in it:
                    err("data/review_queue.json", f"{ref}: missing {k}")
            if it.get("league") not in teams and it.get("league") != "multiple":
                err("data/review_queue.json", f"{ref}: unknown league {it.get('league')}")
            if it.get("id") in ids:
                err("data/review_queue.json", f"{ref}: duplicate id")
            ids.add(it.get("id"))
    else:
        err("data/review_queue.json", "expected an object with an 'items' list")

    scouts = load(DATA / "scouts.json")
    if isinstance(scouts, list):
        if len(set(scouts)) != len(scouts) or not all(isinstance(s, str) and 0 < len(s.strip()) <= 60 for s in scouts):
            err("data/scouts.json", "names must be unique, non-empty strings of at most 60 characters")
    else:
        err("data/scouts.json", "expected a list of names")

    airports = load(DATA / "airports.json")
    if isinstance(airports, list):
        iatas = [a.get("iata") for a in airports]
        for a in airports:
            if not re.match(r"^[A-Z]{3}$", str(a.get("iata"))) or not isinstance(a.get("lat"), (int, float)) or not isinstance(a.get("lng"), (int, float)):
                err("data/airports.json", f"{a.get('name')}: needs a 3-letter iata plus numeric lat/lng")
        for i in {i for i in iatas if iatas.count(i) > 1}:
            err("data/airports.json", f"iata {i} appears twice")
    else:
        err("data/airports.json", "expected a list")

    changelog = load(DATA / "changelog.json")
    if isinstance(changelog, dict):
        for e in changelog.get("entries", []):
            try:
                parse_utc(e["at"])
            except Exception:
                err("data/changelog.json", f"entry {e.get('sha')}: bad 'at'")
            for c in e.get("changes", []):
                if c.get("t") not in ("new", "time", "removed") or c.get("l") not in fixtures:
                    err("data/changelog.json", f"entry {e.get('sha')}: unknown change {c}")
    elif changelog is not None:
        err("data/changelog.json", "expected an object with an 'entries' list")
    return checked


def check_app_files():
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    for ref in re.findall(r"""(?:src|href)=["']([^"':#?]+)["']""", index):
        if not (ROOT / ref).exists():
            err("index.html", f"references {ref}, which does not exist")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    m = re.search(r"const APP_FILES = \[(.*?)\];", sw, re.S)
    for ref in re.findall(r"'([^']+)'", m.group(1) if m else ""):
        # the changelog is optional on purpose: a missing file must not break the install
        if ref != "./" and ref != "data/changelog.json" and not (ROOT / ref).exists():
            err("sw.js", f"APP_FILES lists {ref}, which does not exist")
    manifest = load(ROOT / "manifest.webmanifest")
    if isinstance(manifest, dict):
        for icon in manifest.get("icons", []):
            if not (ROOT / icon.get("src", "")).exists():
                err("manifest.webmanifest", f"icon {icon.get('src')} does not exist")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-age-days", type=int, default=None,
                    help="fail when data/meta.json 'checked' is older than this many days")
    args = ap.parse_args()

    teams = load(DATA / "teams.json")
    fixtures = load(DATA / "fixtures.json")
    if isinstance(teams, dict) and isinstance(fixtures, dict):
        tag_map, tz_map, labels = js_tables()
        check_teams(teams)
        check_fixtures(teams, fixtures, tag_map, tz_map, labels)
        checked = check_small_files(teams, fixtures)
        if args.max_age_days is not None and checked:
            age = (dt.datetime.now(dt.timezone.utc).date() - checked).days
            if age > args.max_age_days:
                err("data/meta.json", f"fixtures were last checked {age} days ago ({checked}); the weekly verification has not run")
        n_games = sum(len(v) for v in fixtures.values())
        print(f"Checked {len(teams)} leagues, {sum(len(v) for v in teams.values())} clubs, {n_games} fixtures.")
    else:
        err("data", "teams.json or fixtures.json could not be read")
    check_app_files()

    gha = os.environ.get("GITHUB_ACTIONS") == "true"

    def annotate(kind, where, msg):
        if gha:
            esc = msg.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::{kind} file={where}::{esc}")

    for where, msg in errors:
        print(f"ERROR   {where}: {msg}")
        annotate("error", where, msg)
    for where, msg in warnings:
        print(f"WARNING {where}: {msg}")
        annotate("warning", where, msg)
    for n in notes:
        print(f"note    {n}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s), {len(notes)} note(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
