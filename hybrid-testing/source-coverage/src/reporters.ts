import type { Analysis } from "./types.js";

export function renderMarkdown(analysis: Analysis): string {
  const target = analysis.target;
  const lines = [
    "# Whitebox Analysis Report",
    "",
    "## Target",
    "",
    `- Function: \`${target.className ? `${target.className}.` : ""}${target.functionName}\``,
    `- File: \`${target.filePath}\``,
    `- Language/parser: \`${target.language}\` / \`${target.parser}\``,
    `- Lines: ${target.startLine}-${target.endLine}`,
    `- Source SHA-256: \`${target.sourceHash}\``,
    `- Analysis mode: \`${analysis.mode}\``,
    "",
    "## Summary",
    "",
    `- Decisions: ${analysis.metrics.decisionCount}`,
    `- Branch outcomes: ${analysis.metrics.branchOutcomeCount}`,
    `- Exits: ${analysis.metrics.exitCount}`,
    `- Paths: ${analysis.metrics.pathCount}`,
    `- Estimated cyclomatic complexity: ${analysis.metrics.estimatedCyclomaticComplexity}`,
    `- Runtime coverage measured: ${analysis.coverage.measured ? "yes" : "no"}`,
    "",
    "## Branches",
    "",
  ];

  for (const branch of analysis.branches) {
    lines.push(
      `### ${branch.id} — ${branch.type}`,
      "",
      `- Line: ${branch.line}`,
      `- Condition: ${branch.condition ? `\`${branch.condition}\`` : "N/A"}`,
    );
    for (const path of branch.paths) {
      lines.push(`- \`${path.id}\`: ${path.label} → \`${path.result}\``);
    }
    lines.push("");
  }

  lines.push("## Execution paths", "");
  for (const path of analysis.paths) {
    lines.push(
      `### ${path.id}`,
      "",
      `- Conditions: ${path.conditions.length ? path.conditions.map((item) => `\`${item}\``).join("; ") : "N/A"}`,
      `- Covered branch outcomes: ${path.coveredBranches.map((item) => `\`${item}\``).join(", ") || "N/A"}`,
      `- Result: \`${path.result}\``,
      "",
    );
  }

  lines.push("## Source-derived testcase candidates", "");
  for (const candidate of analysis.testcaseCandidates) {
    lines.push(
      `- \`${candidate.id}\` / \`${candidate.pathId}\`: ${candidate.title}; expected hint \`${candidate.expectedHint}\`; state \`${candidate.approvalState}\``,
    );
  }
  lines.push(
    "",
    "## Static candidate mapping",
    "",
    `- Branch outcomes with a candidate: ${analysis.candidateCoverage.outcomesWithCandidate.length}/${analysis.candidateCoverage.branchOutcomeCount}`,
    `- Branch outcomes without a candidate: ${analysis.candidateCoverage.outcomesWithoutCandidate.map((item) => `\`${item}\``).join(", ") || "None"}`,
    `- Note: ${analysis.candidateCoverage.note}`,
  );

  lines.push("", "## Warnings", "");
  if (analysis.warnings.length === 0) {
    lines.push("- None");
  } else {
    for (const warning of analysis.warnings) {
      lines.push(
        `- \`${warning.code}\`${warning.line ? ` at line ${warning.line}` : ""}: ${warning.message}`,
      );
    }
  }
  lines.push(
    "",
    "## Coverage statement",
    "",
    analysis.coverage.note,
    "",
  );
  return lines.join("\n");
}
