import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analysisSchema, type Analysis } from "./types.js";

interface IstanbulFileCoverage {
  path?: string;
  statementMap?: Record<
    string,
    { start: { line: number }; end: { line: number } }
  >;
  s?: Record<string, number>;
  branchMap?: Record<
    string,
    {
      type: string;
      loc: { start: { line: number }; end: { line: number } };
      locations: Array<{ start: { line: number }; end: { line: number } }>;
    }
  >;
  b?: Record<string, number[]>;
}

function percentage(counts: number[]): number | null {
  if (counts.length === 0) return null;
  return Number(
    ((counts.filter((count) => count > 0).length / counts.length) * 100).toFixed(
      2,
    ),
  );
}

function normalized(path: string): string {
  return path.replaceAll("\\", "/");
}

function findCoverageRecord(
  report: Record<string, IstanbulFileCoverage>,
  analysis: Analysis,
): IstanbulFileCoverage {
  const wanted = normalized(analysis.target.filePath);
  const entries = Object.entries(report);
  const match = entries.find(([key, value]) => {
    const candidates = [key, value.path ?? ""].map(normalized);
    return candidates.some(
      (candidate) =>
        candidate === wanted ||
        candidate.endsWith(`/${wanted}`) ||
        wanted.endsWith(`/${candidate}`),
    );
  });
  if (!match) {
    throw new Error(`COVERAGE_TARGET_NOT_FOUND: ${analysis.target.filePath}`);
  }
  return match[1];
}

export function importIstanbulCoverage(
  analysisInput: unknown,
  reportInput: unknown,
  reportPath: string,
): Analysis {
  const analysis = analysisSchema.parse(analysisInput);
  if (!reportInput || typeof reportInput !== "object") {
    throw new Error("INVALID_ISTANBUL_REPORT");
  }
  const record = findCoverageRecord(
    reportInput as Record<string, IstanbulFileCoverage>,
    analysis,
  );
  const statementCounts = Object.values(record.s ?? {});
  const branchCounts = Object.values(record.b ?? {}).flat();
  const branchEntries = Object.entries(record.branchMap ?? {});
  const statementEntries = Object.entries(record.statementMap ?? {});
  const branchEvidence: Array<{
    branchPathId: string;
    line: number;
    count: number | null;
    status: "covered" | "uncovered" | "unknown";
  }> = [];

  for (const branch of analysis.branches) {
    if (["if", "switch", "try-catch", "loop"].includes(branch.type)) {
      const entry = branchEntries.find(
        ([, value]) => value.loc.start.line === branch.line,
      );
      const counts = entry ? record.b?.[entry[0]] ?? [] : [];
      for (const [index, path] of branch.paths.entries()) {
        const count = counts[index] ?? null;
        branchEvidence.push({
          branchPathId: path.id,
          line: branch.line,
          count,
          status:
            count === null ? "unknown" : count > 0 ? "covered" : "uncovered",
        });
      }
      continue;
    }
    const entry = statementEntries.find(
      ([, value]) => value.start.line === branch.line,
    );
    const count = entry ? record.s?.[entry[0]] ?? null : null;
    for (const path of branch.paths) {
      branchEvidence.push({
        branchPathId: path.id,
        line: branch.line,
        count,
        status:
          count === null ? "unknown" : count > 0 ? "covered" : "uncovered",
      });
    }
  }

  const evidenceById = new Map(
    branchEvidence.map((evidence) => [evidence.branchPathId, evidence]),
  );
  for (const candidate of analysis.testcaseCandidates) {
    const evidence = candidate.coveredBranches
      .map((id) => evidenceById.get(id))
      .filter((item) => item !== undefined);
    if (
      evidence.length === 0 ||
      evidence.some((item) => item.status === "unknown")
    ) {
      candidate.runtimeCoverage = "unknown";
    } else if (evidence.every((item) => item.status === "covered")) {
      candidate.runtimeCoverage = "covered";
    } else if (evidence.every((item) => item.status === "uncovered")) {
      candidate.runtimeCoverage = "uncovered";
    } else {
      candidate.runtimeCoverage = "partial";
    }
  }

  analysis.coverage = {
    measured: true,
    provider: "istanbul",
    reportPath: resolve(reportPath),
    statement: percentage(statementCounts),
    branch: percentage(branchCounts),
    branchEvidence,
    note:
      "Runtime coverage imported from Istanbul; source hash still identifies the analyzed function revision",
  };
  return analysisSchema.parse(analysis);
}

export function importIstanbulCoverageFiles(
  analysisPath: string,
  reportPath: string,
): Analysis {
  return importIstanbulCoverage(
    JSON.parse(readFileSync(analysisPath, "utf8")),
    JSON.parse(readFileSync(reportPath, "utf8")),
    reportPath,
  );
}
