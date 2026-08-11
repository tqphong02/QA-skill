import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeGenericFunction,
  locateGenericFunctions,
} from "../src/generic-analyzer.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  ["fixtures/payment_service.py", "process_payment", undefined, "python"],
  ["fixtures/PaymentService.java", "processPayment", "PaymentService", "java"],
  ["fixtures/payment_service.go", "processPayment", undefined, "go"],
  ["fixtures/PaymentService.cs", "ProcessPayment", "PaymentService", "csharp"],
  ["fixtures/payment_service.dart", "processPayment", undefined, "dart"],
] as const;

describe("multi-language AST adapters", () => {
  for (const [filePath, functionName, className, language] of targets) {
    it(`analyzes ${language} with a real tree-sitter AST`, () => {
      const analysis = analyzeGenericFunction({
        repositoryPath: root,
        filePath,
        functionName,
        className,
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      });
      expect(analysis.target.language).toBe(language);
      expect(analysis.target.parser).toBe("ast-grep/tree-sitter");
      expect(analysis.metrics.decisionCount).toBeGreaterThanOrEqual(2);
      expect(analysis.branches.some((branch) => branch.type === "if")).toBe(
        true,
      );
      expect(analysis.branches.some((branch) => branch.type === "return")).toBe(
        true,
      );
      expect(analysis.testcaseCandidates.length).toBeGreaterThan(1);
    });
  }

  it("finds an exact Java method without loading source into AI context", () => {
    const matches = locateGenericFunctions(
      root,
      "processPayment",
      "fixtures/PaymentService.java",
      "PaymentService",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].match.line).toBe(2);
  });
});
