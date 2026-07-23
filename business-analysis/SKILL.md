---
name: business-analysis
description: Analyze business requirements and system documents as a senior fullstack QA/QC tester, after converting non-Markdown sources through doc-to-md. Use when the user wants a connected system flow, editable XMind business map, prerequisites, related functions, requirement gap analysis, clarification questions, Q&A Markdown, or Q&A Excel before testcase design or browser testing. Produces a Vietnamese business flow with real XMind relationship arrows and matching Q&A deliverables from one hidden validated JSON source
---

# Business Analysis

Convert first, reason once, render deterministically

## Hard gates

0. **Trước khi đọc BRD/SRS, kiểm tra knowledge từ REPO_BUSINESS_DISCOVERY:**
   - Kiểm tra `qa-knowledge/merged/system-business-guide.md` — nếu có, đọc trước để nắm kiến trúc hệ thống
   - Kiểm tra `qa-knowledge/merged/system-qna.json` — nếu có, load Q&A đã xác nhận, không tạo lại duplicate
   - Kiểm tra `qa-knowledge/repositories/<repo>/reconciliation-report.json` — ưu tiên entries có `result: CONFIRMED`; hiển thị `CONFLICT` rõ ràng, không tự chọn một nguồn
   - Kiểm tra `qa-knowledge/repositories/<repo>/business-qna.json` — merge Q&A đã có, chỉ sinh Q&A mới cho phần chưa có
   - Nếu source và doc mâu thuẫn: ghi cả hai, đánh dấu `conflict`, yêu cầu con người xác nhận
   - Nếu không tìm thấy bất kỳ knowledge file nào: tiếp tục bình thường từ gate 1

1. Resolve the exact source documents and project output folder
2. For PDF, DOCX, PPTX, XLSX, HTML or image input, run `doc-to-md/scripts/convert.sh` first
3. Read the converted Markdown, not the binary document, and preserve source heading or requirement references
4. Review all 18 areas in [references/SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md)
5. Build one structured JSON using [references/INPUT_SCHEMA.md](references/INPUT_SCHEMA.md) and keep its human-readable content in Vietnamese
6. Define entry state, exit state, required business outcomes and explicit cross-flow links for every system flow
7. Build at least one end-to-end path in the internal `sanity_journeys` field with preparation conditions, ordered functions, transition conditions, business control points and final results
8. Never turn an observed behavior or inference into a confirmed business rule
9. Run `scripts/generate.sh` to create XMind and both Q&A formats
10. Validate and read back the generated Markdown, Excel IDs and XMind package before reporting success

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

For every flow, also record:

- Entry state and exit state
- Preconditions that must be prepared before executing the business flow
- Ordered system processing steps and state changes
- Minimum business outcomes that prove the flow completed correctly
- Upstream and downstream functions through top-level `flow_links`
- End-to-end execution paths through the internal `sanity_journeys` field

Mark each fact `verified`, `inferred` or `unresolved` with a source reference

### 3. Perform senior QA/QC review

Read [references/SENIOR_REVIEW_CHECKLIST.md](references/SENIOR_REVIEW_CHECKLIST.md) completely

For every review area, set exactly one status:

- `checked` when the document is clear enough or questions were created
- `blocked` when the source, role or context is missing
- `not_applicable` only with a reason

Create Q&A for ambiguity, contradiction, missing rule, untestable expectation, unsafe assumption or unclear ownership. Keep proposed assumptions separate from confirmed answers

### 4. Save the structured source

Save the machine source inside a hidden technical folder:

```text
<project-output>/.business-analysis/<project-name>_Analysis_Source.json
```

This JSON is not a user deliverable. It is the internal source that keeps IDs and content synchronized across Markdown, Excel and XMind. Update the JSON and regenerate instead of editing those three outputs independently

### 5. Generate all outputs

```bash
bash scripts/generate.sh \
  .business-analysis/<project-name>_Analysis_Source.json \
  <project-output> \
  <project-name>
```

Outputs:

```text
<project-name>_Business_Flow.xmind
<project-name>_Q&A.md
<project-name>_Q&A.xlsx
```

The XMind file is generated with the official `xmindmark` package and remains editable in XMind

The XMind is a business and system flow map, not a document dump or test report. It must show the end-to-end system sequence, prerequisites, entry and exit states, required business outcomes, related functions and real relationship arrows between linked flows. Keep detailed Q&A and review coverage in Markdown and Excel only

The XMind must use exactly one `Luồng hệ thống` sheet so readers see the end-to-end journey and its functions on the same canvas. Render each internal journey path as a horizontal lane under the shared root. Every lane step is the real system function, not a separate summary node. Keep prerequisites, states, business control points, required outcomes and related functions folded under that same function node

### 6. Read back

- Open Q&A Markdown and verify question count, priority and nontechnical readability
- Open Excel and verify the same Question IDs and content
- Run `node scripts/render-xmind.mjs --check <file.xmind> <analysis.json>` and verify journey and relationship counts
- Report `BLOCKED` when conversion, review coverage, dependency or output validation fails

## Output rules

- Q&A Markdown and Excel must have matching Question IDs and content
- All user-facing headings, descriptions, questions, assumptions and workbook labels must be Vietnamese
- Keep filenames in English using exactly `<project-name>_Business_Flow.xmind`, `<project-name>_Q&A.md` and `<project-name>_Q&A.xlsx`
- Use a restrained navy, teal, blue, amber, red and green palette with readable contrast
- Keep the internal JSON under `.business-analysis` and do not present it as a deliverable
- Keep document paths, section codes, `source_ref` and missing-source diagnostics only in the hidden JSON, never in user-facing Markdown, Excel or XMind
- Use plain business language so a nontechnical reader can understand every visible field
- Keep XMind focused on business flow and connected system behavior, not testing terminology, the complete Q&A or the 18-area review log
- Every XMind flow must show prerequisites, entry state, ordered processing, exit state, required business outcomes and related functions
- Render every item in `flow_links` as a visible function-to-function section and a real XMind relationship arrow
- Create exactly one `Luồng hệ thống` sheet containing every business journey and every function
- Render each internal `sanity_journeys` path as a horizontal business lane on the shared canvas
- Show preparation conditions, every ordered function and final result in the same lane
- Put transition conditions, business control points, entry and exit states, prerequisites, required outcomes and related functions under the matching function node
- Fold function detail branches by default so the connected flow remains compact and readable
- Render both journey transitions and every `flow_links` item as real relationship arrows on the same sheet
- Never move function relationships or detailed function context to separate sheets
- Keep the legacy JSON keys `sanity_journeys` and `sanity_checks` internal only and never render those names, `SANITY-*` IDs or testing terms in XMind
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
