---
name: dynamic-ai-evaluation
description: Evaluate LLM, chatbot, copilot, RAG, agent, tool-calling, classification, and extraction quality for correctness, grounding, safety, structured output, latency, reliability, and cost. Trigger on hallucination, prompt/model comparison, golden datasets, evals, traces, or AI regression. Auto-route; do not require the skill name.
mode: dynamic
surface: ai
role: evaluator
legacy_aliases: ai-quality-qa
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
# AI Quality QA

Evaluate behavior statistically and case-by-case. Do not judge an AI feature from a few conversational examples.

## Hard gates

1. Resolve feature, model or prompt version, environment, dataset, expected behavior, allowed tools, safety policy, and budget
2. Freeze a versioned evaluation dataset before comparing candidates
3. Keep secrets, personal data, hidden prompts, and credentials out of evaluation artifacts
4. Separate deterministic assertions, rubric judgments, safety checks, and human review
5. Use the same dataset and evaluator configuration for comparisons
6. Never mark hallucination, grounding, or safety as passed from exact-match rate alone
7. Record model, prompt, retrieval, tool, temperature, seed when supported, latency, token use, and cost

Read [references/EVALUATION_MATRIX.md](references/EVALUATION_MATRIX.md) when choosing metrics and coverage.

## Workflow

### 1. Define the contract

Record:

- User intent and supported use cases
- Allowed and forbidden behavior
- Required sources or grounding
- Expected output schema
- Tool permissions and side effects
- Language and locale
- Quality, latency, reliability, and cost thresholds
- Escalation and refusal behavior

### 2. Build a versioned dataset

Include happy paths, boundary inputs, ambiguous requests, missing context, multilingual inputs, prompt injection, sensitive data, unavailable tools, tool errors, long context, and known regressions. Give every case a stable ID and source.

Split datasets into development and holdout sets. Do not tune prompts directly against the final holdout set.

### 3. Select evaluators

- Use deterministic code for JSON validity, schema, required fields, citations, tool name, arguments, forbidden terms, latency, and cost
- Use reference matching only where wording is genuinely deterministic
- Use rubric-based model judgment for relevance or tone, with a written rubric and periodic human calibration
- Use human review for high-impact safety, nuanced grounding, or disagreements between evaluators

For JSONL datasets with deterministic expectations:

```bash
python3 scripts/evaluate_jsonl.py cases.jsonl \
  --min-pass-rate 0.95 \
  --max-p95-latency-ms 5000 \
  --output evidence/ai-eval.json
```

For QA-skill routing changes, run `node scripts/benchmark-core-routing.mjs` for accumulated regression and add `--certification` only for a frozen one-shot holdout that was not used for tuning. Treat its UTF-8/4 instruction count as a deterministic proxy only. A report with `provider_reported.status: NOT_MEASURED` validates routing speed and context bounds but does not certify real model token use, cost or end-to-end latency

### 4. Run and trace

Capture one record per case containing input ID, configuration version, output, retrieved source IDs, tool calls, latency, tokens, cost, evaluator results, and redacted trace reference. Do not store raw secrets or unrestricted personal data.

### 5. Analyze failures

Classify failures as prompt, retrieval, context, tool selection, tool arguments, model reasoning, structured output, policy, latency, cost, infrastructure, or evaluator ambiguity. Reproduce with the same configuration and compare a control case.

### 6. Compare candidates

Report paired results by case, not only aggregate averages. A candidate passes only when required quality and safety thresholds hold and no critical regression is hidden by a higher average score.

### 7. Report

Include dataset version, configuration versions, thresholds, aggregate metrics, failed case IDs, severity, trace references, cost, latency distribution, known evaluator limitations, and coverage gaps.

## Completion checks

- Dataset and configuration are versioned
- Holdout cases were not used for prompt tuning
- Deterministic and subjective evaluators are separated
- Grounding and tool calls have direct evidence
- Safety-critical failures are reviewed individually
- Latency and cost include p95 or another agreed percentile
- Candidate comparison uses the same cases
- Failed and blocked cases remain visible
