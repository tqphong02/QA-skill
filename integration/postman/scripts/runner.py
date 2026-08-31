#!/usr/bin/env python3
"""Select Postman CLI or Newman and run Postman collections reproducibly."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SKILL_DIR = Path(__file__).resolve().parents[1]
LOCAL_BIN_DIR = SKILL_DIR / "node_modules" / ".bin"
LOCAL_NODE_ENTRYPOINTS = {
    "newman": SKILL_DIR / "node_modules" / "newman" / "bin" / "newman.js",
    "postman": SKILL_DIR / "node_modules" / "postman-cli" / "bin" / "postman.js",
}
SENSITIVE_QUERY_KEYS = {
    "apikey",
    "api_key",
    "key",
    "token",
    "access_token",
    "authorization",
    "password",
    "passwd",
    "secret",
    "client_secret",
    "refresh_token",
}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
VARIABLE_PATTERN = re.compile(r"{{\s*([^{}\s]+)\s*}}")


class RunnerError(RuntimeError):
    """Expected runner configuration or compatibility failure."""


def local_binary_names(name: str) -> tuple[str, ...]:
    if sys.platform == "win32":
        return (f"{name}.cmd", f"{name}.exe", name)
    return (name,)


def find_binary(name: str) -> str | None:
    if sys.platform == "win32":
        entrypoint = LOCAL_NODE_ENTRYPOINTS.get(name)
        if entrypoint and entrypoint.is_file():
            return str(entrypoint)
    for candidate_name in local_binary_names(name):
        candidate = LOCAL_BIN_DIR / candidate_name
        if candidate.is_file():
            return str(candidate)
    return shutil.which(name)


def executable_command(binary: str) -> list[str]:
    if binary.lower().endswith((".js", ".mjs", ".cjs")):
        if sys.platform == "win32":
            system_node = Path(r"C:\Program Files\nodejs\node.exe")
            node = str(system_node) if system_node.is_file() else shutil.which("node")
        else:
            node = shutil.which("node")
        if not node:
            raise RunnerError("runtime_missing engine=node")
        return [node, binary]
    return [binary]


def binary_version(binary: str) -> str:
    try:
        result = subprocess.run(
            [*executable_command(binary), "--version"],
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
        )
    except subprocess.TimeoutExpired:
        return "timeout=10s"
    value = result.stdout.strip().splitlines()
    if result.returncode != 0:
        return f"exit={result.returncode} output={value[-1] if value else 'none'}"
    return value[-1] if value else "exit=0 output=none"


def detect_collection_kind(collection: str) -> str:
    if collection.startswith(("http://", "https://")):
        return "remote"
    path = Path(collection)
    if path.suffix.lower() in {".yaml", ".yml"}:
        return "v3"
    if not path.is_file():
        return "id_or_missing"
    if path.suffix.lower() != ".json":
        return "unknown"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid_json"
    if not isinstance(value, dict):
        return "unknown"
    schema = str(value.get("info", {}).get("schema", "")).lower()
    if "v2.1" in schema or "v2.0" in schema:
        return "v2"
    if "v3" in schema:
        return "v3"
    return "json_unknown"


def choose_engine(
    requested: str, collection_kind: str, *, dry_run: bool
) -> tuple[str, str]:
    postman_binary = find_binary("postman")
    newman_binary = find_binary("newman")

    if requested == "postman-cli":
        if postman_binary:
            return requested, postman_binary
        if dry_run:
            return requested, "postman"
        raise RunnerError("runtime_missing engine=postman-cli")

    if requested == "newman":
        if collection_kind == "v3":
            raise RunnerError(
                "incompatible engine=newman collection=v3 use=postman-cli"
            )
        if newman_binary:
            return requested, newman_binary
        if dry_run:
            return requested, "newman"
        raise RunnerError("runtime_missing engine=newman")

    if postman_binary:
        return "postman-cli", postman_binary
    if newman_binary and collection_kind != "v3":
        return "newman", newman_binary
    if collection_kind == "v3":
        raise RunnerError(
            "runtime_missing engine=postman-cli collection=v3 "
            "newman_is_not_compatible"
        )
    if dry_run:
        return "postman-cli", "postman"
    raise RunnerError("runtime_missing engines=postman-cli,newman")


def add_common_options(
    command: list[str], args: argparse.Namespace, engine: str
) -> None:
    if args.environment:
        command.extend(["-e", args.environment])
    if args.globals:
        command.extend(["-g", args.globals])
    if args.iteration_data:
        command.extend(["-d", args.iteration_data])
    if args.iterations is not None:
        command.extend(["-n", str(args.iterations)])
    for item in getattr(args, "env_var", []):
        command.extend(["--env-var", item])
    for item in args.item:
        if engine == "postman-cli":
            command.extend(["-i", item])
        else:
            command.extend(["--folder", item])
    if args.bail:
        command.append("--bail")
    if args.timeout is not None:
        command.extend(["--timeout", str(args.timeout)])
    if args.timeout_request is not None:
        command.extend(["--timeout-request", str(args.timeout_request)])


def add_reporters(
    command: list[str],
    args: argparse.Namespace,
    engine: str,
    collection_kind: str,
) -> None:
    if not args.report_dir:
        return
    report_dir = Path(args.report_dir)
    structured_supported = engine == "newman" or collection_kind in {
        "v2",
        "json_unknown",
    }
    if not structured_supported:
        return
    command.extend(
        [
            "--reporters",
            "cli,json,junit",
            "--reporter-json-export",
            (report_dir / "report.json").as_posix(),
            "--reporter-junit-export",
            (report_dir / "junit.xml").as_posix(),
        ]
    )
    if engine == "postman-cli":
        command.extend(
            [
                "--reporter-json-structure",
                "newman",
                "--reporter-json-omitHeaders",
                "--reporter-json-omitRequestBodies",
                "--reporter-json-omitResponseBodies",
            ]
        )


def build_run_command(
    args: argparse.Namespace, engine: str, binary: str, collection_kind: str
) -> list[str]:
    prefix = executable_command(binary)
    if engine == "postman-cli":
        command = [*prefix, "collection", "run", args.collection]
    else:
        command = [*prefix, "run", args.collection]
    add_common_options(command, args, engine)
    add_reporters(command, args, engine, collection_kind)
    return command


def redact_url(value: str) -> str:
    if not value.startswith(("http://", "https://")):
        return value
    parsed = urlsplit(value)
    query = []
    for key, item in parse_qsl(parsed.query, keep_blank_values=True):
        query.append(
            (key, "<redacted>" if key.lower() in SENSITIVE_QUERY_KEYS else item)
        )
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
    )


def safe_command(command: list[str]) -> str:
    safe: list[str] = []
    redact_next = False
    for item in command:
        if redact_next:
            safe.append("<redacted>")
            redact_next = False
            continue
        safe.append(redact_url(item))
        if item in {"--postman-api-key", "--api-key", "--token", "--env-var"}:
            redact_next = True
    return shlex.join(safe)


def _request_url(request: dict[str, Any]) -> str:
    raw = request.get("url", "")
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        if isinstance(raw.get("raw"), str):
            return raw["raw"]
        protocol = str(raw.get("protocol", ""))
        host = raw.get("host") or []
        path = raw.get("path") or []
        host_text = ".".join(host) if isinstance(host, list) else str(host)
        path_text = "/".join(path) if isinstance(path, list) else str(path)
        if protocol and host_text:
            return f"{protocol}://{host_text}/{path_text}".rstrip("/")
    return ""


def _has_test_script(events: Any) -> bool:
    if not isinstance(events, list):
        return False
    for event in events:
        if not isinstance(event, dict) or event.get("listen") != "test":
            continue
        script = event.get("script") or {}
        lines = script.get("exec") if isinstance(script, dict) else None
        if isinstance(lines, str) and lines.strip():
            return True
        if isinstance(lines, list) and any(str(line).strip() for line in lines):
            return True
    return False


def inspect_collection(collection: str) -> dict[str, Any]:
    """Inspect a local v2 collection without exposing variable values."""
    path = Path(collection)
    if detect_collection_kind(collection) != "v2":
        raise RunnerError("api_test_requires_local_collection_v2_or_v2.1")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RunnerError(f"invalid_collection_json path={path}") from exc

    requests: list[dict[str, Any]] = []
    collection_has_tests = _has_test_script(value.get("event"))

    def walk(items: Any, lineage: tuple[str, ...], inherited_tests: bool) -> None:
        if not isinstance(items, list):
            return
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "unnamed")
            item_has_tests = inherited_tests or _has_test_script(item.get("event"))
            if isinstance(item.get("request"), dict):
                request = item["request"]
                raw_url = _request_url(request)
                requests.append(
                    {
                        "name": " / ".join((*lineage, name)),
                        "method": str(request.get("method") or "GET").upper(),
                        "url": raw_url,
                        "variables": sorted(set(VARIABLE_PATTERN.findall(raw_url))),
                        "has_tests": item_has_tests,
                    }
                )
            walk(item.get("item"), (*lineage, name), item_has_tests)

    walk(value.get("item"), (), collection_has_tests)
    variables = sorted({name for request in requests for name in request["variables"]})
    mutation_items = [
        request["name"] for request in requests if request["method"] in MUTATING_METHODS
    ]
    return {
        "collection": path.name,
        "request_count": len(requests),
        "methods": sorted({request["method"] for request in requests}),
        "variables": variables,
        "has_tests": bool(requests) and all(request["has_tests"] for request in requests),
        "mutation_items": mutation_items,
        "item_names": [request["name"] for request in requests],
        "requests": requests,
    }


def validate_target(
    inspection: dict[str, Any], target: str, target_variable: str
) -> None:
    parsed_target = urlsplit(target)
    if parsed_target.scheme not in {"http", "https"} or not parsed_target.netloc:
        raise RunnerError("invalid_target expected=http_or_https_url")
    if parsed_target.username or parsed_target.password:
        raise RunnerError("invalid_target credentials_in_url_are_forbidden")

    target_origin = (parsed_target.scheme.lower(), parsed_target.netloc.lower())
    absolute_origins: set[tuple[str, str]] = set()
    for request in inspection["requests"]:
        raw_url = request["url"]
        if VARIABLE_PATTERN.search(raw_url):
            continue
        parsed = urlsplit(raw_url)
        if parsed.scheme and parsed.netloc:
            absolute_origins.add((parsed.scheme.lower(), parsed.netloc.lower()))
    if any(origin != target_origin for origin in absolute_origins):
        raise RunnerError("target_mismatch collection_contains_different_origin")

    if inspection["variables"] and target_variable not in inspection["variables"] and not absolute_origins:
        raise RunnerError(
            f"target_variable_missing variable={target_variable} available={','.join(inspection['variables'])}"
        )


def redact_text(value: str) -> str:
    value = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer <redacted>", value)
    value = re.sub(r"\bPMAK-[A-Za-z0-9_-]+", "PMAK-<redacted>", value)
    for key in SENSITIVE_QUERY_KEYS:
        value = re.sub(
            rf"(?i)([?&]{re.escape(key)}=)[^&\s]+",
            rf"\1<redacted>",
            value,
        )
        value = re.sub(
            rf'(?i)(["\']{re.escape(key)}["\']\s*:\s*["\'])[^"\']+(["\'])',
            rf"\1<redacted>\2",
            value,
        )
    return value


def redact_json(value: Any, parent_key: str = "") -> Any:
    if parent_key.lower() in SENSITIVE_QUERY_KEYS:
        return "<redacted>"
    if isinstance(value, dict):
        return {key: redact_json(child, str(key)) for key, child in value.items()}
    if isinstance(value, list):
        return [redact_json(child, parent_key) for child in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def sanitize_json_report(path: Path) -> None:
    if not path.is_file():
        return
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    path.write_text(
        json.dumps(redact_json(payload), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def newman_report_summary(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    run = report.get("run") if isinstance(report, dict) else None
    stats = run.get("stats") if isinstance(run, dict) else None
    if not isinstance(stats, dict):
        return None

    def stat(name: str, key: str) -> int:
        item = stats.get(name) or {}
        value = item.get(key, 0) if isinstance(item, dict) else 0
        return int(value) if isinstance(value, (int, float)) else 0

    executions = run.get("executions") if isinstance(run, dict) else []
    executed_items = []
    if isinstance(executions, list):
        for execution in executions:
            item = execution.get("item") if isinstance(execution, dict) else None
            name = item.get("name") if isinstance(item, dict) else None
            if isinstance(name, str) and name:
                executed_items.append(name)
    return {
        "requests_total": stat("requests", "total"),
        "requests_failed": stat("requests", "failed"),
        "assertions_total": stat("assertions", "total"),
        "assertions_failed": stat("assertions", "failed"),
        "test_scripts_failed": stat("testScripts", "failed"),
        "executed_items": executed_items,
    }


def write_execution_summary(
    report_dir: str,
    *,
    engine: str,
    collection_kind: str,
    exit_code: int,
    command: list[str],
    cleanup_items: list[str] | None = None,
) -> dict[str, Any]:
    output_dir = Path(report_dir)
    report_path = output_dir / "report.json"
    structured = newman_report_summary(report_path)
    required_cleanup = cleanup_items or []
    executed = set((structured or {}).get("executed_items", []))
    cleanup_verified = not required_cleanup or all(item in executed for item in required_cleanup)

    if exit_code != 0:
        verdict = "FAILED"
    elif collection_kind in {"v2", "json_unknown"} and structured is None:
        verdict = "UNTEST"
    elif structured and structured["assertions_total"] == 0:
        verdict = "UNTEST"
    elif structured and (
        structured["requests_failed"]
        or structured["assertions_failed"]
        or structured["test_scripts_failed"]
    ):
        verdict = "FAILED"
    elif not cleanup_verified:
        verdict = "UNTEST"
    else:
        verdict = "PASS"

    payload = {
        "schema_version": 1,
        "engine": engine,
        "collection_kind": collection_kind,
        "exit_code": exit_code,
        "verdict": verdict,
        "command": safe_command(command),
        "structured_report": report_path.as_posix() if report_path.is_file() else None,
        "console_log": (output_dir / "console.log").as_posix(),
        "required_cleanup_items": required_cleanup,
        "cleanup_verified": cleanup_verified,
        "stats": structured,
    }
    (output_dir / "execution-summary.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


def run_with_optional_log(command: list[str], report_dir: str | None) -> int:
    if not report_dir:
        return subprocess.run(command, check=False).returncode

    output_dir = Path(report_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "console.log"
    process = subprocess.Popen(
        command,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    assert process.stdout is not None
    with log_path.open("w", encoding="utf-8") as handle:
        for line in process.stdout:
            safe_line = redact_text(line)
            try:
                sys.stdout.write(safe_line)
            except UnicodeEncodeError:
                console_encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
                console_safe = safe_line.encode(
                    console_encoding, errors="replace"
                ).decode(console_encoding, errors="replace")
                sys.stdout.write(console_safe)
            handle.write(safe_line)
    exit_code = process.wait()
    sanitize_json_report(output_dir / "report.json")
    return exit_code


def command_doctor(_: argparse.Namespace) -> int:
    found = 0
    for engine, binary_name in (
        ("postman-cli", "postman"),
        ("newman", "newman"),
    ):
        binary = find_binary(binary_name)
        if binary:
            version = binary_version(binary)
            if version.startswith(("timeout=", "exit=")):
                print(f"BLOCKED engine={engine} probe={version} path={binary}")
                continue
            found += 1
            print(
                f"PASS engine={engine} version={version!r} "
                f"path={binary}"
            )
        else:
            print(f"MISSING engine={engine}")
    if found == 0:
        print(
            "BLOCKED runtime_missing run=npm_install_in_postman_skill",
            file=sys.stderr,
        )
        return 1
    if not find_binary("postman") and find_binary("newman"):
        print("NOTICE selected=newman limitation=collection_v2_v2.1_only")
    else:
        print("PASS selected=postman-cli fallback=newman")
    return 0


def command_login(args: argparse.Namespace) -> int:
    binary = find_binary("postman")
    if not binary:
        if args.dry_run:
            binary = "postman"
        else:
            print("BLOCKED runtime_missing engine=postman-cli", file=sys.stderr)
            return 1
    command = [*executable_command(binary), "login"]
    if args.region == "eu":
        command.extend(["--region", "eu"])
    print(f"ENGINE postman-cli\nCOMMAND {safe_command(command)}")
    if args.dry_run:
        return 0
    return subprocess.run(command, check=False).returncode


def command_run(args: argparse.Namespace) -> int:
    collection_kind = detect_collection_kind(args.collection)
    if collection_kind == "invalid_json":
        print(
            f"BLOCKED invalid_collection_json path={args.collection}",
            file=sys.stderr,
        )
        return 2
    try:
        engine, binary = choose_engine(
            args.engine, collection_kind, dry_run=args.dry_run
        )
    except RunnerError as exc:
        print(f"BLOCKED {exc}", file=sys.stderr)
        return 2

    command = build_run_command(args, engine, binary, collection_kind)
    print(
        f"ENGINE {engine}\nCOLLECTION_KIND {collection_kind}\n"
        f"COMMAND {safe_command(command)}"
    )
    if args.report_dir and engine == "postman-cli" and collection_kind not in {
        "v2",
        "json_unknown",
    }:
        print(
            "NOTICE structured_report=unsupported_or_unknown "
            "evidence=console.log"
        )
    if args.dry_run:
        return 0
    exit_code = run_with_optional_log(command, args.report_dir)
    if args.report_dir:
        summary = write_execution_summary(
            args.report_dir,
            engine=engine,
            collection_kind=collection_kind,
            exit_code=exit_code,
            command=command,
            cleanup_items=getattr(args, "cleanup_item", []),
        )
        print(f"VERDICT {summary['verdict']}")
    return exit_code


def command_api_test(args: argparse.Namespace) -> int:
    try:
        if not args.report_dir:
            raise RunnerError("api_test_requires_report_dir")
        inspection = inspect_collection(args.collection)
        validate_target(inspection, args.target, args.target_variable)
        if inspection["request_count"] == 0:
            raise RunnerError("collection_has_no_requests")
        if not inspection["has_tests"]:
            raise RunnerError("collection_has_requests_without_test_scripts")
        mutation_items = inspection["mutation_items"]
        if mutation_items and not args.allow_mutations:
            raise RunnerError("mutations_require_explicit_allow_mutations")
        if mutation_items and not args.cleanup_item:
            raise RunnerError("mutations_require_cleanup_item")
        known_items = set(inspection["item_names"])
        known_leaf_items = {name.rsplit(" / ", 1)[-1] for name in known_items}
        missing_cleanup = [
            item for item in args.cleanup_item
            if item not in known_items and item not in known_leaf_items
        ]
        if missing_cleanup:
            raise RunnerError(f"cleanup_item_not_found items={','.join(missing_cleanup)}")
        args.cleanup_item = [item.rsplit(" / ", 1)[-1] for item in args.cleanup_item]
    except RunnerError as exc:
        print(f"BLOCKED {exc}", file=sys.stderr)
        return 2

    report_dir = Path(args.report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    preflight = {
        key: value for key, value in inspection.items() if key != "requests"
    }
    preflight.update(
        {
            "target": args.target,
            "target_variable": args.target_variable,
            "allow_mutations": args.allow_mutations,
            "cleanup_items": args.cleanup_item,
            "status": "PASS",
        }
    )
    (report_dir / "api-test-preflight.json").write_text(
        json.dumps(preflight, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    args.env_var = [
        item for item in args.env_var
        if item.split("=", 1)[0] != args.target_variable
    ]
    args.env_var.append(f"{args.target_variable}={args.target}")
    args.bail = True
    return command_run(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Unified Postman CLI and Newman collection runner"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="Detect both collection runtimes")
    doctor.set_defaults(handler=command_doctor)

    login = subparsers.add_parser(
        "login", help="Authenticate the official Postman CLI"
    )
    login.add_argument("--region", choices=("us", "eu"), default="us")
    login.add_argument("--dry-run", action="store_true")
    login.set_defaults(handler=command_login)

    def add_run_arguments(command_parser: argparse.ArgumentParser) -> None:
        command_parser.add_argument(
            "collection", help="Collection path, URL, or Postman ID"
        )
        command_parser.add_argument(
            "--engine",
            choices=("auto", "postman-cli", "newman"),
            default="auto",
        )
        command_parser.add_argument("--environment", "-e")
        command_parser.add_argument("--globals", "-g")
        command_parser.add_argument("--iteration-data", "-d")
        command_parser.add_argument("--iterations", "-n", type=int)
        command_parser.add_argument("--item", "-i", action="append", default=[])
        command_parser.add_argument("--env-var", action="append", default=[])
        command_parser.add_argument("--bail", action="store_true")
        command_parser.add_argument("--timeout", type=int)
        command_parser.add_argument("--timeout-request", type=int)
        command_parser.add_argument(
            "--report-dir",
            help="Write console.log and structured reports when supported",
        )
        command_parser.add_argument("--dry-run", action="store_true")

    run = subparsers.add_parser(
        "run", help="Run a collection with deterministic engine selection"
    )
    add_run_arguments(run)
    run.set_defaults(handler=command_run, cleanup_item=[])

    api_test = subparsers.add_parser(
        "api-test",
        help="Preflight and run a local v2 collection against one exact API target",
    )
    add_run_arguments(api_test)
    api_test.add_argument("--target", required=True)
    api_test.add_argument("--target-variable", default="baseUrl")
    api_test.add_argument("--allow-mutations", action="store_true")
    api_test.add_argument("--cleanup-item", action="append", default=[])
    api_test.set_defaults(handler=command_api_test)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
