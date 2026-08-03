# Release Quality Metrics Packet

Use this compact JSON shape when handing evidence to `release-governance-qa`. It is intentionally provider-neutral

```json
{
  "release": {"id": "REL-001", "commit": "abc123", "build": "2026.08.01"},
  "scope": {"features": ["LOGIN"], "outOfScope": [], "riskLevel": "high"},
  "tests": {"executed": 120, "passed": 116, "failed": 2, "blocked": 2, "flaky": 1, "withEvidence": 118},
  "defects": {"openCritical": 0, "openHigh": 0, "escaped": 0, "reopened": 1},
  "coverage": {"requiredRisks": 24, "evidencedRisks": 24},
  "required_non_functional": ["performance", "security", "usability", "compatibility", "reliability", "recovery", "accessibility", "scalability", "volume"],
  "non_functional": {
    "performance": {"status": "PASS", "runIds": ["perf-run-001"], "evidence": ["evidence/performance.json"]},
    "security": {"status": "PASS", "runIds": ["security-run-001"], "evidence": ["evidence/security.md"]},
    "usability": {"status": "PASS", "runIds": ["ux-run-001"], "evidence": ["evidence/usability.json"]},
    "compatibility": {"status": "PASS", "runIds": ["compat-run-001"], "evidence": ["evidence/compatibility.json"]},
    "reliability": {"status": "PASS", "runIds": ["resilience-run-001"], "evidence": ["evidence/reliability.json"]},
    "recovery": {"status": "PASS", "runIds": ["recovery-run-001"], "evidence": ["evidence/recovery.json"]},
    "accessibility": {"status": "PASS", "runIds": ["a11y-run-001"], "evidence": ["evidence/accessibility.json"]},
    "scalability": {"status": "PASS", "runIds": ["scale-run-001"], "evidence": ["evidence/scalability.json"]},
    "volume": {"status": "PASS", "runIds": ["volume-run-001"], "evidence": ["evidence/volume.json"]}
  },
  "approvals": [{"role": "QA Lead", "name": "<owner>", "at": "2026-08-01T08:00:00Z"}],
  "postRelease": {"owner": "<owner>", "smokeRequired": true, "rollbackReady": true}
}
```

Required calculations:

- `passRate = passed / executed`
- `flakeRate = flaky / executed`
- `evidenceRate = withEvidence / (passed + failed)`
- `riskCoverage = evidencedRisks / requiredRisks`
- Keep blocked tests outside `executed` but list them explicitly
- Preserve the source run IDs and evidence paths for every aggregate
- For each in-scope non-functional category, preserve `status`, one or more `runIds`, and local `evidence` paths; use `required_non_functional` to activate the release evaluator gate

The packet is not a PASS by itself. The release evaluator must verify evidence existence, defect policy, approval and exit criteria
