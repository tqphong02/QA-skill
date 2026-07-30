import { z } from "zod";

export const branchPathSchema = z.object({
  id: z.string(),
  label: z.string(),
  conditionResult: z.union([z.boolean(), z.string()]),
  result: z.string(),
});

export const branchSchema = z.object({
  id: z.string(),
  type: z.enum([
    "if",
    "switch",
    "try-catch",
    "loop",
    "throw",
    "return",
  ]),
  condition: z.string().nullable(),
  line: z.number().int().positive(),
  paths: z.array(branchPathSchema).min(1),
});

export const executionPathSchema = z.object({
  id: z.string(),
  conditions: z.array(z.string()),
  coveredBranches: z.array(z.string()),
  result: z.string(),
  terminated: z.boolean(),
});

export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  line: z.number().int().positive().optional(),
});

export const candidateSchema = z.object({
  id: z.string(),
  pathId: z.string(),
  coveredBranches: z.array(z.string()),
  title: z.string(),
  conditionHints: z.array(z.string()),
  expectedHint: z.string(),
  suggestedType: z.enum([
    "happy",
    "alternative",
    "validation",
    "edge",
    "negative",
    "error",
    "ui",
    "additional",
  ]),
  approvalState: z.literal("source-derived-candidate"),
  runtimeCoverage: z
    .enum(["not-measured", "covered", "partial", "uncovered", "unknown"])
    .default("not-measured"),
});

export const analysisSchema = z.object({
  analysisVersion: z.enum(["1.0", "2.0"]),
  target: z.object({
    repositoryPath: z.string(),
    filePath: z.string(),
    language: z
      .enum([
        "typescript",
        "javascript",
        "python",
        "java",
        "go",
        "csharp",
        "dart",
      ])
      .default("typescript"),
    parser: z.string().default("ts-morph"),
    className: z.string().nullable(),
    functionName: z.string(),
    functionKind: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    sourceHash: z.string(),
  }),
  limits: z.object({
    maxBranches: z.number().int().positive(),
    maxPaths: z.number().int().positive(),
    maxDepth: z.number().int().positive(),
  }),
  mode: z.enum(["path-coverage", "branch-coverage"]),
  metrics: z.object({
    decisionCount: z.number().int().nonnegative(),
    branchOutcomeCount: z.number().int().nonnegative(),
    exitCount: z.number().int().nonnegative(),
    pathCount: z.number().int().nonnegative(),
    estimatedCyclomaticComplexity: z.number().int().positive(),
  }),
  branches: z.array(branchSchema),
  paths: z.array(executionPathSchema),
  testcaseCandidates: z.array(candidateSchema),
  candidateCoverage: z.object({
    branchOutcomeCount: z.number().int().nonnegative(),
    outcomesWithCandidate: z.array(z.string()),
    outcomesWithoutCandidate: z.array(z.string()),
    note: z.literal("Static candidate mapping only; not runtime coverage"),
  }),
  warnings: z.array(warningSchema),
  coverage: z.union([
    z.object({
      measured: z.literal(false),
      provider: z.null().default(null),
      reportPath: z.null().default(null),
      statement: z.null(),
      branch: z.null(),
      branchEvidence: z.array(z.never()).default([]),
      note: z.literal("No runtime coverage evidence supplied"),
    }),
    z.object({
      measured: z.literal(true),
      provider: z.string(),
      reportPath: z.string(),
      statement: z.number().min(0).max(100).nullable(),
      branch: z.number().min(0).max(100).nullable(),
      branchEvidence: z.array(
        z.object({
          branchPathId: z.string(),
          line: z.number().int().positive(),
          count: z.number().int().nonnegative().nullable(),
          status: z.enum(["covered", "uncovered", "unknown"]),
        }),
      ),
      note: z.string(),
    }),
  ]),
  tokenBudget: z
    .object({
      estimator: z.literal("UTF-8 bytes divided by 4"),
      fullJsonApproxTokens: z.number().int().nonnegative(),
      compactJsonApproxTokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type ExecutionPath = z.infer<typeof executionPathSchema>;
export type Warning = z.infer<typeof warningSchema>;
export type TestcaseCandidate = z.infer<typeof candidateSchema>;

export interface FunctionMatch {
  filePath: string;
  absoluteFilePath: string;
  functionName: string;
  functionKind: string;
  language:
    | "typescript"
    | "javascript"
    | "python"
    | "java"
    | "go"
    | "csharp"
    | "dart";
  className: string | null;
  line: number;
  endLine: number;
  isAsync: boolean;
  isStatic: boolean;
}

export interface AnalyzeOptions {
  repositoryPath: string;
  filePath?: string;
  functionName: string;
  className?: string;
  maxBranches: number;
  maxPaths: number;
  maxDepth: number;
}

export type SupportedLanguage = FunctionMatch["language"];
