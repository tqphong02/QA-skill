# Usability testing contract

Use this contract when the question is whether representative users can find,
understand and complete a task, not only whether the screen matches a design

## Required task dimensions

Every task should declare:

- `discoverability`: how the participant finds the primary action or information
- `comprehension`: how the participant demonstrates that labels and content are understandable
- `errorRecovery`: how the participant recovers from invalid input or a failed action
- `maxSteps` and `maxTimeSeconds`: the acceptable interaction length
- `successCriteria`: observable completion, not participant opinion alone

## Required metrics

| Metric | Meaning | Example target |
|---|---|---|
| `successRate` | participants completing without moderator rescue | `targetMin: 0.8` |
| `medianTimeSeconds` | median time to complete the task | `targetMax: 120` |
| `errorRate` | task attempts with a user error or wrong path | `targetMax: 0.2` |
| `assistanceRate` | attempts requiring moderator help | `targetMax: 0.2` |
| `susScore` | optional System Usability Scale score | `targetMin: 70` |

Keep participant IDs pseudonymous. Obtain consent before recording or storing
observations. Do not put names, email addresses, credentials or raw personal
data in the packet or evidence

Validate a plan before recruiting or running a session:

```bash
python3 hybrid-testing/ui-ux-review/scripts/check_usability_artifact.py usability.json
```

`READY` means the study contract is complete. `PASS` requires observed task
results, evidence and metrics that meet their declared targets. A design review
or a checklist without participant observations is not a usability `PASS`
