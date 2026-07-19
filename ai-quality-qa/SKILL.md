---
name: ai-quality-qa
description: Evaluate LLM, chatbot, copilot, RAG, agent, tool-calling, classification, extraction, and generative AI features for correctness, groundedness, safety, structured-output validity, regression, latency, reliability, and cost. Use when an AI coding agent needs to design golden datasets, run repeatable AI evaluations, compare prompts or models, inspect LangSmith-style traces, or produce evidence for OneBrain AI behavior.
---

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
