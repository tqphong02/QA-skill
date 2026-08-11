import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { importIstanbulCoverageFiles } from "./coverage.js";
import type { Analysis } from "./types.js";

export interface CoverageRunOptions {
  runner: "vitest" | "jest";
  cwd: string;
  analysisPath: string;
  testPath?: string;
  configPath?: string;
  reportPath?: string;
}

export function coverageRunnerCommand(options: CoverageRunOptions): {
  executable: string;
  args: string[];
  reportPath: string;
} {
  const cwd = resolve(options.cwd);
  const executable = resolve(cwd, "node_modules", ".bin", options.runner);
  const test = options.testPath ? resolve(cwd, options.testPath) : undefined;
  const config = options.configPath
    ? resolve(cwd, options.configPath)
    : undefined;
  const args =
    options.runner === "vitest"
      ? [
          "run",
          ...(test ? [test] : []),
          ...(config ? ["--config", config] : []),
          "--coverage",
          "--coverage.reporter=json",
        ]
      : [
          ...(test ? [test] : []),
          ...(config ? ["--config", config] : []),
          "--coverage",
          "--coverageReporters=json",
          "--runInBand",
        ];
  return {
    executable,
    args,
    reportPath: resolve(
      options.reportPath ?? resolve(cwd, "coverage", "coverage-final.json"),
    ),
  };
}

export function runJsCoverage(options: CoverageRunOptions): Analysis {
  const command = coverageRunnerCommand(options);
  if (!existsSync(command.executable)) {
    throw new Error(
      `COVERAGE_RUNNER_MISSING: ${command.executable}; install ${options.runner} in the target repository`,
    );
  }
  const result = spawnSync(command.executable, command.args, {
    cwd: resolve(options.cwd),
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `COVERAGE_TEST_FAILED: ${options.runner} exited ${result.status}`,
    );
  }
  if (!existsSync(command.reportPath)) {
    throw new Error(`COVERAGE_REPORT_MISSING: ${command.reportPath}`);
  }
  return importIstanbulCoverageFiles(
    resolve(options.analysisPath),
    command.reportPath,
  );
}
