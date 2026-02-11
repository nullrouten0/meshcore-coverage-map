#!/usr/bin/env python3
"""
Build "Top Repeaters" stats from the /get-samples API.

This mirrors the map's Top Repeaters logic:
- group samples by 6-char geohash prefix (coverage tile)
- for each tile, collect unique repeater IDs seen in sample path
- count how many tiles each repeater appears in
- sort descending by tile count

Usage:
  python3 scripts/top-repeaters-from-samples.py --url http://localhost:3000/get-samples
  python3 scripts/top-repeaters-from-samples.py --url https://example.com/get-samples --limit 25
  python3 scripts/top-repeaters-from-samples.py --url https://example.com/get-samples --prefix c23n
"""

import argparse
import json
import sys
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
from urllib.request import Request, urlopen

DEFAULT_URL = "http://localhost:3000/get-samples"
DEFAULT_LIMIT = 50


def build_url(base_url: str, prefix: Optional[str]) -> str:
    parsed = urlparse(base_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if prefix:
        query["p"] = prefix

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(query),
            parsed.fragment,
        )
    )


def fetch_samples(url: str) -> Dict[str, Any]:
    request = Request(url, headers={"Accept": "application/json"})

    with urlopen(request) as response:  # nosec B310 - endpoint is user-provided by design
        status = getattr(response, "status", None)
        if status is not None and status >= 400:
            raise RuntimeError(f"HTTP {status}")

        payload = response.read().decode("utf-8")

    data = json.loads(payload)
    if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
        raise RuntimeError("Invalid response payload (expected { keys: [...] })")

    return data


def get_sample_geohash(sample: Dict[str, Any]) -> Optional[str]:
    name = sample.get("name")
    if isinstance(name, str) and name:
        return name

    flat_hash = sample.get("hash")
    if isinstance(flat_hash, str) and flat_hash:
        return flat_hash

    return None


def get_sample_path(sample: Dict[str, Any]) -> List[Any]:
    metadata = sample.get("metadata")
    if isinstance(metadata, dict):
        metadata_path = metadata.get("path")
        if isinstance(metadata_path, list):
            return metadata_path

    flat_path = sample.get("path")
    if isinstance(flat_path, list):
        return flat_path

    if isinstance(metadata, dict):
        legacy_metadata_path = metadata.get("rptr")
        if isinstance(legacy_metadata_path, list):
            return legacy_metadata_path

    legacy_flat_path = sample.get("rptr")
    if isinstance(legacy_flat_path, list):
        return legacy_flat_path

    return []


def compute_top_repeaters(samples: List[Dict[str, Any]]) -> Dict[str, Any]:
    # geohashPrefix -> Set[repeaterId]
    tile_to_repeaters: Dict[str, set] = {}

    for sample in samples:
        if not isinstance(sample, dict):
            continue

        geohash = get_sample_geohash(sample)
        if not geohash or len(geohash) < 6:
            continue

        tile = geohash[:6]
        path = get_sample_path(sample)

        if tile not in tile_to_repeaters:
            tile_to_repeaters[tile] = set()

        bucket = tile_to_repeaters[tile]
        for raw_id in path:
            if raw_id is None:
                continue
            repeater_id = str(raw_id).lower()
            if repeater_id:
                bucket.add(repeater_id)

    # repeaterId -> tileCount
    repeater_tile_counts: Dict[str, int] = {}
    for repeater_set in tile_to_repeaters.values():
        for repeater_id in repeater_set:
            repeater_tile_counts[repeater_id] = repeater_tile_counts.get(repeater_id, 0) + 1

    rows = [
        {"id": repeater_id, "geohashCount": count}
        for repeater_id, count in repeater_tile_counts.items()
    ]
    rows.sort(key=lambda r: (-r["geohashCount"], r["id"]))

    return {
        "rows": rows,
        "stats": {
            "sampleCount": len(samples),
            "coverageTileCount": len(tile_to_repeaters),
            "repeaterCount": len(rows),
        },
    }


def print_table(rows: List[Dict[str, Any]], stats: Dict[str, int], source_url: str) -> None:
    print(f"Source: {source_url}")
    print(f"Samples: {stats['sampleCount']}")
    print(f"Coverage tiles (6-char geohash): {stats['coverageTileCount']}")
    print(f"Repeaters with coverage: {stats['repeaterCount']}")
    print("")

    if not rows:
        print("No repeater coverage found in samples.")
        return

    header = f"{'#':>4}  {'Repeater':<12}  CoverageTiles"
    print(header)
    print("-" * len(header))

    for idx, row in enumerate(rows, start=1):
        repeater_id = str(row.get("id", ""))
        geohash_count = row.get("geohashCount", 0)
        print(f"{idx:>4}  {repeater_id:<12}  {geohash_count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute Top Repeaters from /get-samples")
    parser.add_argument("--url", default=DEFAULT_URL, help="Full /get-samples endpoint URL")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max rows to print")
    parser.add_argument("--prefix", default=None, help="Optional geohash prefix filter (?p=<prefix>)")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a table")
    args = parser.parse_args()

    if args.limit < 1:
        args.limit = DEFAULT_LIMIT

    return args


def main() -> int:
    args = parse_args()
    query_url = build_url(args.url, args.prefix)

    data = fetch_samples(query_url)
    samples = data["keys"]
    result = compute_top_repeaters(samples)

    top_rows = result["rows"][: args.limit]
    if args.json:
        output = {
            "source": query_url,
            "stats": result["stats"],
            "topRepeaters": top_rows,
        }
        print(json.dumps(output, indent=2))
    else:
        print_table(top_rows, result["stats"], query_url)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
