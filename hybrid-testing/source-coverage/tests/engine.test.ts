import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeAnyFunction, findAnyFunctions } from "../src/engine.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("multi-language engine routing", () => {
  it("routes explicit TypeScript and Python files to their AST adapters", () => {
    const typescript = analyzeAnyFunction({
      repositoryPath: root,
      filePath: "fixtures/payment-service.ts",
      className: "PaymentService",
      functionName: "processPayment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });
    const python = analyzeAnyFunction({
      repositoryPath: root,
      filePath: "fixtures/payment_service.py",
      functionName: "process_payment",
      maxBranches: 20,
      maxPaths: 50,
      maxDepth: 5,
    });
    expect(typescript.target.parser).toBe("ts-morph");
    expect(python.target.parser).toBe("ast-grep/tree-sitter");
  });

  it("finds and analyzes one unique target without a file hint", () => {
    const matches = findAnyFunctions(root, "ProcessPayment");
    expect(matches).toHaveLength(1);
    expect(matches[0].language).toBe("csharp");
    expect(
      analyzeAnyFunction({
        repositoryPath: root,
        functionName: "ProcessPayment",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }).target.language,
    ).toBe("csharp");
  });

  it("fails closed for unsupported, missing and ambiguous targets", () => {
    expect(() =>
      findAnyFunctions(root, "anything", "fixtures/example.rb"),
    ).toThrow(/LANGUAGE_NOT_SUPPORTED/);
    expect(() =>
      analyzeAnyFunction({
        repositoryPath: root,
        filePath: "fixtures/example.rb",
        functionName: "anything",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    ).toThrow(/LANGUAGE_NOT_SUPPORTED/);
    expect(() =>
      analyzeAnyFunction({
        repositoryPath: root,
        functionName: "missing_function",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    ).toThrow(/FUNCTION_NOT_FOUND/);
    expect(() =>
      analyzeAnyFunction({
        repositoryPath: root,
        functionName: "processPayment",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    ).toThrow(/AMBIGUOUS_FUNCTION/);
  });
});
