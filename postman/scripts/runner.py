#!/usr/bin/env python3
"""Select Postman CLI or Newman and run Postman collections reproducibly."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SKILL_DIR = Path(__file__).resolve().parents[1]
LOCAL_BIN_DIR = SKILL_DIR / "node_modules" / ".bin"
SENSITIVE_QUERY_KEYS = {
    "apikey",
    "api_key",
    "key",
    "token",
    "access_token",
    "authorization",
}


class RunnerError(RuntimeError):
    """Expected runner configuration or compatibility failure."""


def local_binary_names(name: str) -> tuple[str, ...]:
    if sys.platform == "win32":
        return (f"{name}.cmd", f"{name}.exe", name)
    return (name,)


def find_binary(name: str) -> str | None:
    for candidate_name in local_binary_names(name):
        candidate = LOCAL_BIN_DIR / candidate_name
        if candidate.is_file():
            return str(candidate)
    return shutil.which(name)


def binary_version(binary: str) -> str:
    result = subprocess.run(
        [binary, "--version"],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    value = result.stdout.strip().splitlines()
    return value[-1] if value else f"exit={result.returncode}"


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
            str(report_dir / "report.json"),
            "--reporter-junit-export",
            str(report_dir / "junit.xml"),
        ]
    )
    if engine == "postman-cli":
        command.extend(["--reporter-json-structure", "newman"])


def build_run_command(
    args: argparse.Namespace, engine: str, binary: str, collection_kind: str
) -> list[str]:
    if engine == "postman-cli":
        command = [binary, "collection", "run", args.collection]
    else:
        command = [binary, "run", args.collection]
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
        if item in {"--postman-api-key", "--api-key", "--token"}:
            redact_next = True
    return shlex.join(safe)


def run_with_optional_log(command: list[str], report_dir: str | None) -> int:
    if not report_dir:
        return subprocess.run(command, check=False).returncode

    output_dir = Path(report_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "console.log"
    process = subprocess.Popen(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    assert process.stdout is not None
    with log_path.open("w", encoding="utf-8") as handle:
        for line in process.stdout:
            sys.stdout.write(line)
            handle.write(line)
    return process.wait()


def command_doctor(_: argparse.Namespace) -> int:
    found = 0
    for engine, binary_name in (
        ("postman-cli", "postman"),
        ("newman", "newman"),
    ):
        binary = find_binary(binary_name)
        if binary:
            found += 1
            print(
                f"PASS engine={engine} version={binary_version(binary)!r} "
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
    command = [binary, "login"]
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
    return run_with_optional_log(command, args.report_dir)


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

    run = subparsers.add_parser(
        "run", help="Run a collection with deterministic engine selection"
    )
    run.add_argument("collection", help="Collection path, URL, or Postman ID")
    run.add_argument(
        "--engine",
        choices=("auto", "postman-cli", "newman"),
        default="auto",
    )
    run.add_argument("--environment", "-e")
    run.add_argument("--globals", "-g")
    run.add_argument("--iteration-data", "-d")
    run.add_argument("--iterations", "-n", type=int)
    run.add_argument("--item", "-i", action="append", default=[])
    run.add_argument("--bail", action="store_true")
    run.add_argument("--timeout", type=int)
    run.add_argument("--timeout-request", type=int)
    run.add_argument(
        "--report-dir",
        help="Write console.log and structured reports when supported",
    )
    run.add_argument("--dry-run", action="store_true")
    run.set_defaults(handler=command_run)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
