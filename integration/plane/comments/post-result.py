#!/usr/bin/env python3
"""Validate and post a canonical PASS, FAILED, or BLOCKED Plane retest comment."""

import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.inline_image import Client


VERDICTS = {"PASS", "FAILED", "BLOCKED"}
STATE_TRANSITIONS = {"PASS": "Done", "FAILED": "In Progress"}
ICON_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")


def items(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def clean_sentence(value):
    """Normalize human-readable comment text to the team style."""
    return str(value).strip().rstrip(".").rstrip()


def section(label, values, ordered=False):
    values = items(values)
    if not values:
        return ""
    tag = "ol" if ordered else "ul"
    body = "".join(f"<li>{html.escape(clean_sentence(value))}</li>" for value in values)
    return f"<p><strong>{label}:</strong></p><{tag}>{body}</{tag}>"


def validate(spec):
    errors = []
    verdict = str(spec.get("result", "")).upper()
    if verdict not in VERDICTS:
        errors.append("result must be exactly PASS, FAILED, or BLOCKED")
    targets = [name for name in ("ref", "url") if str(spec.get(name, "")).strip()]
    if len(targets) != 1:
        errors.append("provide exactly one target: ref or url")
    for field in ("conclusion", "evidence"):
        if not items(spec.get(field)):
            errors.append(f"missing required field: {field}")
    if verdict == "FAILED":
        if not items(spec.get("actual") or spec.get("observed")):
            errors.append("FAILED requires actual")
        if not items(spec.get("expected")):
            errors.append("FAILED requires expected")
    if verdict == "BLOCKED" and not items(spec.get("blocker") or spec.get("observed")):
        errors.append("BLOCKED requires blocker")
    human_fields = ("conclusion", "actual", "observed", "expected", "blocker")
    if any(ICON_RE.search(str(value)) for field in human_fields for value in items(spec.get(field))):
        errors.append("comment content must not contain emoji or icons")
    missing = [path for path in items(spec.get("evidence")) if not os.path.isfile(path)]
    if missing:
        errors.append(f"missing evidence files: {missing}")
    return errors


def build_html(spec):
    verdict = str(spec["result"]).upper()
    parts = [f"<p><strong>Result:</strong> {verdict}</p>"]
    if verdict == "FAILED":
        parts.append(section("Actual", spec.get("actual") or spec.get("observed")))
        parts.append(section("Expected", spec.get("expected")))
    elif verdict == "BLOCKED":
        parts.append(section("Blocker", spec.get("blocker") or spec.get("observed")))
    parts.append(section("Conclusion", spec.get("conclusion")))
    return "".join(part for part in parts if part)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("spec", help="JSON comment specification")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--legacy-attachment", action="store_true", help="Explicitly allow the legacy attachment-backed image route")
    args = parser.parse_args()

    with open(args.spec, encoding="utf-8") as handle:
        spec = json.load(handle)
    spec["result"] = str(spec.get("result", "")).upper()
    errors = validate(spec)
    if errors:
        print("COMMENT FORMAT ERROR")
        for error in errors:
            print(f"  - {error}")
        return 2

    body = build_html(spec)
    if args.dry_run:
        target_state = STATE_TRANSITIONS.get(spec["result"], "unchanged")
        target = spec.get("url") or spec.get("ref")
        print(
            f"[DRY] {target} | {spec['result']} | "
            f"{len(spec['evidence'])} inline image(s) | state={target_state}"
        )
        print(body)
        return 0

    if spec.get("evidence") and not args.legacy_attachment:
        print("BROWSER REQUIRED: validate with --dry-run, then post the image through the authenticated browser editor")
        return 2

    if spec.get("url"):
        client, project_id, work_item_id = Client.from_url(spec["url"])
        if not project_id or not work_item_id:
            raise SystemExit("Plane URL must contain project ID and issue/work-item ID.")
    else:
        client = Client()
        project_id, work_item_id = client.resolve(spec["ref"])
    target_state = STATE_TRANSITIONS.get(spec["result"])
    state_id = client.resolve_state(project_id, target_state) if target_state else None
    response = client.post_comment(
        project_id,
        work_item_id,
        body,
        spec["evidence"],
        raw_html=True,
        allow_legacy_attachment=args.legacy_attachment,
    )
    if state_id:
        client.api(
            "PATCH",
            f"/workspaces/{client.slug}/projects/{project_id}/work-items/{work_item_id}/",
            {"state": state_id},
        )
    print(
        f"OK comment {response['id']} | {spec['result']} | "
        f"{len(spec['evidence'])} inline image(s) | "
        f"state={target_state or 'unchanged'} | wi={work_item_id}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
