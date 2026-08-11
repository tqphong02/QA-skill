#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attachTokenBudget } from "../dist/compact.js";
import { analyzeAnyFunction } from "../dist/engine.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  ["src/scanner.ts", "scanRepository"],
  ["src/locator.ts", "locateFunctions"],
  ["src/analyzer.ts", "analyzeFunction"],
  ["src/reporters.ts", "renderMarkdown"],
  ["src/handoff.ts", "createTestcaseTemplateInput"],
  ["fixtures/payment_service.py", "process_payment"],
  ["fixtures/PaymentService.java", "processPayment"],
  ["fixtures/payment_service.go", "processPayment"],
  ["fixtures/PaymentService.cs", "ProcessPayment"],
  ["fixtures/payment_service.dart", "processPayment"],
];

const results = [];
for (const [filePath, functionName] of targets) {
  const start = performance.now();
  const analysis = attachTokenBudget(analyzeAnyFunction({
    repositoryPath: root,
    filePath,
    functionName,
    maxBranches: 20,
    maxPaths: 50,
    maxDepth: 5,
  }));
  const durationMs = Number((performance.now() - start).toFixed(2));
  results.push({
    filePath,
    functionName,
    language: analysis.target.language,
    durationMs,
    mode: analysis.mode,
    decisions: analysis.metrics.decisionCount,
    paths: analysis.metrics.pathCount,
    sourceHash: analysis.target.sourceHash,
    fullJsonApproxTokens: analysis.tokenBudget.fullJsonApproxTokens,
    compactJsonApproxTokens: analysis.tokenBudget.compactJsonApproxTokens,
    compactPercent:
      Number(
        (
          (analysis.tokenBudget.compactJsonApproxTokens /
            analysis.tokenBudget.fullJsonApproxTokens) *
          100
        ).toFixed(2),
      ),
    underTwoSeconds: durationMs < 2000,
  });
}

console.log(
  JSON.stringify(
    {
      benchmarkVersion: "2.0",
      targetCount: results.length,
      pass: results.every((result) => result.underTwoSeconds),
      results,
    },
    null,
    2,
  ),
);

if (results.some((result) => !result.underTwoSeconds)) {
  process.exitCode = 1;
}
