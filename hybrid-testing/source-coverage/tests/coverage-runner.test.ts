import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  coverageRunnerCommand,
  runJsCoverage,
} from "../src/coverage-runner.js";

describe("safe Jest/Vitest coverage runner", () => {
  it("builds fixed Vitest and Jest argument lists without a shell", () => {
    expect(
      coverageRunnerCommand({
        runner: "vitest",
        cwd: "/tmp/project",
        analysisPath: "analysis.json",
        testPath: "tests/payment.test.ts",
        configPath: "vitest.config.ts",
      }).args,
    ).toEqual([
      "run",
      "/tmp/project/tests/payment.test.ts",
      "--config",
      "/tmp/project/vitest.config.ts",
      "--coverage",
      "--coverage.reporter=json",
    ]);
    expect(
      coverageRunnerCommand({
        runner: "jest",
        cwd: "/tmp/project",
        analysisPath: "analysis.json",
      }).args,
    ).toEqual([
      "--coverage",
      "--coverageReporters=json",
      "--runInBand",
    ]);
  });

  it("reports the exact missing local runner", () => {
    expect(() =>
      runJsCoverage({
        runner: "vitest",
        cwd: "/tmp/whitebox-missing-project",
        analysisPath: "analysis.json",
      }),
    ).toThrow(
      `COVERAGE_RUNNER_MISSING: ${resolve("/tmp/whitebox-missing-project/node_modules/.bin/vitest")}`,
    );
  });
});
