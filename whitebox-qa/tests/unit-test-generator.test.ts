import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeFunction } from "../src/analyzer.js";
import {
  generateUnitTestSource,
  writeUnitTest,
} from "../src/unit-test-generator.js";
import mapping from "../fixtures/unit-test-mapping.json";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function analysis() {
  return analyzeFunction({
    repositoryPath: root,
    filePath: "fixtures/payment-service.ts",
    className: "PaymentService",
    functionName: "processPayment",
    maxBranches: 20,
    maxPaths: 50,
    maxDepth: 5,
  });
}

describe("Jest/Vitest generator", () => {
  it("writes syntactically valid executable Vitest source with branch trace", () => {
    const source = generateUnitTestSource(analysis(), mapping);
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    expect(result.diagnostics ?? []).toEqual([]);
    expect(source).toContain('from "vitest"');
    expect(source).toContain("Whitebox trace: WB-001; PATH-001; BR-");
    expect(source).toContain("USER_NOT_FOUND");
  });

  it("supports Jest imports without changing candidate mapping", () => {
    const source = generateUnitTestSource(analysis(), {
      ...mapping,
      framework: "jest",
    });
    expect(source).toContain('from "@jest/globals"');
  });

  it("blocks unknown candidates", () => {
    expect(() =>
      generateUnitTestSource(analysis(), {
        ...mapping,
        cases: [{ ...mapping.cases[0], candidate_id: "WB-404" }],
      }),
    ).toThrow(/UNKNOWN_CANDIDATE/);
  });

  it("supports setup hooks, aliases, default imports and blocks duplicates", () => {
    const source = generateUnitTestSource(analysis(), {
      ...mapping,
      imports: [
        { name: "PaymentService", alias: "Subject", default: true },
        { name: "helper", alias: "paymentHelper", default: false },
      ],
      setup: ["const dependency = vi.fn();"],
      beforeEach: ["dependency.mockReset();"],
    });
    expect(source).toContain('import Subject from "../fixtures/payment-service"');
    expect(source).toContain("helper as paymentHelper");
    expect(source).toContain("beforeEach(() => {");

    expect(() =>
      generateUnitTestSource(analysis(), {
        ...mapping,
        cases: [mapping.cases[0], mapping.cases[0]],
      }),
    ).toThrow(/DUPLICATE_CANDIDATE_MAPPING/);
  });

  it("writes the generated executable source to disk", () => {
    const output = join(mkdtempSync(join(tmpdir(), "whitebox-test-")), "case.test.ts");
    const source = writeUnitTest(analysis(), mapping, output);
    expect(readFileSync(output, "utf8")).toBe(source);
  });
});
