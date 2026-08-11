import { writeFileSync } from "node:fs";
import { z } from "zod";
import { analysisSchema } from "./types.js";

const unitTestMappingSchema = z.object({
  framework: z.enum(["vitest", "jest"]),
  module: z.string().min(1),
  imports: z.array(
    z.object({
      name: z.string().min(1),
      alias: z.string().min(1).optional(),
      default: z.boolean().default(false),
    }),
  ),
  suite: z.string().min(1),
  setup: z.array(z.string()).default([]),
  beforeEach: z.array(z.string()).default([]),
  cases: z
    .array(
      z.object({
        candidate_id: z.string().min(1),
        title: z.string().min(1).optional(),
        body: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

function indent(lines: string[], spaces: number): string[] {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => `${prefix}${line}`);
}

function renderSubjectImport(
  modulePath: string,
  imports: Array<{ name: string; alias?: string; default: boolean }>,
): string[] {
  const lines: string[] = [];
  const defaultImport = imports.find((item) => item.default);
  const named = imports.filter((item) => !item.default);
  if (defaultImport) {
    lines.push(
      `import ${defaultImport.alias ?? defaultImport.name} from ${JSON.stringify(modulePath)};`,
    );
  }
  if (named.length > 0) {
    const symbols = named
      .map((item) =>
        item.alias ? `${item.name} as ${item.alias}` : item.name,
      )
      .join(", ");
    lines.push(`import { ${symbols} } from ${JSON.stringify(modulePath)};`);
  }
  return lines;
}

export function generateUnitTestSource(
  analysisInput: unknown,
  mappingInput: unknown,
): string {
  const analysis = analysisSchema.parse(analysisInput);
  const mapping = unitTestMappingSchema.parse(mappingInput);
  const candidates = new Map(
    analysis.testcaseCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const seen = new Set<string>();
  const frameworkModule =
    mapping.framework === "vitest" ? "vitest" : "@jest/globals";
  const lines = [
    `import { beforeEach, describe, expect, it, vi } from ${JSON.stringify(frameworkModule)};`,
    ...renderSubjectImport(mapping.module, mapping.imports),
    "",
    `describe(${JSON.stringify(mapping.suite)}, () => {`,
  ];
  if (mapping.setup.length > 0) {
    lines.push(...indent(mapping.setup, 2), "");
  }
  if (mapping.beforeEach.length > 0) {
    lines.push("  beforeEach(() => {");
    lines.push(...indent(mapping.beforeEach, 4));
    lines.push("  });", "");
  }
  for (const item of mapping.cases) {
    const candidate = candidates.get(item.candidate_id);
    if (!candidate) {
      throw new Error(`UNKNOWN_CANDIDATE: ${item.candidate_id}`);
    }
    if (seen.has(item.candidate_id)) {
      throw new Error(`DUPLICATE_CANDIDATE_MAPPING: ${item.candidate_id}`);
    }
    seen.add(item.candidate_id);
    const title = item.title ?? candidate.title;
    lines.push(
      `  it(${JSON.stringify(title)}, async () => {`,
      `    // Whitebox trace: ${candidate.id}; ${candidate.pathId}; ${candidate.coveredBranches.join(",")}`,
      ...indent(item.body, 4),
      "  });",
      "",
    );
  }
  lines.push("});", "");
  return lines.join("\n");
}

export function writeUnitTest(
  analysisInput: unknown,
  mappingInput: unknown,
  outputPath: string,
): string {
  const source = generateUnitTestSource(analysisInput, mappingInput);
  writeFileSync(outputPath, source, "utf8");
  return source;
}
