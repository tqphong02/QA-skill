import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeFunction } from "../src/analyzer.js";
import { importIstanbulCoverage } from "../src/coverage.js";
import coverage from "../fixtures/coverage-final.json";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("runtime coverage import", () => {
  it("maps Istanbul counts to branch paths and testcase candidates", () => {
    const analysis = analyzeFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });
    const enriched = importIstanbulCoverage(
      analysis,
      coverage,
      "fixtures/coverage-final.json",
    );
    expect(enriched.coverage.measured).toBe(true);
    expect(enriched.coverage.branch).toBe(77.78);
    if (!enriched.coverage.measured) throw new Error("coverage not measured");
    expect(enriched.coverage.branchEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchPathId: "BR-003-T",
          count: 0,
          status: "uncovered",
        }),
      ]),
    );
    expect(
      enriched.testcaseCandidates.some(
        (candidate) =>
          candidate.runtimeCoverage === "uncovered" ||
          candidate.runtimeCoverage === "partial",
      ),
    ).toBe(true);
  });

  it("fails when the report does not contain the target file", () => {
    const analysis = analyzeFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });
    expect(() =>
      importIstanbulCoverage(analysis, {}, "coverage-final.json"),
    ).toThrow(/COVERAGE_TARGET_NOT_FOUND/);
    expect(() =>
      importIstanbulCoverage(analysis, null, "coverage-final.json"),
    ).toThrow(/INVALID_ISTANBUL_REPORT/);
  });

  it("keeps missing counters explicitly unknown instead of claiming coverage", () => {
    const analysis = analyzeFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });
    const enriched = importIstanbulCoverage(
      analysis,
      {
        [resolve(root, "fixtures/payment-service.ts")]: {
          path: resolve(root, "fixtures/payment-service.ts"),
          statementMap: {},
          s: {},
          branchMap: {},
          b: {},
        },
      },
      "empty-coverage-final.json",
    );
    expect(enriched.coverage.statement).toBeNull();
    expect(enriched.coverage.branch).toBeNull();
    expect(
      enriched.testcaseCandidates.every(
        (candidate) => candidate.runtimeCoverage === "unknown",
      ),
    ).toBe(true);
  });
});
