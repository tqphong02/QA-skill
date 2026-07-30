import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeFunction } from "../src/analyzer.js";
import { renderMarkdown } from "../src/reporters.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Markdown reporter", () => {
  it("keeps source integrity, path IDs, warnings and coverage disclaimer", () => {
    const report = renderMarkdown(
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
    expect(report).toContain("# Whitebox Analysis Report");
    expect(report).toContain("Source SHA-256");
    expect(report).toContain("PATH-001");
    expect(report).toContain("No runtime coverage evidence supplied");
  });

  it("renders an explicit empty warning section for a simple arrow function", () => {
    const report = renderMarkdown(
      analyzeFunction({
        repositoryPath: root,
        filePath: "fixtures/payment-service.ts",
        functionName: "identity",
        maxBranches: 20,
        maxPaths: 50,
        maxDepth: 5,
      }),
    );
    expect(report).toContain("## Warnings\n\n- None");
  });
});
