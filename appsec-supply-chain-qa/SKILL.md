---
name: appsec-supply-chain-qa
description: Review local application and software-supply-chain security for SAST, SCA, SBOM, secret scanning, manifests, lockfiles, dependency or license risk, package audits, and secure CI. Use pentest-run separately for authorized exploit validation. Auto-route; do not require the skill name.
---

# AppSec & Supply-Chain QA

Find security and dependency hygiene gaps before release without contacting a vulnerability service or exposing secret values. This complements `pentest-run`: static preflight does not prove exploitability, CVE reachability, or production security.

## Workflow

1. Resolve the repository boundary, branch/commit, exclusions, language manifests, lockfiles, and CI policy
2. Run the local redacted preflight
3. Inspect dependency pinning, lockfile consistency, secret findings, SBOM generation, license policy, and protected CI steps
4. For a candidate finding, preserve path/line/kind only; never print the secret or credential
5. Route confirmed exploit validation to `pentest-run` with an engagement contract and approval

```bash
python3 appsec-supply-chain-qa/scripts/check_supply_chain.py --repo .
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
