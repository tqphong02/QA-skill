import { readFileSync } from "node:fs";
import { z } from "zod";
import { analysisSchema, type Analysis } from "./types.js";

const caseType = z.enum([
  "happy",
  "alternative",
  "validation",
  "edge",
  "negative",
  "error",
  "additional",
]);

const mappingSchema = z.object({
  project: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    device: z.string().default("Whitebox function-level test"),
    version: z.string().default("N/A"),
    priority: z.string().default("Medium"),
    test_date: z.string().min(1),
    author: z.string().min(1),
    reviewer: z.string().default("N/A"),
    description: z.string().min(1),
    objective: z.string().min(1),
  }),
  source_document: z.string().min(1),
  requirements: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .min(1),
  group: z.string().min(1),
  mappings: z
    .array(
      z.object({
        candidate_id: z.string().min(1),
        requirement: z.string().min(1),
        scenario_id: z.string().min(1),
        scenario_name: z.string().min(1),
        type: caseType,
        description: z.string().min(1),
        pre_condition: z.string().min(1),
        procedure: z.string().min(1),
        expected: z.string().min(1),
        priority: z.string().default("Medium"),
      }),
    )
    .min(1),
});

export type TestcaseMapping = z.infer<typeof mappingSchema>;

function assertNoUnresolvedText(value: string, field: string): void {
  if (/\b(TODO|TBD|UNRESOLVED|CẦN LÀM RÕ)\b/i.test(value)) {
    throw new Error(`UNRESOLVED_EXPECTED: ${field} contains ${value}`);
  }
}

export function createTestcaseTemplateInput(
  analysisInput: unknown,
  mappingInput: unknown,
): Record<string, unknown> {
  const analysis: Analysis = analysisSchema.parse(analysisInput);
  const mapping = mappingSchema.parse(mappingInput);
  const candidateById = new Map(
    analysis.testcaseCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const requirementIds = new Set(
    mapping.requirements.map((requirement) => requirement.id),
  );
  const seen = new Set<string>();

  const scenarios = mapping.mappings.map((item) => {
    const candidate = candidateById.get(item.candidate_id);
    if (!candidate) {
      throw new Error(`UNKNOWN_CANDIDATE: ${item.candidate_id}`);
    }
    if (seen.has(item.candidate_id)) {
      throw new Error(`DUPLICATE_CANDIDATE_MAPPING: ${item.candidate_id}`);
    }
    seen.add(item.candidate_id);
    const outOfSpec =
      item.requirement === "(out-of-spec)" || item.type === "additional";
    if (!outOfSpec && !requirementIds.has(item.requirement)) {
      throw new Error(`UNKNOWN_REQUIREMENT: ${item.requirement}`);
    }
    if (outOfSpec && item.type !== "additional") {
      throw new Error(
        `OUT_OF_SPEC_TYPE_REQUIRED: ${item.candidate_id} must use type=additional`,
      );
    }
    for (const [field, value] of Object.entries({
      description: item.description,
      pre_condition: item.pre_condition,
      procedure: item.procedure,
      expected: item.expected,
    })) {
      assertNoUnresolvedText(value, `${item.candidate_id}.${field}`);
    }
    const sourceTrace = [
      `candidate=${candidate.id}`,
      `path=${candidate.pathId}`,
      `branches=${candidate.coveredBranches.join(",")}`,
    ].join("; ");
    return {
      scenario_id: item.scenario_id,
      requirement: item.requirement,
      scenario_name: item.scenario_name,
      cases: [
        {
          type: item.type,
          req: item.requirement,
          description: item.description,
          pre_condition: `Whitebox trace: ${sourceTrace}\n${item.pre_condition}`,
          procedure: item.procedure,
          expected: item.expected,
          priority: item.priority,
        },
      ],
    };
  });

  return {
    project: mapping.project,
    source_document: `${mapping.source_document}; whitebox source=${analysis.target.filePath}; sha256=${analysis.target.sourceHash}`,
    requirements: mapping.requirements,
    sections: [
      {
        title: "1.1. USER INTERFACE",
        kind: "ui",
        groups: [{ name: mapping.group, scenarios: [] }],
      },
      {
        title: "1.2. FUNCTION",
        kind: "function",
        groups: [{ name: mapping.group, scenarios }],
      },
    ],
  };
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
