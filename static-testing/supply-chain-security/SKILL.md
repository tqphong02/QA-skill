---
name: static-supply-chain-security
description: Review local application and software-supply-chain security for SAST, SCA, SBOM, secret scanning, manifests, lockfiles, dependency or license risk, package audits, and secure CI. Trigger on SAST, SCA, SBOM, secret scanning, dependency, license, manifest, lockfile, or secure-CI review requests. Use dynamic-security-pentest separately for authorized exploit validation. Auto-route; do not require the skill name.
mode: static
surface: security
role: reviewer
legacy_aliases: appsec-supply-chain-qa
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# AppSec & Supply-Chain QA

Find security and dependency hygiene gaps before release without contacting a vulnerability service or exposing secret values. This complements `dynamic-security-pentest`: static preflight does not prove exploitability, CVE reachability, or production security.

## Workflow

1. Resolve the repository boundary, branch/commit, exclusions, language manifests, lockfiles, and CI policy
2. Run the local redacted preflight
3. Inspect dependency pinning, lockfile consistency, secret findings, SBOM generation, license policy, and protected CI steps
4. For a candidate finding, preserve path/line/kind only; never print the secret or credential
5. Route confirmed exploit validation to `dynamic-security-pentest` with an engagement contract and approval

```bash
python3 static-testing/supply-chain-security/scripts/check_supply_chain.py --repo .
```

## Hard gates

- Do not read keychains, environment secrets, browser profiles, or remote registries during the local preflight
- No network target, authorization, or rate limit means no active security request
- Findings are `Candidate` until reproduction and a control comparison confirm them
- A clean local regex scan is not a clean SAST/SCA result; external scanners and vulnerability databases remain separate evidence
- Redact values in reports and do not commit generated evidence containing secrets

## Output contract

Write pretty JSON with `passed`, `repo`, `dependency_manifests`, `secret_findings`, `sbom_ready`, `ci_controls`, and `limitations`. Secret findings contain only relative path, line, kind, and redaction status. Report the scanned commit or source hash when available.

## References

- [Supply-chain review matrix](references/REVIEW_MATRIX.md)
- [Redacted local checker](scripts/check_supply_chain.py)
