import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "dist/cli.js");

function run(args: string[]): string {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("compiled CLI", () => {
  beforeAll(() => {
    execFileSync(
      resolve(root, "node_modules/.bin/tsc"),
      ["-p", "tsconfig.json"],
      { cwd: root },
    );
  });

  it("finds every exact function match", () => {
    const result = JSON.parse(
      run([
        "find",
        "processPayment",
        "--repo",
        root,
        "--file",
        "fixtures/payment-service.ts",
      ]),
    );
    expect(result.count).toBe(2);
  });

  it("prints a validated analysis as JSON", () => {
    const result = JSON.parse(
      run([
        "analyze",
        "--repo",
        root,
        "--file",
        "fixtures/payment-service.ts",
        "--class",
        "PaymentService",
        "--function",
        "processPayment",
        "--format",
        "json",
      ]),
    );
    expect(result.analysisVersion).toBe("2.0");
    expect(result.target.className).toBe("PaymentService");
  });

  it("defaults to compact output for a Python target", () => {
    const result = JSON.parse(
      run([
        "analyze",
        "--repo",
        root,
        "--file",
        "fixtures/payment_service.py",
        "--function",
        "process_payment",
      ]),
    );
    expect(result.target.language).toBe("python");
    expect(result.tokenBudget.compactJsonApproxTokens).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("branches");
    expect(result).not.toHaveProperty("testcaseCandidates");
  });

  it("builds a multi-function graph from the compiled CLI", () => {
    const result = JSON.parse(
      run([
        "graph",
        "--repo",
        root,
        "--file",
        "fixtures/payment_service.py",
        "--function",
        "process_payment",
      ]),
    );
    expect(result.nodes.map((node: { functionName: string }) => node.functionName))
      .toContain("create_payment");
  });
});
