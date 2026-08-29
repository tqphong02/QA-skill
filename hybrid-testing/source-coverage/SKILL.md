---
name: hybrid-source-coverage
description: Analyze TypeScript, JavaScript, Python, Java, Go, C#, and Dart source for functions, branches, bounded paths, call graphs, NestJS DI, Jest/Vitest tests, and runtime coverage. Trigger on white-box testing, branch/path/decision coverage, untested logic, control flow, function-level tests, or implementation-derived testcases. Auto-route; do not require the skill name.
mode: hybrid
surface: source
role: analyzer
legacy_aliases: whitebox-qa
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
# Whitebox QA

Use the local AST CLI for parsing. AI selects bounded scope, reconciles requirements and interprets verified output; it does not turn static candidates into runtime claims

## Hard gates

- Resolve an exact repository and function/method; run `find` when unknown and stop on multiple matches until `--file`/`--class` is exact
- Keep `sourceHash`, language, parser, branch/path IDs, limits and warnings with every result
- Label static output and generated candidates `source-derived-candidate`
- Before importing a runtime report preserve exactly `No runtime coverage evidence supplied`; claim `covered`, `uncovered` or percentages only after matching runtime evidence
- Do not modify application source unless separately requested; generated tests require explicit mappings and executable bodies, never `TODO`
- Do not create a testcase workbook here; use [testcase-handoff.md](references/testcase-handoff.md) and `support/testcase-authoring/scripts/gen-testcases.py`
- Stop handoff when expected behavior or requirement mapping is unresolved

## Runtime doctor and bounded analysis

From this skill directory:

```text
npm install
npm run build
npm run test:coverage
npm run benchmark
```

Node 20+ is required; MCP is not. Missing tools are `runtime_missing`. Use compact JSON by default:

```text
npm run cli -- find processPayment --repo <repo>
npm run cli -- analyze --repo <repo> --file src/payment/payment.service.ts --class PaymentService --function processPayment
npm run cli -- graph --repo <repo> --file <file> --class <class> --function <function> --max-depth 5 --max-nodes 100
```

Read [analysis-schema.md](references/analysis-schema.md) for full JSON and [token-budget.md](references/token-budget.md) before expanding scope. Use full JSON only for generation, coverage or handoff

For NestJS routes/providers/constructor DI use:

```text
npm run cli -- nestjs --repo <repo> --output <repo>/reports/nestjs-graph.json
```

`NestJS`/Graphify relations remain bounded candidates; run local exact function analysis afterward. Read [graphs-and-nestjs.md](references/graphs-and-nestjs.md)

## Generate and run tests

Create an explicit mapping, then:

```text
npm run cli -- generate-test --analysis reports/<name>.json --mapping reports/<name>.unit-test-mapping.json --output tests/<name>.whitebox.test.ts
npm run cli -- run-coverage --runner vitest --cwd <repo> --analysis reports/<name>.json --test tests/<name>.whitebox.test.ts --output reports/<name>.runtime.json
npm run cli -- coverage --analysis reports/<name>.json --report coverage/coverage-final.json --output reports/<name>.runtime.json
```

Use `--runner jest` and `--config` when required. Runtime results distinguish `covered`, `partial`, `uncovered` and `unknown`; approval remains `source-derived-candidate` until business expectations are confirmed

## Testcase handoff

```text
npm run cli -- handoff --analysis reports/<name>.runtime.json --mapping reports/<name>.mapping.json --output-json reports/<name>.testcases.json --xlsx reports/<name>-testcases.xlsx
```

The handoff validates AC or `(out-of-spec)` mappings and invokes `support/testcase-authoring/scripts/gen-testcases.py` to generate Markdown before Excel

## Supported scope and evidence

| Language | Extensions | Parser |
|---|---|---|
| TypeScript/JavaScript | `.ts`, `.tsx`, `.js`, `.jsx` | ts-morph |
| Python | `.py` | ast-grep/tree-sitter |
| Java/Go/C#/Dart | `.java`, `.go`, `.cs`, `.dart` | ast-grep/tree-sitter |

Evidence levels are: static AST possibility → generated test artifact → passing Jest/Vitest run → imported runtime coverage → requirement-mapped testcase. Never collapse them

## Known limits and references

Compound booleans, reflection, generated code, dynamic registration, interface dispatch and external libraries can remain unresolved; static reachability is not runtime proof. Read [language-adapters.md](references/language-adapters.md), [unit-tests-and-coverage.md](references/unit-tests-and-coverage.md), [windows.md](references/windows.md), [testcase-handoff.md](references/testcase-handoff.md) or [GRAPHIFY-EFFECTIVE-HTML.md](../../dynamic-testing/web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md) only when needed. HTML is a derived view and cannot change evidence level
