import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeFunction } from "../src/analyzer.js";
import { locateFunctions } from "../src/locator.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("whitebox analyzer", () => {
  it("finds class methods and arrow functions without guessing", () => {
    const matches = locateFunctions(
      root,
      "processPayment",
      "fixtures/payment-service.ts",
    );
    expect(matches).toHaveLength(2);
    expect(matches.map(({ match }) => match.functionKind)).toEqual([
      "class-method",
      "arrow-function",
    ]);
  });

  it("analyzes if, switch, try-catch, return and throw paths", () => {
    const analysis = analyzeFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });

    expect(analysis.target.className).toBe("PaymentService");
    expect(analysis.target.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analysis.mode).toBe("path-coverage");
    expect(analysis.branches.some((branch) => branch.type === "if")).toBe(true);
    expect(analysis.branches.some((branch) => branch.type === "switch")).toBe(
      true,
    );
    expect(
      analysis.branches.some((branch) => branch.type === "try-catch"),
    ).toBe(true);
    expect(analysis.branches.some((branch) => branch.type === "throw")).toBe(
      true,
    );
    expect(analysis.branches.some((branch) => branch.type === "return")).toBe(
      true,
    );
    expect(analysis.coverage.measured).toBe(false);
    expect(analysis.testcaseCandidates).toHaveLength(
      analysis.metrics.pathCount,
    );
    expect(analysis.candidateCoverage.outcomesWithoutCandidate).toEqual([]);
    expect(analysis.candidateCoverage.note).toContain("not runtime coverage");
  });

  it("switches to branch coverage when the path limit is exceeded", () => {
    const analysis = analyzeFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 2,
      maxDepth: 5,
    });
    expect(analysis.mode).toBe("branch-coverage");
    expect(analysis.warnings.some((item) => item.code === "PATH_EXPLOSION")).toBe(
      true,
    );
  });

  it("fails closed when the function name is ambiguous", () => {
    expect(() =>
      analyzeFunction({
        repositoryPath: root,
        functionName: "processPayment",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    ).toThrow(/AMBIGUOUS_FUNCTION/);
  });
});
