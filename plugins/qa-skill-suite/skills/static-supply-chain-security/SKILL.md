---
name: static-supply-chain-security
description: Review local application and software-supply-chain security for SAST, SCA, SBOM, secret scanning, manifests, lockfiles, dependency or license risk, package audits, and secure CI. Trigger on SAST, SCA, SBOM, secret scanning, dependency, license, manifest, lockfile, or secure-CI review requests. Use dynamic-security-pentest separately for authorized exploit validation. Auto-route; do not require the skill name.
mode: static
surface: security
role: reviewer
legacy_aliases: appsec-supply-chain-qa
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# AppSec & Supply-Chain QA

Find security and dependency hygiene gaps before release without contacting a vulnerability service or exposing secret values. This complements `dynamic-security-pentest`: static preflight does not prove exploitability, CVE reachability, or production security.

## Workflow

1. Resolve the repository boundary, branch/commit, exclusions, language manifests, lockfiles, and CI policy
2. Run the local redacted preflight
3. Inspect dependency pinning, lockfile consistency, secret findings, SBOM generation, license policy, and protected CI steps
4. For a candidate finding, preserve path/line/kind only; never print the secret or credential
5. Route confirmed exploit validation to `dynamic-security-pentest` with an engagement contract and approval

```bash
python3 ./scripts/check_supply_chain.py --repo .
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
