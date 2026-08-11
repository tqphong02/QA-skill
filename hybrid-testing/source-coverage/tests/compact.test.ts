import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeFunction } from "../src/analyzer.js";
import {
  approximateTokens,
  attachTokenBudget,
  compactAnalysis,
} from "../src/compact.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("token-aware output", () => {
  it("keeps compact output materially smaller than full analysis", () => {
    const analysis = attachTokenBudget(
      analyzeFunction({
        repositoryPath: root,
        filePath: "fixtures/payment-service.ts",
        className: "PaymentService",
        functionName: "processPayment",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    );
    const compact = compactAnalysis(analysis);
    expect(analysis.tokenBudget).toBeDefined();
    expect(approximateTokens(compact)).toBeLessThan(
      approximateTokens(analysis) * 0.7,
    );
    expect(compact).not.toHaveProperty("branches");
    expect(compact).not.toHaveProperty("testcaseCandidates");
  });
});
