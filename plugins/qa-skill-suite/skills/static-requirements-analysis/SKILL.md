---
name: static-requirements-analysis
description: Analyze BRD, SRS, FRS, business and API requirements into source-grounded goals, rules, validations, dependencies, risks, flows, bounded clarification Q&A, editable XMind, and synchronized Markdown/Excel. Trigger on requirement analysis, static testing of requirements, business-flow, ambiguity, missing requirements, or BA/Dev clarification requests. Use support-document-conversion for local non-Markdown files and integration-google-drive for Drive sources. Auto-route; do not require the skill name.
mode: static
surface: requirements
role: analysis
legacy_aliases: business-analysis
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


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
# Business Analysis

Build a closed-world model from the supplied requirement sources, reconcile it with the previous model, render once, and stop. Do not create testcases in this skill

## Hard gates

1. Run `node scripts/doctor.mjs`; report `runtime_missing` instead of attempting generation when Bash, Python/openpyxl, Node or xmindmark is unavailable
2. Resolve the exact source files and output folder. Route Drive URLs/IDs to `integration-google-drive`
3. For PDF/DOCX/PPTX/XLSX/HTML/image input, run `../support-document-conversion/scripts/convert.sh` first and analyze only the resulting Markdown
4. Read existing canonical analysis/Q&A plus `qa-knowledge/merged/system-business-guide.md`, `system-qna.json` and reconciliation/runtime/Graphify artifacts when present; preserve conflicts and never promote runtime or Graphify evidence to a documented requirement
5. Read [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md) and [REFINEMENT_QUESTIONING_GUIDE.md](references/REFINEMENT_QUESTIONING_GUIDE.md); treat their 18 areas, 5 core refinement questions, and 5W1H probes as review lenses, never as a quota for flows or questions
6. Build one `.static-testing/requirements-analysis/<project-name>_Analysis_Source.json` from [INPUT_SCHEMA.md](references/INPUT_SCHEMA.md). Every goal, atomic requirement, rule, dependency, risk, API operation and flow needs a stable semantic identity plus exact source evidence
7. Use closed-world extraction: include only behavior stated by a source or the minimum connective inference needed to represent a stated end-to-end flow. Mark connective inference `inferred`; never invent generic UI, security, audit, retry, concurrency, performance, migration, API or exception logic because a checklist mentions it
8. Create Q&A only for one material decision that changes an in-scope outcome, state, permission, calculation, data contract or acceptance criterion. Each question needs one stable `decision_key`, exact source evidence and existing impacted flow/requirement IDs. Zero questions is valid
9. Reconcile by semantic identity, never append blindly. Reuse IDs, update matching records in place, close answered items, retire unsupported items, and merge multiple review observations that share one root decision
10. When the source defines an API, read [API_REQUIREMENTS.md](references/API_REQUIREMENTS.md), capture only documented API behavior and export the contract handoff. Static analysis does not prove implementation behavior; route spec-versus-runtime validation to `hybrid-api-contract`
11. Run `scripts/generate.sh`, read back Markdown/Excel/XMind and fail closed on source drift, unsupported evidence, unchanged-source growth, dependency, ID or output mismatch
12. Only when the user explicitly asks to recover behavior from code because no usable BRD/SRS exists, read [SOURCE_SPEC_MINING.md](references/SOURCE_SPEC_MINING.md); mined statements stay `candidate` with `EXTRACTED`/`INFERRED`/`AMBIGUOUS` labels and become Q&A, never confirmed requirements

## Workflow

### 1. Convert and freeze the source set

For local non-Markdown input:

```text
bash <support-document-conversion>/scripts/convert.sh <source-file> <project-output>/<source-stem>.md
```

Keep converted Markdown beside the outputs and preserve headings/requirement IDs. `source_markdown` is the complete source set for the run. Do not silently add repository knowledge, previous model prose or runtime observations as requirement sources

### 2. Extract a bounded model

Start from explicit business goals, scope, actors, named capabilities and acceptance statements in the source. Create a flow only when its `source_excerpt` proves the capability exists. A flow may contain sourced steps plus clearly marked connective inference, but it must not grow auxiliary behavior from generic domain expectations

Model functional requirements, business rules, validation rules, dependencies and risks as stable source-grounded records linked by IDs. For each sourced flow, capture actors/permissions, entry and exit state, prerequisites, ordered functions, transitions, outcomes, controls, side effects and relevant `flow_links`. Include at least one `sanity_journeys` path that uses existing flow IDs; the journey is a view of those flows, not a source of new logic

Mark facts `verified`, `inferred` or `unresolved`. An inference cannot become `verified` without a source excerpt or an authority-supplied answer added to the source set

### 3. Reconcile and ask only material questions

On the first run, establish stable `semantic_key` and `decision_key` values. On later runs, rebuild from the current sources and reconcile:

- Same source snapshot: preserve or reduce every semantic entity set; do not add a new key
- Changed source snapshot: add a key only when the changed source contains its evidence
- Authority answer: update the existing question and affected facts in place; if it introduces new behavior, save the answer as a new Markdown source before adding a flow
- Removed or superseded source: remove unsupported flow logic and mark obsolete questions `Cancelled` instead of retaining them as active gaps

One root decision produces one question even when several checklist areas reference it. Do not create follow-up questions merely because another question is unanswered

Set each review area to `checked`, `blocked` or justified `not_applicable`. `blocked` means a material in-scope decision is missing and must reference an existing question. Silence about a generic quality attribute is `not_applicable` unless the source or stated scope makes that attribute necessary

### 4. Render once and terminate

```text
bash scripts/generate.sh \
  .static-testing/requirements-analysis/<project-name>_Analysis_Source.json \
  <project-output> <project-name>
```

Required outputs:

```text
<project-name>_Business_Flow.xmind
<project-name>_Q&A.md
<project-name>_Q&A.xlsx
```

The generator also writes internal convergence state and always refreshes `.static-testing/requirements-analysis/<project-name>_Requirements.json` plus `<project-name>_API_Contract_Handoff.json`, including empty registries, so stale data cannot survive a newer source snapshot. XMind uses exactly one `Luồng hệ thống` sheet and renders only the flows and relationships present in the validated JSON

Markdown and Excel include a synchronized requirement matrix covering `Business Goal`, `Functional Requirement`, `Business Rule`, `Validation Rule`, `Dependency`, `Risk`, `Missing Requirement` and `Questions for BA/Dev`. API handoff rows are documented expectations with `coverage_status: not_covered`, never runtime evidence

Every run ends after one validated render with exactly one execution result:

- `DONE`: source review and outputs completed with no active Q&A
- `DONE_WITH_OPEN_QA`: source review and outputs completed with a bounded active Q&A set
- `BLOCKED`: required source cannot be read, evidence is unsupported, source changed during analysis, unchanged sources introduce new semantic keys, or generation/read-back fails

`DONE_WITH_OPEN_QA` is terminal for the current snapshot. Do not start another analysis pass or add more questions unless a source changes or the user explicitly supplies new authority evidence

### 5. Read back

- Compare complete requirement-matrix, API-operation and Q&A rows across canonical JSON, Markdown and Excel
- Run `node scripts/render-xmind.mjs --check <file.xmind> <analysis.json>` and verify journey/relationship counts
- Keep unanswered questions `Open` with empty Answer; use `Answered` only for authority-supplied answers
- Report the generator's terminal result and the fixed counts of flows and active questions

### 6. Optional HTML

Only when requested, read [GRAPHIFY-EFFECTIVE-HTML.md](../dynamic-web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md) and render from the validated JSON with `render-intelligence-html.mjs`; pass `--check`. HTML is derived and never replaces the `.xmind`, Q&A Markdown, Q&A Excel or canonical JSON

## Output contract

- User-facing headings, descriptions, questions, assumptions and workbook labels are Vietnamese; preserve IDs, URLs, filenames, formulas, decimals, API fields and code
- Filenames are exactly `<project-name>_Business_Flow.xmind`, `<project-name>_Q&A.md` and `<project-name>_Q&A.xlsx`
- Show logical `source_ref` values such as `requirements.md#payment`; never expose absolute filesystem paths or diagnostics in deliverable prose
- Keep canonical and convergence JSON under `.static-testing/requirements-analysis`
- Do not use emoji/icons or end human-readable cells/list items with `.`
- Do not store passwords, tokens, cookies, API keys or personal sensitive data

## Resources

[INPUT_SCHEMA.md](references/INPUT_SCHEMA.md), [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md), [REFINEMENT_QUESTIONING_GUIDE.md](references/REFINEMENT_QUESTIONING_GUIDE.md), [API_REQUIREMENTS.md](references/API_REQUIREMENTS.md), [scripts/doctor.mjs](scripts/doctor.mjs), [scripts/generate.sh](scripts/generate.sh), [scripts/convergence.py](scripts/convergence.py), [scripts/render-qa.py](scripts/render-qa.py), [scripts/render-xmind.mjs](scripts/render-xmind.mjs), [scripts/export-requirements.py](scripts/export-requirements.py), [examples/sample-analysis.json](examples/sample-analysis.json)

## Known limitations

This skill operates on a strict closed-world assumption: only behavior explicitly stated in the supplied source documents is extracted. The following quality attributes are **never generated by inference** when the source is silent:

| Attribute | Behavior when source is silent |
|---|---|
| Security and authorization | No auth boundary, injection, rate-limit or masking logic is added; `review_coverage` area 13 is marked `not_applicable` |
| Performance and capacity | No SLA, timeout, pagination or volume expectation is invented; area 14 is marked `not_applicable` |
| Audit logging and observability | No who-changed-what or correlation-ID behavior is assumed; area 16 is marked `not_applicable` |
| Concurrency and idempotency | No double-submit or locking logic is added unless the source states it; area 12 is marked `not_applicable` |
| Error messages and recovery paths | Only error behavior explicitly described in the source is captured; generic fallback prose is not inferred |
| Migration and compatibility | No browser matrix, data migration or backward-compatibility requirement is assumed; area 17 is marked `not_applicable` |

To obtain analysis for any of the above areas, add the corresponding requirements to the source document and rerun. A `blocked` area in `review_coverage` means a material in-scope decision is genuinely missing and has an active Q&A item — it does not mean the skill failed to infer the behavior

This skill does not generate testcases. Route testcase authoring to `support-testcase-authoring` and spec-versus-runtime API validation to `hybrid-api-contract`
