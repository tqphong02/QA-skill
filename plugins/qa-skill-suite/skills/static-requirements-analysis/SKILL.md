---
name: static-requirements-analysis
description: Analyze BRD, SRS, FRS, requirements, and system documents for business flows, prerequisites, related functions, gaps, ambiguities, clarification questions, editable XMind, and Q&A Markdown/Excel. Trigger on BRD, SRS, FRS, requirements, business-flow, ambiguity, or clarification analysis requests. Use support-document-conversion for local non-Markdown files and integration-google-drive for Drive sources. Auto-route; do not require the skill name.
mode: static
surface: requirements
role: analysis
legacy_aliases: business-analysis
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# Business Analysis

Convert once, build one validated source JSON, then render synchronized outputs. Do not create testcases in this skill

## Hard gates

1. Check existing `qa-knowledge/merged/system-business-guide.md`, `system-qna.json` and repository reconciliation/runtime/Graphify artifacts first; preserve conflicts and never promote Graphify to verified
2. Resolve exact source files and output folder. Route Drive URLs/IDs to `integration-google-drive`
3. For PDF/DOCX/PPTX/XLSX/HTML/image input, run `../support-document-conversion/scripts/convert.sh` first and analyze the resulting Markdown
4. Read [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md) and review all 18 areas
5. Build one `../<project-name>_Analysis_Source.json` from [INPUT_SCHEMA.md](references/INPUT_SCHEMA.md), with provenance and Vietnamese human-facing content
6. For every flow record actors/permissions, entry and exit state, prerequisites, ordered functions, transitions, outcomes, controls, side effects and `flow_links`; include at least one `sanity_journeys` path
7. Mark each fact `verified`, `inferred` or `unresolved`; contradictions require human confirmation
8. For browser reconciliation, include atomic requirements with stable IDs/source refs and export the handoff registry
9. Run `scripts/generate.sh`, read back Markdown/Excel/XMind and fail closed on conversion, review, dependency, ID or output mismatch

## Workflow

### 1. Convert and scope

For local non-Markdown input:

```text
bash <support-document-conversion>/scripts/convert.sh <source-file> <project-output>/<source-stem>.md
```

Keep the Markdown beside the outputs and preserve heading/requirement references. Never retype binary content or turn runtime observation into a confirmed rule

### 2. Extract the model

Cover scope/actors/permissions, modules/entry points, preconditions/triggers, happy/alternate/exception flows, state/persistence, validation/calculation, integrations/data/API, UI/UX/accessibility, non-functional expectations, acceptance and testability. Store end-to-end processing and related functions in `flow_links` and `sanity_journeys`

### 3. Review and render

Set each review area to `checked`, `blocked` or justified `not_applicable`; create Q&A for ambiguity, contradiction, missing rule, unsafe assumption, untestable expectation or unclear ownership. Keep assumptions separate from answers

```text
bash scripts/generate.sh \
  ../<project-name>_Analysis_Source.json \
  <project-output> <project-name>
```

Required outputs:

```text
<project-name>_Business_Flow.xmind
<project-name>_Q&A.md
<project-name>_Q&A.xlsx
```

The generator also exports `../<project-name>_Requirements.json` when `requirements` exists. XMind uses exactly one `Luồng hệ thống` sheet, shows prerequisites → functions → states/outcomes and real `flow_links`/journey arrows, and remains an editable business-flow map rather than a Q&A dump

### 4. Read back

- Compare Question IDs, counts and content across Markdown and Excel
- Run `node scripts/render-xmind.mjs --check <file.xmind> <analysis.json>` and verify journey/relationship counts
- Keep unanswered questions `Open` with empty Answer; use `Answered` only for authority-supplied answers
- Report `BLOCKED` when required source, review, dependency or validation evidence is missing

### 5. Optional HTML

Only when requested, read [GRAPHIFY-EFFECTIVE-HTML.md](../dynamic-web-exploratory/references/GRAPHIFY-EFFECTIVE-HTML.md) and render from the validated JSON with `render-intelligence-html.mjs`; pass `--check`. HTML is derived and never replaces the `.xmind`, Q&A Markdown, Q&A Excel or canonical JSON

## Output contract

- User-facing headings, descriptions, questions, assumptions and workbook labels are Vietnamese; preserve IDs, URLs, filenames, formulas, decimals, API fields and code
- Filenames are exactly `<project-name>_Business_Flow.xmind`, `<project-name>_Q&A.md` and `<project-name>_Q&A.xlsx`
- Keep internal JSON under `..`; do not expose source paths or diagnostics in deliverable prose
- Do not use emoji/icons or end human-readable cells/list items with `.`
- Do not store passwords, tokens, cookies, API keys or personal sensitive data

## Resources

[INPUT_SCHEMA.md](references/INPUT_SCHEMA.md), [SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md), [scripts/generate.sh](scripts/generate.sh), [scripts/render-qa.py](scripts/render-qa.py), [scripts/render-xmind.mjs](scripts/render-xmind.mjs), [scripts/export-requirements.py](scripts/export-requirements.py), [examples/sample-analysis.json](examples/sample-analysis.json)
