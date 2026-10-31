# AppSec and supply-chain review matrix

This matrix expands what `check_supply_chain.py` actually measures versus what each review area claims to cover. Treat every row as a floor, not a substitute for the external tool it names.

## Secret hygiene

- Local evidence: regex match on `aws_access_key`, `github_token`, `private_key` and generic `credential_assignment` patterns, redacted path/line/kind only
- Excluded by design: `test`, `tests`, `fixtures`, `vendor` path segments and files over 1.5MB — a real secret committed under one of these paths will not be flagged; say so explicitly rather than reporting a clean scan
- Known false negatives: secrets split across concatenated strings, base64/hex-encoded values, provider token formats not in `SECRET_PATTERNS`, secrets in binary or non-text-suffix files
- Known false positives: example/placeholder credentials in `.env.example`-style files that do not end in `.example`, long non-secret strings matching `credential_assignment`
- Escalation when stakes are high: recommend a dedicated secret scanner (gitleaks, trufflehog) run by the user/CI, including full git history — this local pass only scans the current working tree, not history

## Dependencies (SCA)

- Local evidence: inventory of present manifest/lockfile filenames only (`package.json`, `requirements.txt`, `go.sum`, etc.)
- What this does NOT do: no parsing of declared versions, no registry lookup, no CVE/advisory match, no transitive-dependency resolution, no license extraction from the manifest contents
- Report inventory as "manifests present for X, Y" — never phrase it as "dependencies audited" or "no known vulnerabilities"
- Escalation: point to the ecosystem-native SCA tool (`npm audit`, `pip-audit`, `govulncheck`, `cargo audit`, `osv-scanner`) and state that none of them ran in this pass

## SBOM

- Local evidence: `sbom_ready` is `true` only because a dependency manifest exists — it is a precondition signal, not an SBOM
- What this does NOT do: no SBOM file is generated, validated, or checked for CycloneDX/SPDX schema conformance; an existing `sbom.json` in the repo is not independently verified for accuracy against current dependencies
- Escalation: generate with `syft`, `cdxgen`, or the ecosystem's native SBOM export, then diff the result against the manifest inventory from this scan

## CI controls

- Local evidence: `ci_controls` in the JSON output is a fixed `{local_scan: PASS, remote_sast: NOT_RUN, remote_sca: NOT_RUN, sbom_signing: NOT_RUN}` — the script does not inspect `.github/workflows/` or any CI config for actual security jobs
- Before claiming anything about CI controls, read the workflow files directly (job names, pinned action SHAs vs. floating tags, secret exposure in `run:` steps, `pull_request_target` misuse, permissions blocks) — this is a manual review step, not something `check_supply_chain.py` performs
- Escalation: a CI security job existing in YAML is still unproven until a recent workflow run is inspected for actual execution and pass/fail status

## License policy

- Local evidence: none — this script has no license-file or manifest-field inspection at all
- Treat any license statement as `UNTEST` unless a human/legal reviewer or a dedicated license scanner (`license-checker`, `pip-licenses`, `cargo-license`) was actually run and its output read
- Never infer license compliance from a repository's `LICENSE` file alone; dependency licenses are a separate, unchecked surface

## General rules for every row above

- All scanner alerts remain `Candidate` until reproduction and a control comparison confirm them
- `source_hash` in the JSON output ties a report to an exact working-tree snapshot; re-run the scan before trusting a report against a repo that has since changed
- A `passed: true` result means only "no regex secret match in non-excluded files" — never summarize it to the user as "security scan passed" without naming which of the five areas above were actually exercised versus merely inventoried
