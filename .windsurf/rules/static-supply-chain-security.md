---
trigger: model_decision
description: Use for SAST SCA SBOM secrets dependency license and secure CI preflight
---

# AppSec Supply Chain QA

Load [`static-testing/supply-chain-security/SKILL.md`](../../static-testing/supply-chain-security/SKILL.md) for local redacted security preflight

Scan only the approved repository boundary, never print secret values, and keep alerts Candidate until reproduction and control comparison. Route exploit validation to `dynamic-security-pentest`
