# Sheet testcase execution

Read this reference only for `SHEET_TESTCASE_EXECUTION`

## Contract

- Use [TESTCASE_SHEET_SCHEMA.json](TESTCASE_SHEET_SCHEMA.json); do not rediscover the standard header layout
- Treat B-H as read-only test design and I-M as write columns. Preserve `[S01]`, `[S02]` and `[OUTCOME]` execution order
- Resolve semantic targets against the same live session; never invent a selector or expected result
- Generate the plan first:

```bash
node <skill-root>/scripts/helpers/execute-sheet.mjs \
  --sheet-url <URL> --module <requested-if-known> --parallel --plan-only
```

- Read `evidence/sheet/_runs/<date>/<run-id>/sheet-worker-plan.json`, show requested/resolved/available groups and testcase count, then require three explicit confirmations: exact module, worker count 1-4 and `all|worker IDs|cancel`. Prompt scope is only a filter, not confirmation
- Resume with `--module <requested> --confirmed-module <confirmed> --workers <count> --selected-workers <selection>`. Missing confirmation stops before browser/write-back
- Shard rows without duplication; isolate browser session, data namespace and evidence directory per worker
- Validate worker JSON against [SHEET_WORKER_RESULT_SCHEMA.json](SHEET_WORKER_RESULT_SCHEMA.json). Every `Pass`/`Fail` needs an existing screenshot/video; `Fail`, `Untest` and `N/A` need a concise Note
- Store media under `evidence/sheet/<functional-group>/<date>/<run-id>/worker-<id>/` and run metadata under `evidence/sheet/_runs/<date>/<run-id>/`. Reject media outside the assigned scope
- Write exactly `Pass|Fail|N/A|Untest` to Result and `Critical|High|Medium|Low` to Priority. Never update a result before media validation
- Finish Sanity, Impacted Regression and `DISCOVERY_CORE`; add Original Retest and Plane actions only for rows linked to a ticket or previous failure

Read [the shared execution contract](../testcase-template/references/execution-contract.md) when testcase Markdown/JSON exists and [RETEST-PLUS.md](RETEST-PLUS.md) for the composed QA layers
