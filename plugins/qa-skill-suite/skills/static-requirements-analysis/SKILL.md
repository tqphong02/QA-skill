---
name: static-requirements-analysis
description: Analyze BRD, SRS, FRS, requirements, and system documents into source-grounded business flows, bounded clarification Q&A, editable XMind, and synchronized Markdown/Excel. Trigger on BRD, SRS, FRS, requirements, business-flow, ambiguity, or clarification analysis requests. Use support-document-conversion for local non-Markdown files and integration-google-drive for Drive sources. Auto-route; do not require the skill name.
mode: static
surface: requirements
role: analysis
legacy_aliases: business-analysis
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# Business Analysis

Build a closed-world model from the supplied requirement sources, reconcile it with the previous model, render once, and stop. Do not create testcases in this skill

## Hard gates

1. Resolve the exact source files and output folder. Route Drive URLs/IDs to `integration-google-drive`
2. For PDF/DOCX/PPTX/XLSX/HTML/image input, run `../support-document-conversion/scripts/convert.sh` first and analyze only the resulting Markdown
3. Read existing canonical analysis/Q&A plus `qa-knowledge/merged/system-business-guide.md`, `system-qna.json` and reconciliation/runtime/Graphify artifacts when present; preserve conflicts and never promote runtime or Graphify evidence to a documented requirement
4. Read [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md), but treat its 18 areas as review lenses, never as a quota for flows or questions
5. Build one `.static-testing/requirements-analysis/<project-name>_Analysis_Source.json` from [INPUT_SCHEMA.md](references/INPUT_SCHEMA.md). Every flow needs a stable `semantic_key`, exact `source_ref`, and `source_excerpt` that exists in a supplied Markdown source
6. Use closed-world extraction: include only behavior stated by a source or the minimum connective inference needed to represent a stated end-to-end flow. Mark connective inference `inferred`; never invent generic UI, security, audit, retry, concurrency, performance, migration, API or exception logic because a checklist mentions it
7. Create Q&A only for one material decision that changes an in-scope outcome, state, permission, calculation, data contract or acceptance criterion. Each question needs one stable `decision_key`, exact source evidence and existing impacted flow/requirement IDs. Zero questions is valid
8. Reconcile by semantic identity, never append blindly. Reuse IDs, update matching records in place, close answered items, retire unsupported items, and merge multiple review observations that share one root decision
9. Run `scripts/generate.sh`, read back Markdown/Excel/XMind and fail closed on source drift, unsupported evidence, unchanged-source growth, dependency, ID or output mismatch

## Workflow

### 1. Convert and freeze the source set

For local non-Markdown input:

```text
bash <support-document-conversion>/scripts/convert.sh <source-file> <project-output>/<source-stem>.md
```

Keep converted Markdown beside the outputs and preserve headings/requirement IDs. `source_markdown` is the complete source set for the run. Do not silently add repository knowledge, previous model prose or runtime observations as requirement sources

### 2. Extract a bounded model

Start from explicit scope, actors, named capabilities and acceptance statements in the source. Create a flow only when its `source_excerpt` proves the capability exists. A flow may contain sourced steps plus clearly marked connective inference, but it must not grow auxiliary behavior from generic domain expectations

For each sourced flow, capture actors/permissions, entry and exit state, prerequisites, ordered functions, transitions, outcomes, controls, side effects and relevant `flow_links`. Include at least one `sanity_journeys` path that uses existing flow IDs; the journey is a view of those flows, not a source of new logic

Mark facts `verified`, `inferred` or `unresolved`. An inference cannot become `verified` without a source excerpt or an authority-supplied answer added to the source set

### 3. Reconcile and ask only material questions

On the first run, establish stable `semantic_key` and `decision_key` values. On later runs, rebuild from the current sources and reconcile:

- Same source snapshot: preserve or reduce the semantic flow/question set; do not add a new key
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

The generator also writes internal convergence state and exports `.static-testing/requirements-analysis/<project-name>_Requirements.json` when `requirements` exists. XMind uses exactly one `Luồng hệ thống` sheet and renders only the flows and relationships present in the validated JSON

Every run ends after one validated render with exactly one execution result:

- `DONE`: source review and outputs completed with no active Q&A
- `DONE_WITH_OPEN_QA`: source review and outputs completed with a bounded active Q&A set
- `BLOCKED`: required source cannot be read, evidence is unsupported, source changed during analysis, unchanged sources introduce new semantic keys, or generation/read-back fails

`DONE_WITH_OPEN_QA` is terminal for the current snapshot. Do not start another analysis pass or add more questions unless a source changes or the user explicitly supplies new authority evidence

### 5. Read back

- Compare Question IDs, counts, source refs and impacted IDs across Markdown and Excel
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

[INPUT_SCHEMA.md](references/INPUT_SCHEMA.md), [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md), [scripts/generate.sh](scripts/generate.sh), [scripts/convergence.py](scripts/convergence.py), [scripts/render-qa.py](scripts/render-qa.py), [scripts/render-xmind.mjs](scripts/render-xmind.mjs), [scripts/export-requirements.py](scripts/export-requirements.py), [examples/sample-analysis.json](examples/sample-analysis.json)
