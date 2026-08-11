# Token budget

The analyzer parses files locally. It does not require the model to read the whole repository.

## Default strategy

1. Use `find` to return only exact match metadata
2. Analyze one exact function
3. Keep the default compact JSON for interpretation
4. Request full JSON only for generation, coverage mapping, or testcase handoff
5. Build a bounded call graph before expanding to additional functions
6. Analyze downstream functions one by one

Compact output keeps target, metrics, paths, uncovered candidate outcomes, warnings, coverage summary, and token estimates. It omits verbose branch and testcase-candidate objects.

## Estimator

`tokenBudget` uses UTF-8 byte length divided by four. This is a stable local approximation, not the exact tokenizer of Claude, Gemini, or OpenAI models.

On the bundled fixtures, compact output is roughly 70% smaller than full analysis. Repository-specific results vary with path count and condition text.

Do not paste raw source, a full call graph, every full analysis, and coverage JSON into one prompt. Use hashes and IDs to join local artifacts.
