---
trigger: model_decision
description: A Plane URL or ticket ID alone triggers doctor plus read; use for bug logging, retest, evidence and status updates
---

# Plane QA

Load [`plane-qa/SKILL.md`](../../plane-qa/SKILL.md) and follow its cross-model hard gates

A bare Plane URL or ticket ID is a complete read request. Retest routes plane-qa → qa-run RETEST_PLUS → plane-qa

State map: PASS → Done, FAILED → In Progress, BLOCKED → unchanged, new bug → Todo
