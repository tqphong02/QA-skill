import type { Analysis } from "./types.js";

export function approximateTokens(value: unknown): number {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value), "utf8") / 4);
}

export function compactAnalysis(analysis: Analysis): Record<string, unknown> {
  return {
    analysisVersion: analysis.analysisVersion,
    target: analysis.target,
    mode: analysis.mode,
    metrics: analysis.metrics,
    paths: analysis.paths.map((path) => ({
      id: path.id,
      when: path.conditions,
      branches: path.coveredBranches,
      result: path.result,
    })),
    branchOutcomesWithoutCandidate:
      analysis.candidateCoverage.outcomesWithoutCandidate,
    warnings: analysis.warnings,
    coverage: analysis.coverage,
    tokenBudget: analysis.tokenBudget,
  };
}

export function attachTokenBudget(analysis: Analysis): Analysis {
  const base = { ...analysis };
  delete base.tokenBudget;
  analysis.tokenBudget = {
    estimator: "UTF-8 bytes divided by 4",
    fullJsonApproxTokens: approximateTokens(base),
    compactJsonApproxTokens: approximateTokens(compactAnalysis(analysis)),
  };
  return analysis;
}
