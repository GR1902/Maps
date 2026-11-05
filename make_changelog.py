#!/usr/bin/env python3
"""
Compares two versions of data/fixtures.json and records what changed for
upcoming games in data/changelog.json, which the app shows as "N changes since
your last visit".

What is recorded (only for games that were still ahead at the time):
  time     a kickoff moved (same pairing and matchday, different start)
  new      games were added (one record per league and matchday, with the count)
  removed  a game was removed
Not recorded: changes to games already played, "unverified" flag changes, and
pure renumbering of a matchday (same pairing, same start, other matchday number).

Usage:
    python3 make_changelog.py --before <git-ref> [--after <git-ref>] [--write]

  --before   the older version (commit, tag or branch), e.g. HEAD~1 or github.event.before
  --after    the newer version, default HEAD
  --write    append the entry to data/changelog.json (without it the entry is only printed)

One entry is added per run, stamped with the commit time of --after and its short
hash; running it again for the same --after is a no-op. Entries older than 60 days
(and anything beyond 300 entries) are dropped. Short keys keep the file small:
  t type, l league code, m matchday, h home code, a away code, n number of new games,
  from/to = old and new start (time) or first and last start (new), s = start (removed)
"""
import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
CHANGELOG = ROOT / "data" / "changelog.json"
MAX_AGE_DAYS = 60
MAX_ENTRIES = 300


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def fixtures_at(ref):
    try:
        return json.loads(git("show", f"{ref}:data/fixtures.json"))
    except subprocess.CalledProcessError:
        return None  # file did not exist at that ref


def parse(iso):
    # Python before 3.11 does not read a trailing "Z"
    return datetime.datetime.fromisoformat(iso[:-1] + "+00:00" if iso.endswith("Z") else iso).astimezone(datetime.timezone.utc)


def index(fixtures):
    out = {}
    for league, games in fixtures.items():
        for g in games:
            out[(league, g["matchday"], g["home"], g["away"])] = g["start"]
    return out


def diff(before, after, at):
    """Changes between two fixture sets that matter for games still ahead at time `at`."""
    old, new = index(before), index(after)
    ahead = lambda iso: parse(iso) > at
    changes = []
    removed = {k: v for k, v in old.items() if k not in new}
    added = {k: v for k, v in new.items() if k not in old}
    for key in sorted(set(old) & set(new)):
        if old[key] != new[key] and parse(old[key]) != parse(new[key]) and (ahead(old[key]) or ahead(new[key])):
            league, md, home, away = key
            changes.append({"t": "time", "l": league, "m": md, "h": home, "a": away, "from": old[key], "to": new[key]})
    # a game that vanished under one matchday number and appeared under another
    by_pair_removed, by_pair_added = {}, {}
    for (league, md, home, away), start in removed.items():
        by_pair_removed.setdefault((league, home, away), []).append((md, start))
    for (league, md, home, away), start in added.items():
        by_pair_added.setdefault((league, home, away), []).append((md, start))
    for pair, gone in list(by_pair_removed.items()):
        came = by_pair_added.get(pair)
        if len(gone) == 1 and came and len(came) == 1:
            (old_md, old_start), (new_md, new_start) = gone[0], came[0]
            by_pair_removed.pop(pair); by_pair_added.pop(pair)
            if parse(old_start) != parse(new_start) and (ahead(old_start) or ahead(new_start)):
                league, home, away = pair
                changes.append({"t": "time", "l": league, "m": new_md, "h": home, "a": away, "from": old_start, "to": new_start})
            # same start: only renumbered, nothing the user needs to know
    # new games are summed up per league and matchday (a whole round is added at once)
    fresh = {}
    for (league, home, away), items in sorted(by_pair_added.items()):
        for md, start in items:
            if ahead(start):
                fresh.setdefault((league, md), []).append((home, away, start))
    for (league, md), games in sorted(fresh.items()):
        starts = sorted(g[2] for g in games)
        entry = {"t": "new", "l": league, "m": md, "n": len(games), "from": starts[0], "to": starts[-1]}
        if len(games) == 1:
            entry["h"], entry["a"] = games[0][0], games[0][1]
        changes.append(entry)
    for (league, home, away), items in sorted(by_pair_removed.items()):
        for md, start in items:
            if ahead(start):
                changes.append({"t": "removed", "l": league, "m": md, "h": home, "a": away, "s": start})
    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", default="HEAD")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    before, after = fixtures_at(args.before), fixtures_at(args.after)
    if before is None or after is None:
        print("fixtures.json missing at one of the refs; nothing to compare")
        return 0
    at = parse(git("show", "-s", "--format=%cI", args.after).strip())
    sha = git("rev-parse", "--short", args.after).strip()
    changes = diff(before, after, at)
    print(f"{sha} ({at:%Y-%m-%d %H:%M} UTC): {len(changes)} change(s)")
    for c in changes:
        print("  ", json.dumps(c, ensure_ascii=False))
    if not args.write:
        return 0

    data = json.loads(CHANGELOG.read_text()) if CHANGELOG.exists() else {"entries": []}
    entries = data.setdefault("entries", [])
    if any(e.get("sha") == sha for e in entries):
        print("entry for this commit already recorded")
        return 0
    if changes:
        entries.append({"at": at.strftime("%Y-%m-%dT%H:%M:%SZ"), "sha": sha, "changes": changes})
    cutoff = at - datetime.timedelta(days=MAX_AGE_DAYS)
    entries[:] = [e for e in entries if parse(e["at"]) >= cutoff][-MAX_ENTRIES:]
    data["_comment"] = ("Fixture changes for upcoming games, written by make_changelog.py after each data push; "
                        "the app shows what is new since the visitor's last visit.")
    CHANGELOG.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {CHANGELOG.relative_to(ROOT)} ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
