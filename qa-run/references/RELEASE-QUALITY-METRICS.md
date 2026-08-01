# Release Quality Metrics Packet

Use this compact JSON shape when handing evidence to `release-governance-qa`. It is intentionally provider-neutral

```json
{
  "release": {"id": "REL-001", "commit": "abc123", "build": "2026.08.01"},
  "scope": {"features": ["LOGIN"], "outOfScope": [], "riskLevel": "high"},
  "tests": {"executed": 120, "passed": 116, "failed": 2, "blocked": 2, "flaky": 1, "withEvidence": 118},
  "defects": {"openCritical": 0, "openHigh": 0, "escaped": 0, "reopened": 1},
  "coverage": {"requiredRisks": 24, "evidencedRisks": 24},
  "nonFunctional": {"performance": "PASS", "accessibility": "PASS", "security": "PASS", "compatibility": "PARTIAL"},
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

The packet is not a PASS by itself. The release evaluator must verify evidence existence, defect policy, approval and exit criteria
