#!/usr/bin/env python3
"""Compare two CSV snapshots and emit deterministic reconciliation evidence."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


def split_columns(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        fields = [field.strip() for field in reader.fieldnames]
        if any(not field for field in fields):
            raise ValueError(f"CSV has an empty header: {path}")
        duplicate_fields = sorted(field for field, count in Counter(fields).items() if count > 1)
        if duplicate_fields:
            raise ValueError(
                f"CSV has duplicate headers after normalization: {', '.join(duplicate_fields)}"
            )
        reader.fieldnames = fields
        rows = []
        for raw in reader:
            rows.append({field: (raw.get(field) or "").strip() for field in fields})
        return fields, rows


def signature(row: dict[str, str], columns: Iterable[str]) -> str:
    payload = json.dumps([row.get(column, "") for column in columns], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def key_for(row: dict[str, str], keys: list[str]) -> str:
    return "|".join(row.get(key, "") for key in keys)


def profile_nulls(rows: list[dict[str, str]], fields: list[str], null_values: set[str]) -> dict[str, int]:
    return {
        field: sum(1 for row in rows if row.get(field, "").strip().lower() in null_values)
        for field in fields
    }


def sample(items: Iterable[object], limit: int) -> list[object]:
    return list(items)[:limit]


def redact_key(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    return f"sha256:{digest}"


def redact_duplicate_sample(items: Iterable[tuple[str, int]], limit: int) -> list[dict[str, object]]:
    return [
        {"key_hash": redact_key(key), "count": count}
        for key, count in list(items)[:limit]
    ]


def reconcile(args: argparse.Namespace) -> tuple[dict[str, object], bool]:
    source_fields, source_rows = read_csv(Path(args.source))
    target_fields, target_rows = read_csv(Path(args.target))
    keys = split_columns(args.key)
    ignored = set(split_columns(args.ignore_columns))
    null_values = {item.strip().lower() for item in args.null_values.split(",")}

    for key in keys:
        if key not in source_fields or key not in target_fields:
            raise ValueError(f"Key column must exist in both files: {key}")

    source_set = set(source_fields)
    target_set = set(target_fields)
    shared_columns = [field for field in source_fields if field in target_set and field not in ignored]
    if not shared_columns:
        raise ValueError("No comparable columns remain")

    checks: list[dict[str, object]] = []

    def add_check(name: str, passed: bool, detail: object) -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})

    missing_target_columns = sorted(source_set - target_set - ignored)
    extra_target_columns = sorted(target_set - source_set - ignored)
    schema_ok = not missing_target_columns and (args.allow_extra_target_columns or not extra_target_columns)
    add_check(
        "schema",
        schema_ok,
        {"missing_target_columns": missing_target_columns, "extra_target_columns": extra_target_columns},
    )
    add_check(
        "row_count",
        len(source_rows) == len(target_rows),
        {"source": len(source_rows), "target": len(target_rows)},
    )

    source_nulls = profile_nulls(source_rows, shared_columns, null_values)
    target_nulls = profile_nulls(target_rows, shared_columns, null_values)
    add_check("null_profile", source_nulls == target_nulls, {"source": source_nulls, "target": target_nulls})

    mismatch_detail: dict[str, object]
    if keys:
        source_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
        target_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
        for row in source_rows:
            source_by_key[key_for(row, keys)].append(row)
        for row in target_rows:
            target_by_key[key_for(row, keys)].append(row)

        source_missing_key_count = sum(
            1 for row in source_rows if any(not row.get(key, "").strip() for key in keys)
        )
        target_missing_key_count = sum(
            1 for row in target_rows if any(not row.get(key, "").strip() for key in keys)
        )
        add_check(
            "business_key_presence",
            source_missing_key_count == 0 and target_missing_key_count == 0,
            {
                "source_missing_key_count": source_missing_key_count,
                "target_missing_key_count": target_missing_key_count,
            },
        )

        source_duplicates = {key: len(rows) for key, rows in source_by_key.items() if len(rows) > 1}
        target_duplicates = {key: len(rows) for key, rows in target_by_key.items() if len(rows) > 1}
        add_check(
            "business_key_uniqueness",
            not source_duplicates and not target_duplicates,
            {
                "source_duplicate_count": len(source_duplicates),
                "target_duplicate_count": len(target_duplicates),
                "source_sample": redact_duplicate_sample(
                    sorted(source_duplicates.items()), args.sample_limit
                ),
                "target_sample": redact_duplicate_sample(
                    sorted(target_duplicates.items()), args.sample_limit
                ),
            },
        )

        source_keys = set(source_by_key)
        target_keys = set(target_by_key)
        missing_keys = sorted(source_keys - target_keys)
        unexpected_keys = sorted(target_keys - source_keys)
        changed_keys = []
        for key in sorted(source_keys & target_keys):
            source_sigs = Counter(signature(row, shared_columns) for row in source_by_key[key])
            target_sigs = Counter(signature(row, shared_columns) for row in target_by_key[key])
            if source_sigs != target_sigs:
                changed_keys.append(key)
        mismatch_detail = {
            "missing_key_count": len(missing_keys),
            "unexpected_key_count": len(unexpected_keys),
            "changed_key_count": len(changed_keys),
            "missing_key_sample": [redact_key(key) for key in sample(missing_keys, args.sample_limit)],
            "unexpected_key_sample": [
                redact_key(key) for key in sample(unexpected_keys, args.sample_limit)
            ],
            "changed_key_sample": [redact_key(key) for key in sample(changed_keys, args.sample_limit)],
        }
        add_check("row_values", not missing_keys and not unexpected_keys and not changed_keys, mismatch_detail)
    else:
        source_counts = Counter(signature(row, shared_columns) for row in source_rows)
        target_counts = Counter(signature(row, shared_columns) for row in target_rows)
        missing = list((source_counts - target_counts).elements())
        unexpected = list((target_counts - source_counts).elements())
        mismatch_detail = {
            "missing_row_count": len(missing),
            "unexpected_row_count": len(unexpected),
            "missing_hash_sample": sample(missing, args.sample_limit),
            "unexpected_hash_sample": sample(unexpected, args.sample_limit),
        }
        add_check("row_values", not missing and not unexpected, mismatch_detail)

    passed = all(bool(check["passed"]) for check in checks)
    report: dict[str, object] = {
        "source": str(Path(args.source).resolve()),
        "target": str(Path(args.target).resolve()),
        "keys": keys,
        "ignored_columns": sorted(ignored),
        "compared_columns": shared_columns,
        "passed": passed,
        "checks": checks,
    }
    return report, passed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--key", default="", help="Comma-separated business key columns")
    parser.add_argument("--ignore-columns", default="", help="Comma-separated volatile columns")
    parser.add_argument("--null-values", default=",null,none,n/a,na", help="Comma-separated null-like values")
    parser.add_argument("--allow-extra-target-columns", action="store_true")
    parser.add_argument("--sample-limit", type=int, default=20)
    parser.add_argument("--output", help="Optional JSON report path")
    args = parser.parse_args()
    if args.sample_limit < 0:
        parser.error("--sample-limit must be non-negative")
    try:
        report, passed = reconcile(args)
    except (OSError, ValueError, csv.Error) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
