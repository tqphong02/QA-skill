import { createHash } from "node:crypto";
import { Block, Node, Statement, SyntaxKind } from "ts-morph";
import { locateFunctions, type LocatedFunction } from "./locator.js";
import {
  analysisSchema,
  type Analysis,
  type AnalyzeOptions,
  type Branch,
  type ExecutionPath,
  type TestcaseCandidate,
  type Warning,
} from "./types.js";

interface FlowPath {
  conditions: string[];
  coveredBranches: string[];
  result: string;
  terminated: boolean;
}

interface Context {
  branches: Branch[];
  branchIds: Map<Node, string>;
  warnings: Map<string, Warning>;
  maxPaths: number;
  maxDepth: number;
  truncated: boolean;
}

function addWarning(
  context: Context,
  code: string,
  message: string,
  line?: number,
): void {
  const key = `${code}:${line ?? ""}:${message}`;
  context.warnings.set(key, { code, message, ...(line ? { line } : {}) });
}

function statementsOf(node: Node | undefined): Statement[] {
  if (!node) return [];
  if (Node.isBlock(node)) return node.getStatements();
  return Node.isStatement(node) ? [node] : [];
}

function registerBranch(
  context: Context,
  node: Node,
  type: Branch["type"],
  condition: string | null,
  paths: Array<Omit<Branch["paths"][number], "id"> & { suffix: string }>,
): Branch {
  const existingId = context.branchIds.get(node);
  if (existingId) {
    return context.branches.find((branch) => branch.id === existingId)!;
  }
  const id = `BR-${String(context.branches.length + 1).padStart(3, "0")}`;
  const branch: Branch = {
    id,
    type,
    condition,
    line: node.getStartLineNumber(),
    paths: paths.map(({ suffix, ...path }) => ({
      id: `${id}-${suffix}`,
      ...path,
    })),
  };
  context.branchIds.set(node, id);
  context.branches.push(branch);
  return branch;
}

function withBranch(
  path: FlowPath,
  branchPathId: string,
  condition: string,
): FlowPath {
  return {
    ...path,
    conditions: [...path.conditions, condition],
    coveredBranches: [...path.coveredBranches, branchPathId],
  };
}

function cap(paths: FlowPath[], context: Context, line: number): FlowPath[] {
  if (paths.length <= context.maxPaths) return paths;
  context.truncated = true;
  addWarning(
    context,
    "PATH_EXPLOSION",
    `Generated paths exceeded maxPaths=${context.maxPaths}; switched to branch coverage mode`,
    line,
  );
  return paths.slice(0, context.maxPaths);
}

function directResult(node: Node | undefined): string {
  if (!node) return "continue";
  const statements = statementsOf(node);
  const first = statements[0];
  if (first && Node.isThrowStatement(first)) {
    return `throw ${first.getExpression()?.getText() ?? ""}`.trim();
  }
  if (first && Node.isReturnStatement(first)) {
    return `return ${first.getExpression()?.getText() ?? ""}`.trim();
  }
  return "continue";
}

function processStatements(
  statements: Statement[],
  initial: FlowPath[],
  context: Context,
  depth: number,
): FlowPath[] {
  let paths = initial;
  for (const statement of statements) {
    const next: FlowPath[] = [];
    for (const path of paths) {
      if (path.terminated) next.push(path);
      else next.push(...processStatement(statement, path, context, depth));
    }
    paths = cap(next, context, statement.getStartLineNumber());
  }
  return paths;
}

function processIf(
  statement: import("ts-morph").IfStatement,
  path: FlowPath,
  context: Context,
  depth: number,
): FlowPath[] {
  const condition = statement.getExpression().getText();
  const thenNode = statement.getThenStatement();
  const elseNode = statement.getElseStatement();
  const branch = registerBranch(context, statement, "if", condition, [
    {
      suffix: "T",
      label: "true",
      conditionResult: true,
      result: directResult(thenNode),
    },
    {
      suffix: "F",
      label: "false",
      conditionResult: false,
      result: directResult(elseNode),
    },
  ]);
  if (depth >= context.maxDepth) {
    addWarning(
      context,
      "MAX_DEPTH_EXCEEDED",
      `Nested control-flow depth exceeded maxDepth=${context.maxDepth}`,
      statement.getStartLineNumber(),
    );
    context.truncated = true;
    return [
      withBranch(path, branch.paths[0].id, `${condition} = true`),
      withBranch(path, branch.paths[1].id, `${condition} = false`),
    ];
  }
  const truePaths = processStatements(
    statementsOf(thenNode),
    [withBranch(path, branch.paths[0].id, `${condition} = true`)],
    context,
    depth + 1,
  );
  const falseSeed = withBranch(
    path,
    branch.paths[1].id,
    `${condition} = false`,
  );
  const falsePaths = elseNode
    ? processStatements(
        statementsOf(elseNode),
        [falseSeed],
        context,
        depth + 1,
      )
    : [falseSeed];
  return [...truePaths, ...falsePaths];
}

function processSwitch(
  statement: import("ts-morph").SwitchStatement,
  path: FlowPath,
  context: Context,
  depth: number,
): FlowPath[] {
  const expression = statement.getExpression().getText();
  const clauses = statement.getCaseBlock().getClauses();
  const branch = registerBranch(
    context,
    statement,
    "switch",
    expression,
    clauses.map((clause, index) => {
      const label = Node.isCaseClause(clause)
        ? `case ${clause.getExpression().getText()}`
        : "default";
      return {
        suffix: `P${index + 1}`,
        label,
        conditionResult: label,
        result: directResult(clause.getStatements()[0]),
      };
    }),
  );
  if (clauses.length === 0) return [path];
  return clauses.flatMap((clause, index) => {
    const label = branch.paths[index].label;
    const seed = withBranch(
      path,
      branch.paths[index].id,
      `${expression} -> ${label}`,
    );
    if (depth >= context.maxDepth) {
      context.truncated = true;
      addWarning(
        context,
        "MAX_DEPTH_EXCEEDED",
        `Nested control-flow depth exceeded maxDepth=${context.maxDepth}`,
        statement.getStartLineNumber(),
      );
      return [seed];
    }
    const clauseStatements = clause
      .getStatements()
      .filter((item) => item.getKind() !== SyntaxKind.BreakStatement);
    const endsClause = clause
      .getStatements()
      .some(
        (item) =>
          Node.isBreakStatement(item) ||
          Node.isReturnStatement(item) ||
          Node.isThrowStatement(item),
      );
    if (!endsClause) {
      addWarning(
        context,
        "SWITCH_FALLTHROUGH_REVIEW",
        `Switch clause ${label} may fall through; path is modeled independently`,
        clause.getStartLineNumber(),
      );
    }
    return processStatements(clauseStatements, [seed], context, depth + 1);
  });
}

function processTry(
  statement: import("ts-morph").TryStatement,
  path: FlowPath,
  context: Context,
  depth: number,
): FlowPath[] {
  const catchClause = statement.getCatchClause();
  if (!catchClause) {
    return processStatements(
      statement.getTryBlock().getStatements(),
      [path],
      context,
      depth + 1,
    );
  }
  const branch = registerBranch(context, statement, "try-catch", "exception", [
    {
      suffix: "TRY",
      label: "try completes",
      conditionResult: "no exception",
      result: "continue",
    },
    {
      suffix: "CATCH",
      label: "catch executes",
      conditionResult: "exception",
      result: directResult(catchClause.getBlock()),
    },
  ]);
  let paths = [
    ...processStatements(
      statement.getTryBlock().getStatements(),
      [withBranch(path, branch.paths[0].id, "try = no exception")],
      context,
      depth + 1,
    ),
    ...processStatements(
      catchClause.getBlock().getStatements(),
      [withBranch(path, branch.paths[1].id, "try = exception")],
      context,
      depth + 1,
    ),
  ];
  const finallyBlock = statement.getFinallyBlock();
  if (finallyBlock) {
    paths = processStatements(
      finallyBlock.getStatements(),
      paths,
      context,
      depth + 1,
    );
  }
  return paths;
}

function loopCondition(statement: Statement): string {
  if (Node.isWhileStatement(statement) || Node.isDoStatement(statement)) {
    return statement.getExpression().getText();
  }
  if (Node.isForStatement(statement)) {
    return statement.getCondition()?.getText() ?? "for-condition";
  }
  if (Node.isForInStatement(statement) || Node.isForOfStatement(statement)) {
    return statement.getExpression().getText();
  }
  return "loop-condition";
}

function loopBody(statement: Statement): Statement[] {
  if (
    Node.isWhileStatement(statement) ||
    Node.isDoStatement(statement) ||
    Node.isForStatement(statement) ||
    Node.isForInStatement(statement) ||
    Node.isForOfStatement(statement)
  ) {
    return statementsOf(statement.getStatement());
  }
  return [];
}

function processLoop(
  statement: Statement,
  path: FlowPath,
  context: Context,
  depth: number,
): FlowPath[] {
  const condition = loopCondition(statement);
  const branch = registerBranch(context, statement, "loop", condition, [
    {
      suffix: "T",
      label: "one iteration",
      conditionResult: true,
      result: "continue",
    },
    {
      suffix: "F",
      label: "zero iterations",
      conditionResult: false,
      result: "continue",
    },
  ]);
  addWarning(
    context,
    "LOOP_APPROXIMATED",
    "Loop is modeled as zero or one iteration; repeated iterations are not expanded",
    statement.getStartLineNumber(),
  );
  const entered = processStatements(
    loopBody(statement),
    [withBranch(path, branch.paths[0].id, `${condition} = true`)],
    context,
    depth + 1,
  );
  return [
    ...entered,
    withBranch(path, branch.paths[1].id, `${condition} = false`),
  ];
}

function processStatement(
  statement: Statement,
  path: FlowPath,
  context: Context,
  depth: number,
): FlowPath[] {
  if (Node.isIfStatement(statement)) {
    return processIf(statement, path, context, depth);
  }
  if (Node.isSwitchStatement(statement)) {
    return processSwitch(statement, path, context, depth);
  }
  if (Node.isTryStatement(statement)) {
    return processTry(statement, path, context, depth);
  }
  if (
    Node.isWhileStatement(statement) ||
    Node.isDoStatement(statement) ||
    Node.isForStatement(statement) ||
    Node.isForInStatement(statement) ||
    Node.isForOfStatement(statement)
  ) {
    return processLoop(statement, path, context, depth);
  }
  if (Node.isThrowStatement(statement)) {
    const result = `throw ${statement.getExpression()?.getText() ?? ""}`.trim();
    const branch = registerBranch(context, statement, "throw", null, [
      {
        suffix: "X",
        label: "throw",
        conditionResult: "exit",
        result,
      },
    ]);
    return [
      {
        ...withBranch(path, branch.paths[0].id, result),
        result,
        terminated: true,
      },
    ];
  }
  if (Node.isReturnStatement(statement)) {
    const result = `return ${statement.getExpression()?.getText() ?? ""}`.trim();
    const branch = registerBranch(context, statement, "return", null, [
      {
        suffix: "X",
        label: "return",
        conditionResult: "exit",
        result,
      },
    ]);
    return [
      {
        ...withBranch(path, branch.paths[0].id, result),
        result,
        terminated: true,
      },
    ];
  }
  if (
    statement
      .getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
      .some((node) => Node.isCallExpression(node.getParent()))
  ) {
    addWarning(
      context,
      "DYNAMIC_EXECUTION",
      "Dynamic element-access call detected; manual review required",
      statement.getStartLineNumber(),
    );
  }
  return [path];
}

function functionBody(located: LocatedFunction): Block | undefined {
  const body = located.node.getBody();
  return body && Node.isBlock(body) ? body : undefined;
}

function branchCoveragePaths(branches: Branch[]): ExecutionPath[] {
  return branches.flatMap((branch) =>
    branch.paths.map((path, index) => ({
      id: `PATH-${String(
        branches
          .slice(0, branches.indexOf(branch))
          .reduce((total, item) => total + item.paths.length, 0) +
          index +
          1,
      ).padStart(3, "0")}`,
      conditions: [
        branch.condition
          ? `${branch.condition} -> ${path.label}`
          : path.result,
      ],
      coveredBranches: [path.id],
      result: path.result,
      terminated: branch.type === "throw" || branch.type === "return",
    })),
  );
}

function candidateType(result: string): TestcaseCandidate["suggestedType"] {
  if (/throw|error|catch/i.test(result)) return "error";
  if (/return/i.test(result)) return "happy";
  return "alternative";
}

function candidatesFromPaths(paths: ExecutionPath[]): TestcaseCandidate[] {
  return paths.map((path, index) => ({
    id: `WB-${String(index + 1).padStart(3, "0")}`,
    pathId: path.id,
    coveredBranches: path.coveredBranches,
    title: `Xác minh execution path ${path.id}`,
    conditionHints: path.conditions,
    expectedHint: path.result,
    suggestedType: candidateType(path.result),
    approvalState: "source-derived-candidate",
    runtimeCoverage: "not-measured",
  }));
}

export function analyzeFunction(options: AnalyzeOptions): Analysis {
  const matches = locateFunctions(
    options.repositoryPath,
    options.functionName,
    options.filePath,
    options.className,
  );
  if (matches.length === 0) {
    throw new Error(`FUNCTION_NOT_FOUND: ${options.functionName}`);
  }
  if (matches.length > 1) {
    const detail = matches
      .map(
        ({ match }) =>
          `${match.filePath}:${match.line} ${match.className ? `${match.className}.` : ""}${match.functionName}`,
      )
      .join("\n");
    throw new Error(`AMBIGUOUS_FUNCTION:\n${detail}`);
  }

  const located = matches[0];
  const body = functionBody(located);
  const context: Context = {
    branches: [],
    branchIds: new Map(),
    warnings: new Map(),
    maxPaths: options.maxPaths,
    maxDepth: options.maxDepth,
    truncated: false,
  };

  let rawPaths: FlowPath[];
  if (body) {
    rawPaths = processStatements(
      body.getStatements(),
      [
        {
          conditions: [],
          coveredBranches: [],
          result: "function completes",
          terminated: false,
        },
      ],
      context,
      0,
    );
  } else {
    const expression = located.node.getBody()?.getText() ?? "";
    rawPaths = [
      {
        conditions: [],
        coveredBranches: [],
        result: `return ${expression}`,
        terminated: true,
      },
    ];
  }

  const decisionCount = context.branches.filter((branch) =>
    ["if", "switch", "try-catch", "loop"].includes(branch.type),
  ).length;
  if (decisionCount > options.maxBranches) {
    context.truncated = true;
    addWarning(
      context,
      "MAX_BRANCHES_EXCEEDED",
      `Decision count ${decisionCount} exceeded maxBranches=${options.maxBranches}; switched to branch coverage mode`,
    );
  }

  const mode =
    context.truncated || rawPaths.length > options.maxPaths
      ? "branch-coverage"
      : "path-coverage";
  const paths: ExecutionPath[] =
    mode === "branch-coverage"
      ? branchCoveragePaths(context.branches)
      : rawPaths.map((path, index) => ({
          id: `PATH-${String(index + 1).padStart(3, "0")}`,
          ...path,
        }));
  const sourceText = located.node.getText();
  const testcaseCandidates = candidatesFromPaths(paths);
  const allBranchOutcomes = context.branches.flatMap((branch) =>
    branch.paths.map((path) => path.id),
  );
  const candidateOutcomes = new Set(
    testcaseCandidates.flatMap((candidate) => candidate.coveredBranches),
  );
  const analysis: Analysis = {
    analysisVersion: "2.0",
    target: {
      repositoryPath: options.repositoryPath,
      filePath: located.match.filePath,
      language: located.match.language,
      parser: "ts-morph",
      className: located.match.className,
      functionName: located.match.functionName,
      functionKind: located.match.functionKind,
      startLine: located.match.line,
      endLine: located.match.endLine,
      sourceHash: createHash("sha256").update(sourceText).digest("hex"),
    },
    limits: {
      maxBranches: options.maxBranches,
      maxPaths: options.maxPaths,
      maxDepth: options.maxDepth,
    },
    mode,
    metrics: {
      decisionCount,
      branchOutcomeCount: context.branches
        .filter((branch) =>
          ["if", "switch", "try-catch", "loop"].includes(branch.type),
        )
        .reduce((total, branch) => total + branch.paths.length, 0),
      exitCount: context.branches.filter((branch) =>
        ["throw", "return"].includes(branch.type),
      ).length,
      pathCount: paths.length,
      estimatedCyclomaticComplexity: decisionCount + 1,
    },
    branches: context.branches,
    paths,
    testcaseCandidates,
    candidateCoverage: {
      branchOutcomeCount: allBranchOutcomes.length,
      outcomesWithCandidate: allBranchOutcomes.filter((id) =>
        candidateOutcomes.has(id),
      ),
      outcomesWithoutCandidate: allBranchOutcomes.filter(
        (id) => !candidateOutcomes.has(id),
      ),
      note: "Static candidate mapping only; not runtime coverage",
    },
    warnings: [...context.warnings.values()],
    coverage: {
      measured: false,
      provider: null,
      reportPath: null,
      statement: null,
      branch: null,
      branchEvidence: [],
      note: "No runtime coverage evidence supplied",
    },
  };
  return analysisSchema.parse(analysis);
}
