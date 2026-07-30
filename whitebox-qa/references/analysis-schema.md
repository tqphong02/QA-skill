# Analysis schema v2

Read this reference when interpreting `whitebox analyze` or runtime-enriched JSON.

## Target and integrity

- `analysisVersion` is `2.0`
- `target.filePath`, `className`, `functionName`, and line range identify the exact function
- `target.language` and `target.parser` identify the selected AST adapter
- `target.sourceHash` is SHA-256 of the analyzed function text
- Re-run static analysis when the source hash changes; do not attach old coverage to changed code

## Branch and path model

- `branches[]` contains `if`, `switch`, `try-catch`, `loop`, `throw`, and `return`
- `branches[].paths[].id` is a branch outcome such as `BR-001-T`
- `paths[].id` is a bounded symbolic execution path such as `PATH-001`
- Compound boolean expressions remain one decision
- Loop paths approximate zero and one iteration
- IDs are local to one source revision

`path-coverage` means bounded paths were enumerated. `branch-coverage` means a configured limit was reached and output falls back to one candidate per detected branch outcome. Defaults are 20 decisions, 50 paths, and nesting depth 5.

## Metrics

- `decisionCount`: normalized decisions
- `branchOutcomeCount`: possible outcomes of those decisions
- `exitCount`: detected return and throw exits
- `estimatedCyclomaticComplexity`: decisions + 1
- `pathCount`: emitted paths in the selected analysis mode

These metrics are static estimates.

## Candidate and runtime state

Each `testcaseCandidates[]` entry always has:

- `approvalState: source-derived-candidate`
- `runtimeCoverage: not-measured | covered | partial | uncovered | unknown`

`candidateCoverage` describes whether static outcomes received a candidate. It is not runtime coverage.

Before runtime evidence:

```json
{
  "coverage": {
    "measured": false,
    "provider": null,
    "statement": null,
    "branch": null,
    "note": "No runtime coverage evidence supplied"
  }
}
```

After Istanbul import, `coverage.measured` is true and `branchEvidence[]` records each mapped branch path ID, execution count, and status. `unknown` means the report could not map that source location; do not convert it to uncovered.

## Token budget

When attached by the CLI:

- `fullJsonApproxTokens`: estimate for the complete analysis
- `compactJsonApproxTokens`: estimate for the compact interpretation view
- estimator is UTF-8 bytes divided by 4, not an exact model tokenizer

## Warning codes

- `PATH_EXPLOSION`
- `MAX_BRANCHES_EXCEEDED`
- `MAX_DEPTH_EXCEEDED`
- `LOOP_APPROXIMATED`
- `SWITCH_FALLTHROUGH_REVIEW`
- `DYNAMIC_EXECUTION`

Warnings require manual review and must not be suppressed in a final report.
