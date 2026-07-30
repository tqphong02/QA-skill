---
name: whitebox-qa
description: Analyze TypeScript, JavaScript, Python, Java, Go, C#, and Dart source code deterministically for named functions, control-flow branches, bounded execution paths, inter-function call graphs, NestJS modules and dependency injection, Jest/Vitest test generation, and runtime coverage evidence. Trigger on white-box or glass-box testing, branch/path/decision coverage, untested source logic, function-level test design, call graph, NestJS DI, `if`/`switch`/`try-catch`/early-return analysis, executable unit tests, or testcase documents derived from implementation logic; do not require the skill name. Use the bundled CLI and hand final testcase documents to `testcase-template`; never use a testcase template from an external plan.
---

# Whitebox QA

Use the local AST CLI as the parser. Use AI only to select scope, reconcile requirements, create explicit mappings, and interpret verified output.

## Hard gates

1. Resolve an exact repository and named function or method
2. Run `find` when file or class is unknown
3. Stop on multiple matches; require exact `--file` and optionally `--class`
4. Keep `sourceHash`, language, parser, branch IDs, path IDs, limits, and warnings with every result
5. Label static output and every generated candidate `source-derived-candidate`
6. Say `covered`, `uncovered`, or report a percentage only after a runtime report is imported
   Before import, preserve the exact state `No runtime coverage evidence supplied`
7. Do not modify application source unless the user separately requests implementation
8. Generate Jest/Vitest only from an explicit mapping with executable body lines; never emit `TODO` tests
9. Do not create a testcase workbook directly; use [testcase handoff](references/testcase-handoff.md)
10. Stop testcase document generation when expected behavior or requirement mapping is unresolved

## Runtime doctor

From this skill directory:

```bash
npm install
npm run build
npm run test:coverage
npm run benchmark
```

Node.js 20 or newer is required. MCP is not required. Report missing dependencies as `runtime_missing` and build failures with the exact compiler error.

## Resolve and analyze

Find every exact match:

```bash
npm run cli -- find processPayment --repo /absolute/repository
```

Analyze one resolved target:

```bash
npm run cli -- analyze \
  --repo /absolute/repository \
  --file src/payment/payment.service.ts \
  --class PaymentService \
  --function processPayment
```

The default is compact JSON to limit context usage. Use full JSON only for test generation, runtime coverage, or testcase handoff:

```bash
npm run cli -- analyze \
  --repo /absolute/repository \
  --file src/payment/payment.service.ts \
  --class PaymentService \
  --function processPayment \
  --format json \
  --output /absolute/repository/reports/process-payment
```

Read [analysis schema](references/analysis-schema.md) before interpreting full output and [token budget](references/token-budget.md) before expanding repository scope.

## Build a bounded call graph

```bash
npm run cli -- graph \
  --repo /absolute/repository \
  --file src/payment/payment.service.ts \
  --class PaymentService \
  --function processPayment \
  --max-depth 5 \
  --max-nodes 100
```

The graph works for every supported language. Resolved edges may be traversed; ambiguous, external, reflective, or dynamic calls remain explicit unresolved edges. Read [graphs and NestJS](references/graphs-and-nestjs.md).

For NestJS module, controller, route, provider, and constructor-DI extraction:

```bash
npm run cli -- nestjs \
  --repo /absolute/repository \
  --output /absolute/repository/reports/nestjs-graph.json
```

## Generate executable Jest or Vitest

Analyze with `--format json`, then create an explicit unit-test mapping:

```bash
npm run cli -- generate-test \
  --analysis reports/process-payment.json \
  --mapping reports/process-payment.unit-test-mapping.json \
  --output tests/process-payment.whitebox.test.ts
```

The generated file contains real imports, setup, hooks, assertions supplied by the mapping, and trace comments for candidate/path/branch IDs. The command rejects unknown or duplicate candidate IDs. Read [unit tests and runtime coverage](references/unit-tests-and-coverage.md).

## Run and import runtime coverage

Run the local project binary without invoking a shell:

```bash
npm run cli -- run-coverage \
  --runner vitest \
  --cwd /absolute/repository \
  --analysis reports/process-payment.json \
  --test tests/process-payment.whitebox.test.ts \
  --output reports/process-payment.runtime.json
```

Use `--runner jest` for Jest and `--config <path>` when the repository requires an explicit config. The command fails when tests fail, the local runner is missing, or `coverage-final.json` is absent.

If tests were run separately, import an existing Istanbul report:

```bash
npm run cli -- coverage \
  --analysis reports/process-payment.json \
  --report coverage/coverage-final.json \
  --output reports/process-payment.runtime.json
```

Runtime evidence changes each candidate's `runtimeCoverage` to `covered`, `partial`, `uncovered`, or `unknown`. The approval state remains `source-derived-candidate` until business expectations are confirmed.

## Generate testcase documents

Use the existing template generator only:

```bash
npm run cli -- handoff \
  --analysis reports/process-payment.runtime.json \
  --mapping reports/process-payment.mapping.json \
  --output-json reports/process-payment.testcases.json \
  --xlsx reports/process-payment-testcases.xlsx
```

The handoff validates explicit AC or `(out-of-spec)` mappings, creates canonical `testcase-template` JSON, and invokes `testcase-template/scripts/gen-testcases.py` to generate Markdown before Excel.

## Supported scope

| Language | Files | Parser |
|---|---|---|
| TypeScript | `.ts`, `.tsx` | ts-morph |
| JavaScript | `.js`, `.jsx` | ts-morph |
| Python | `.py` | ast-grep/tree-sitter |
| Java | `.java` | ast-grep/tree-sitter |
| Go | `.go` | ast-grep/tree-sitter |
| C# | `.cs` | ast-grep/tree-sitter |
| Dart | `.dart` | ast-grep/tree-sitter |

Static adapters normalize functions/methods, `if/else`, switch or match cases, `try/catch/finally`, loops, return, throw, path limits, and cyclomatic estimates. Read [language adapters](references/language-adapters.md) for language-specific behavior.

## Evidence levels

1. Static AST result: source-derived possibility
2. Generated executable test: code artifact, not proof it passed
3. Passing Jest/Vitest run: execution evidence for that run
4. Imported coverage counts: measured branch/statement evidence for the matching target revision
5. Requirement-mapped testcase: approved business expectation only after requirement review

Never collapse these levels into one claim.

## Known limits

- Compound boolean expressions are one decision unless their AST contains nested control-flow statements
- Call graphs are bounded and best-effort; reflection, runtime registration, generated code, interface dispatch, and external libraries can remain unresolved
- NestJS resolution covers decorators, module arrays, imports, constructor types, and `@Inject` tokens visible in source; custom provider factories and runtime tokens may remain unresolved
- Automatic runtime execution currently supports local Jest/Vitest with Istanbul JSON; other language runners need a compatible adapter or externally produced evidence
- Static reachability is not runtime proof, even when a path looks complete

## Resources

- [analysis schema](references/analysis-schema.md)
- [language adapters](references/language-adapters.md)
- [graphs and NestJS](references/graphs-and-nestjs.md)
- [unit tests and runtime coverage](references/unit-tests-and-coverage.md)
- [token budget](references/token-budget.md)
- [Windows and PowerShell](references/windows.md)
- [testcase handoff](references/testcase-handoff.md)
- [CLI entrypoint](src/cli.ts)
