---
name: business-analysis
description: Analyze business requirements and system documents as a senior fullstack QA/QC tester, after converting non-Markdown sources through doc-to-md. Use when the user wants a business flow map, editable XMind file, requirement gap analysis, ambiguity review, clarification questions, Q&A Markdown, or Q&A Excel before testcase design or browser testing. Produces matching business-flow.xmind, business-qa.md, and business-qa.xlsx from one validated analysis JSON source
---

# Business Analysis

Convert first, reason once, render deterministically

## Hard gates

1. Resolve the exact source documents and project output folder
2. For PDF, DOCX, PPTX, XLSX, HTML or image input, run `doc-to-md/scripts/convert.sh` first
3. Read the converted Markdown, not the binary document, and preserve source heading or requirement references
4. Review all 18 areas in [references/SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md)
5. Build one structured JSON using [references/INPUT_SCHEMA.md](references/INPUT_SCHEMA.md)
6. Never turn an observed behavior or inference into a confirmed business rule
7. Run `scripts/generate.sh` to create XMind and both Q&A formats
8. Validate and read back the generated Markdown, Excel IDs and XMind package before reporting success

Do not write testcases in this skill. Hand the confirmed Markdown and Q&A answers to `testcase-template` later

## Workflow

### 1. Convert the source

If the source is not Markdown:

```bash
bash <doc-to-md>/scripts/convert.sh <source-file> <project-output>/<source-stem>.md
```

Keep the Markdown beside the analysis outputs so future AI can reread it without parsing the original binary

### 2. Extract the business model

Record only what the source supports:

- Scope, actors and permissions
- Module and entry point
- Preconditions and trigger
- Happy, alternate and exception flows
- State transitions and persistence
- Business rules, input validation and calculations
- Side effects, API, data and third-party integration
- UI/UX, accessibility and non-functional expectations
- Acceptance criteria and testability

Mark each fact `verified`, `inferred` or `unresolved` with a source reference

### 3. Perform senior QA/QC review

Read [references/SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md) completely

For every review area, set exactly one status:

- `checked` when the document is clear enough or questions were created
- `blocked` when the source, role or context is missing
- `not_applicable` only with a reason

Create Q&A for ambiguity, contradiction, missing rule, untestable expectation, unsafe assumption or unclear ownership. Keep proposed assumptions separate from confirmed answers

### 4. Save the structured source

Save as:

```text
<project-output>/<project-slug>-business-analysis.json
```

This JSON is the single source for all generated artifacts. Update the JSON and regenerate instead of editing Markdown, Excel and XMind independently

### 5. Generate all outputs

```bash
bash scripts/generate.sh \
  <project-slug>-business-analysis.json \
  <project-output> \
  <project-slug>
```

Outputs:

```text
<project-slug>-business-flow.xmind
<project-slug>-business-qa.md
<project-slug>-business-qa.xlsx
```

The XMind file is generated with the official `xmindmark` package and remains editable in XMind

### 6. Read back

- Open Q&A Markdown and verify question count, priority and source references
- Open Excel and verify the same Question IDs and content
- Run `node scripts/render-xmind.mjs --check <file.xmind>`
- Report `BLOCKED` when conversion, review coverage, dependency or output validation fails

## Output rules

- Q&A Markdown and Excel must have matching Question IDs and content
- Keep unanswered questions `Open` with an empty Answer
- Use `Answered` only when an authority supplied the answer
- Do not use emoji or icons
- Do not end human-readable cells or list items with `.`
- Preserve IDs, URLs, filenames, formulas, decimals, API fields and code exactly
- Do not store passwords, tokens, cookies, API keys or personal sensitive data

## Resources

- [references/INPUT_SCHEMA.md](references/INPUT_SCHEMA.md) for the analysis JSON contract
- [references/SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md) for the fullstack QA/QC review
- [scripts/generate.sh](scripts/generate.sh) for the complete renderer pipeline
- [scripts/render-qa.py](scripts/render-qa.py) for matching Markdown and Excel Q&A
- [scripts/render-xmind.mjs](scripts/render-xmind.mjs) for editable XMind output
- [examples/sample-analysis.json](examples/sample-analysis.json) for a cross-model example
