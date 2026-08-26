import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import {
  parse,
  registerDynamicLanguage,
} from "@ast-grep/napi";
import csharp from "@ast-grep/lang-csharp";
import dart from "@ast-grep/lang-dart";
import go from "@ast-grep/lang-go";
import java from "@ast-grep/lang-java";
import python from "@ast-grep/lang-python";
import { scanRepository } from "./scanner.js";
import {
  analysisSchema,
  type Analysis,
  type AnalyzeOptions,
  type Branch,
  type ExecutionPath,
  type FunctionMatch,
  type SupportedLanguage,
  type TestcaseCandidate,
  type Warning,
} from "./types.js";

registerDynamicLanguage({ csharp, dart, go, java, python });

const EXTENSION_LANGUAGE: Record<string, SupportedLanguage> = {
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".cs": "csharp",
  ".dart": "dart",
};

const FUNCTION_KINDS: Partial<Record<SupportedLanguage, string[]>> = {
  python: ["function_definition"],
  java: ["method_declaration", "constructor_declaration"],
  go: ["function_declaration", "method_declaration"],
  csharp: [
    "method_declaration",
    "constructor_declaration",
    "local_function_statement",
  ],
};

const CLASS_KINDS: Partial<Record<SupportedLanguage, string[]>> = {
  java: ["class_declaration", "interface_declaration", "record_declaration"],
  csharp: ["class_declaration", "struct_declaration", "record_declaration"],
  dart: ["class_definition"],
  python: ["class_definition"],
};

type Node = any;

export interface GenericLocated {
  match: FunctionMatch;
  node: Node;
  body: Node;
}

export interface GenericCall {
  name: string;
  text: string;
  line: number;
}

type GStatement =
  | {
      kind: "if";
      line: number;
      condition: string;
      then: GStatement[];
      otherwise: GStatement[];
    }
  | {
      kind: "switch";
      line: number;
      condition: string;
      cases: Array<{ label: string; body: GStatement[] }>;
    }
  | {
      kind: "try";
      line: number;
      tryBody: GStatement[];
      catches: Array<{ label: string; body: GStatement[] }>;
      finallyBody: GStatement[];
    }
  | {
      kind: "loop";
      line: number;
      condition: string;
      body: GStatement[];
    }
  | { kind: "return"; line: number; result: string }
  | { kind: "throw"; line: number; result: string }
  | { kind: "plain"; line: number; text: string };

interface FlowPath {
  conditions: string[];
  coveredBranches: string[];
  result: string;
  terminated: boolean;
}

interface FlowContext {
  branches: Branch[];
  warnings: Map<string, Warning>;
  maxPaths: number;
  maxDepth: number;
  truncated: boolean;
}

export function detectGenericLanguage(path: string): SupportedLanguage | null {
  return EXTENSION_LANGUAGE[extname(path).toLowerCase()] ?? null;
}

function parseSource(language: SupportedLanguage, source: string): Node {
  if (!["python", "java", "go", "csharp", "dart"].includes(language)) {
    throw new Error(`GENERIC_LANGUAGE_UNSUPPORTED: ${language}`);
  }
  return parse(language, source).root();
}

function dynamicField(node: Node, name: string): Node | null {
  return (node as unknown as { field(name: string): Node | null }).field(name);
}

function directNamed(node: Node): Node[] {
  return node.children().filter((child: Node) => child.isNamed());
}

function identifierText(node: Node): string | null {
  const named = dynamicField(node, "name");
  if (named) return named.text();
  return (
    directNamed(node).find((child) =>
      ["identifier", "type_identifier"].includes(child.kind()),
    )?.text() ?? null
  );
}

function ancestorClassName(
  node: Node,
  language: SupportedLanguage,
): string | null {
  const kinds = CLASS_KINDS[language] ?? [];
  const owner = node.ancestors().find((ancestor: Node) =>
    kinds.includes(ancestor.kind()),
  );
  return owner ? identifierText(owner) : null;
}

function dartFunctions(root: Node): Array<{ node: Node; body: Node }> {
  const signatures = root.findAll({ rule: { kind: "function_signature" } });
  const results: Array<{ node: Node; body: Node }> = [];
  for (const signature of signatures) {
    const wrapper =
      signature.parent()?.kind() === "method_signature"
        ? signature.parent()!
        : signature;
    const body = wrapper.next();
    if (body?.kind() === "function_body") {
      results.push({ node: signature, body });
    }
  }
  return results;
}

function genericFunctions(
  root: Node,
  language: SupportedLanguage,
): Array<{ node: Node; body: Node }> {
  if (language === "dart") return dartFunctions(root);
  const results: Array<{ node: Node; body: Node }> = [];
  for (const kind of FUNCTION_KINDS[language] ?? []) {
    for (const node of root.findAll({ rule: { kind } })) {
      const body =
        dynamicField(node, "body") ??
        directNamed(node).find((child) =>
          ["block", "function_body"].includes(child.kind()),
        );
      if (body) results.push({ node, body });
    }
  }
  return results;
}

export function locateGenericFunctions(
  repositoryPath: string,
  functionName: string,
  filePath?: string,
  className?: string,
): GenericLocated[] {
  const root = resolve(repositoryPath);
  const files = filePath
    ? [resolve(root, filePath)]
    : scanRepository(root).filter((path) => detectGenericLanguage(path));
  const matches: GenericLocated[] = [];
  for (const absoluteFilePath of files) {
    const language = detectGenericLanguage(absoluteFilePath);
    if (!language) continue;
    const source = readFileSync(absoluteFilePath, "utf8");
    const parsed = parseSource(language, source);
    for (const candidate of genericFunctions(parsed, language)) {
      const name = identifierText(candidate.node);
      const owner = ancestorClassName(candidate.node, language);
      if (
        name !== functionName ||
        (className !== undefined && owner !== className)
      ) {
        continue;
      }
      const range = candidate.node.range();
      const bodyRange = candidate.body.range();
      matches.push({
        match: {
          filePath: relative(root, absoluteFilePath),
          absoluteFilePath,
          functionName: name,
          functionKind: candidate.node.kind(),
          language,
          className: owner,
          line: range.start.line + 1,
          endLine: bodyRange.end.line + 1,
          isAsync: /^\s*async\b/.test(candidate.node.text()),
          isStatic: /^\s*static\b/.test(candidate.node.text()),
        },
        node: candidate.node,
        body: candidate.body,
      });
    }
  }
  return matches.sort(
    (left, right) =>
      left.match.filePath.localeCompare(right.match.filePath) ||
      left.match.line - right.match.line,
  );
}

export function extractGenericCalls(located: GenericLocated): GenericCall[] {
  const language = located.match.language;
  const kinds: Partial<Record<SupportedLanguage, string[]>> = {
    python: ["call"],
    java: ["method_invocation"],
    go: ["call_expression"],
    csharp: ["invocation_expression"],
    dart: ["selector"],
  };
  const calls: GenericCall[] = [];
  for (const kind of kinds[language] ?? []) {
    for (const node of located.body.findAll({ rule: { kind } })) {
      let target =
        dynamicField(node, "name") ??
        dynamicField(node, "function") ??
        dynamicField(node, "expression");
      if (language === "dart" && kind === "selector") {
        target = node.prev();
      }
      const raw = target?.text() ?? node.text().split("(")[0];
      const name = raw.match(/[A-Za-z_]\w*$/)?.[0];
      if (!name) continue;
      calls.push({ name, text: node.text(), line: lineOf(node) });
    }
  }
  return calls;
}

function unwrapContainer(node: Node): Node[] {
  const kind = node.kind();
  const children = directNamed(node);
  if (
    [
      "block",
      "statement_list",
      "function_body",
      "else_clause",
      "catch_clause",
      "finally_clause",
      "switch_body",
      "switch_block",
      "case_clause",
    ].includes(kind)
  ) {
    const block = children.find((child) =>
      ["block", "statement_list"].includes(child.kind()),
    );
    return block ? unwrapContainer(block) : children;
  }
  return [node];
}

function lineOf(node: Node): number {
  return node.range().start.line + 1;
}

function normalizeMany(nodes: Node[], language: SupportedLanguage): GStatement[] {
  return nodes.flatMap((node) => normalizeNode(node, language));
}

function normalizeBody(node: Node | null, language: SupportedLanguage): GStatement[] {
  return node ? normalizeMany(unwrapContainer(node), language) : [];
}

function caseGroups(
  node: Node,
  language: SupportedLanguage,
): Array<{ label: string; nodes: Node[] }> {
  const descendants = (kind: string): Node[] =>
    node.findAll({ rule: { kind } });
  if (language === "java") {
    return descendants("switch_block_statement_group").map((group) => {
      const children = directNamed(group);
      const label = children.find((child) => child.kind() === "switch_label");
      return {
        label: label?.text().replace(/:$/, "") ?? "case",
        nodes: children.filter((child) => child !== label),
      };
    });
  }
  if (language === "csharp") {
    return descendants("switch_section").map((section) => {
      const children = directNamed(section);
      const labels = children.filter((child) =>
        child.kind().includes("switch_label"),
      );
      return {
        label: labels.map((label) => label.text().replace(/:$/, "")).join(" | "),
        nodes: children.filter((child) => !labels.includes(child)),
      };
    });
  }
  if (language === "go") {
    return [
      ...descendants("expression_case"),
      ...descendants("default_case"),
    ]
      .sort((a, b) => a.range().start.index - b.range().start.index)
      .map((group) => {
        const children = directNamed(group);
        const first = children[0];
        return {
          label: group.text().split(":")[0].trim(),
          nodes: first && !first.kind().includes("statement") ? children.slice(1) : children,
        };
      });
  }
  if (language === "python") {
    return descendants("case_clause").map((group) => {
      const children = directNamed(group);
      const block = children.find((child) => child.kind() === "block");
      return {
        label: group.text().split(":")[0].trim(),
        nodes: block ? unwrapContainer(block) : children.slice(1),
      };
    });
  }
  const block =
    node.find({ rule: { kind: "switch_block" } }) ??
    dynamicField(node, "body");
  if (!block) return [];
  const groups: Array<{ label: string; nodes: Node[] }> = [];
  for (const child of directNamed(block)) {
    if (child.kind() === "switch_label") {
      groups.push({ label: child.text().replace(/:$/, ""), nodes: [] });
    } else if (groups.length > 0) {
      groups.at(-1)!.nodes.push(child);
    }
  }
  return groups;
}

function normalizeNode(node: Node, language: SupportedLanguage): GStatement[] {
  const kind = node.kind();
  if (["block", "statement_list", "function_body", "else_clause"].includes(kind)) {
    return normalizeBody(node, language);
  }
  if (kind === "if_statement") {
    const condition =
      dynamicField(node, "condition") ??
      directNamed(node).find((child) =>
        [
          "condition_clause",
          "parenthesized_expression",
          "comparison_operator",
        ].includes(child.kind()),
      );
    return [
      {
        kind: "if",
        line: lineOf(node),
        condition: condition?.text() ?? "if-condition",
        then: normalizeBody(dynamicField(node, "consequence"), language),
        otherwise: normalizeBody(dynamicField(node, "alternative"), language),
      },
    ];
  }
  if (
    [
      "switch_expression",
      "switch_statement",
      "expression_switch_statement",
      "type_switch_statement",
      "match_statement",
    ].includes(kind)
  ) {
    const condition =
      dynamicField(node, "condition") ??
      dynamicField(node, "value") ??
      directNamed(node)[0];
    return [
      {
        kind: "switch",
        line: lineOf(node),
        condition: condition?.text() ?? "switch-value",
        cases: caseGroups(node, language).map((group) => ({
          label: group.label,
          body: normalizeMany(group.nodes, language),
        })),
      },
    ];
  }
  if (kind === "try_statement") {
    const children = directNamed(node);
    const tryBlock =
      dynamicField(node, "body") ??
      children.find((child) => child.kind() === "block") ??
      null;
    const catches = children
      .filter((child) => child.kind().includes("catch"))
      .map((child) => ({
        label: child.text().split(/\r?\n/)[0].slice(0, 80),
        body: normalizeBody(child, language),
      }));
    const finallyNode =
      children.find((child) => child.kind().includes("finally")) ?? null;
    return [
      {
        kind: "try",
        line: lineOf(node),
        tryBody: normalizeBody(tryBlock, language),
        catches,
        finallyBody: normalizeBody(finallyNode, language),
      },
    ];
  }
  if (
    [
      "for_statement",
      "for_in_statement",
      "for_each_statement",
      "enhanced_for_statement",
      "while_statement",
      "do_statement",
    ].includes(kind)
  ) {
    const condition =
      dynamicField(node, "condition") ??
      dynamicField(node, "value") ??
      dynamicField(node, "right");
    const body =
      dynamicField(node, "body") ??
      directNamed(node).find((child) =>
        ["block", "statement_list"].includes(child.kind()),
      ) ??
      null;
    return [
      {
        kind: "loop",
        line: lineOf(node),
        condition: condition?.text() ?? kind,
        body: normalizeBody(body, language),
      },
    ];
  }
  if (
    kind === "return_statement" ||
    (kind === "expression_statement" && /^\s*return\b/.test(node.text()))
  ) {
    return [{ kind: "return", line: lineOf(node), result: node.text().trim() }];
  }
  if (
    ["throw_statement", "raise_statement"].includes(kind) ||
    (kind === "expression_statement" && /^\s*throw\b/.test(node.text()))
  ) {
    return [{ kind: "throw", line: lineOf(node), result: node.text().trim() }];
  }
  return [{ kind: "plain", line: lineOf(node), text: node.text().trim() }];
}

function addWarning(
  context: FlowContext,
  code: string,
  message: string,
  line?: number,
): void {
  context.warnings.set(`${code}:${line ?? ""}:${message}`, {
    code,
    message,
    ...(line ? { line } : {}),
  });
}

function registerBranch(
  context: FlowContext,
  type: Branch["type"],
  condition: string | null,
  line: number,
  paths: Array<{
    suffix: string;
    label: string;
    conditionResult: boolean | string;
    result: string;
  }>,
): Branch {
  const id = `BR-${String(context.branches.length + 1).padStart(3, "0")}`;
  const branch: Branch = {
    id,
    type,
    condition,
    line,
    paths: paths.map(({ suffix, ...path }) => ({
      id: `${id}-${suffix}`,
      ...path,
    })),
  };
  context.branches.push(branch);
  return branch;
}

function branchPath(path: FlowPath, id: string, condition: string): FlowPath {
  return {
    ...path,
    conditions: [...path.conditions, condition],
    coveredBranches: [...path.coveredBranches, id],
  };
}

function cap(paths: FlowPath[], context: FlowContext, line: number): FlowPath[] {
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

function processStatements(
  statements: GStatement[],
  seeds: FlowPath[],
  context: FlowContext,
  depth: number,
): FlowPath[] {
  let paths = seeds;
  for (const statement of statements) {
    paths = cap(
      paths.flatMap((path) =>
        path.terminated
          ? [path]
          : processStatement(statement, path, context, depth),
      ),
      context,
      statement.line,
    );
  }
  return paths;
}

function processStatement(
  statement: GStatement,
  path: FlowPath,
  context: FlowContext,
  depth: number,
): FlowPath[] {
  if (statement.kind === "return" || statement.kind === "throw") {
    const branch = registerBranch(
      context,
      statement.kind,
      null,
      statement.line,
      [
        {
          suffix: "X",
          label: statement.kind,
          conditionResult: "exit",
          result: statement.result,
        },
      ],
    );
    return [
      {
        ...branchPath(path, branch.paths[0].id, statement.result),
        result: statement.result,
        terminated: true,
      },
    ];
  }
  if (statement.kind === "if") {
    const branch = registerBranch(context, "if", statement.condition, statement.line, [
      {
        suffix: "T",
        label: "true",
        conditionResult: true,
        result: "continue",
      },
      {
        suffix: "F",
        label: "false",
        conditionResult: false,
        result: "continue",
      },
    ]);
    if (depth >= context.maxDepth) {
      context.truncated = true;
      addWarning(
        context,
        "MAX_DEPTH_EXCEEDED",
        `Nested control-flow depth exceeded maxDepth=${context.maxDepth}`,
        statement.line,
      );
      return [
        branchPath(path, branch.paths[0].id, `${statement.condition} = true`),
        branchPath(path, branch.paths[1].id, `${statement.condition} = false`),
      ];
    }
    return [
      ...processStatements(
        statement.then,
        [branchPath(path, branch.paths[0].id, `${statement.condition} = true`)],
        context,
        depth + 1,
      ),
      ...processStatements(
        statement.otherwise,
        [branchPath(path, branch.paths[1].id, `${statement.condition} = false`)],
        context,
        depth + 1,
      ),
    ];
  }
  if (statement.kind === "switch") {
    const cases =
      statement.cases.length > 0
        ? statement.cases
        : [{ label: "unresolved-case", body: [] }];
    const branch = registerBranch(
      context,
      "switch",
      statement.condition,
      statement.line,
      cases.map((item, index) => ({
        suffix: `P${index + 1}`,
        label: item.label,
        conditionResult: item.label,
        result: "continue",
      })),
    );
    return cases.flatMap((item, index) =>
      processStatements(
        item.body,
        [
          branchPath(
            path,
            branch.paths[index].id,
            `${statement.condition} -> ${item.label}`,
          ),
        ],
        context,
        depth + 1,
      ),
    );
  }
  if (statement.kind === "try") {
    const paths = [
      { label: "try completes", body: statement.tryBody },
      ...statement.catches,
    ];
    const branch = registerBranch(
      context,
      "try-catch",
      "exception",
      statement.line,
      paths.map((item, index) => ({
        suffix: index === 0 ? "TRY" : `CATCH${index}`,
        label: item.label,
        conditionResult: index === 0 ? "no exception" : "exception",
        result: "continue",
      })),
    );
    let outputs = paths.flatMap((item, index) =>
      processStatements(
        item.body,
        [
          branchPath(
            path,
            branch.paths[index].id,
            index === 0 ? "try = no exception" : `try = ${item.label}`,
          ),
        ],
        context,
        depth + 1,
      ),
    );
    if (statement.finallyBody.length > 0) {
      outputs = processStatements(
        statement.finallyBody,
        outputs,
        context,
        depth + 1,
      );
    }
    return outputs;
  }
  if (statement.kind === "loop") {
    const branch = registerBranch(context, "loop", statement.condition, statement.line, [
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
      statement.line,
    );
    return [
      ...processStatements(
        statement.body,
        [branchPath(path, branch.paths[0].id, `${statement.condition} = true`)],
        context,
        depth + 1,
      ),
      branchPath(path, branch.paths[1].id, `${statement.condition} = false`),
    ];
  }
  if (/\[[^\]]+\]\s*\(/.test(statement.text)) {
    addWarning(
      context,
      "DYNAMIC_EXECUTION",
      "Dynamic dispatch detected; manual review required",
      statement.line,
    );
  }
  return [path];
}

function branchCoveragePaths(branches: Branch[]): ExecutionPath[] {
  let counter = 0;
  return branches.flatMap((branch) =>
    branch.paths.map((path) => ({
      id: `PATH-${String(++counter).padStart(3, "0")}`,
      conditions: [
        branch.condition ? `${branch.condition} -> ${path.label}` : path.result,
      ],
      coveredBranches: [path.id],
      result: path.result,
      terminated: branch.type === "return" || branch.type === "throw",
    })),
  );
}

function candidateType(result: string): TestcaseCandidate["suggestedType"] {
  if (/throw|raise|error|catch/i.test(result)) return "error";
  if (/return/i.test(result)) return "happy";
  return "alternative";
}

function testcaseCandidates(paths: ExecutionPath[]): TestcaseCandidate[] {
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

export function analyzeGenericFunction(options: AnalyzeOptions): Analysis {
  const matches = locateGenericFunctions(
    options.repositoryPath,
    options.functionName,
    options.filePath,
    options.className,
  );
  if (matches.length === 0) {
    throw new Error(`FUNCTION_NOT_FOUND: ${options.functionName}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `AMBIGUOUS_FUNCTION:\n${matches
        .map(
          ({ match }) =>
            `${match.filePath}:${match.line} ${match.className ? `${match.className}.` : ""}${match.functionName}`,
        )
        .join("\n")}`,
    );
  }
  const located = matches[0];
  const statements = normalizeBody(located.body, located.match.language);
  const context: FlowContext = {
    branches: [],
    warnings: new Map(),
    maxPaths: options.maxPaths,
    maxDepth: options.maxDepth,
    truncated: false,
  };
  const rawPaths = processStatements(
    statements,
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
  const decisionTypes = new Set(["if", "switch", "try-catch", "loop"]);
  const decisionCount = context.branches.filter((branch) =>
    decisionTypes.has(branch.type),
  ).length;
  if (decisionCount > options.maxBranches) {
    context.truncated = true;
    addWarning(
      context,
      "MAX_BRANCHES_EXCEEDED",
      `Decision count ${decisionCount} exceeded maxBranches=${options.maxBranches}; switched to branch coverage mode`,
    );
  }
  const mode = context.truncated ? "branch-coverage" : "path-coverage";
  const paths =
    mode === "branch-coverage"
      ? branchCoveragePaths(context.branches)
      : rawPaths.map((path, index) => ({
          id: `PATH-${String(index + 1).padStart(3, "0")}`,
          ...path,
        }));
  const candidates = testcaseCandidates(paths);
  const allOutcomes = context.branches.flatMap((branch) =>
    branch.paths.map((path) => path.id),
  );
  const candidateOutcomes = new Set(
    candidates.flatMap((candidate) => candidate.coveredBranches),
  );
  const analysis: Analysis = {
    analysisVersion: "2.0",
    target: {
      repositoryPath: resolve(options.repositoryPath),
      filePath: located.match.filePath,
      language: located.match.language,
      parser: "ast-grep/tree-sitter",
      className: located.match.className,
      functionName: located.match.functionName,
      functionKind: located.match.functionKind,
      startLine: located.match.line,
      endLine: located.match.endLine,
      sourceHash: createHash("sha256")
        .update(`${located.node.text()}\n${located.body.text()}`)
        .digest("hex"),
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
        .filter((branch) => decisionTypes.has(branch.type))
        .reduce((sum, branch) => sum + branch.paths.length, 0),
      exitCount: context.branches.filter((branch) =>
        ["return", "throw"].includes(branch.type),
      ).length,
      pathCount: paths.length,
      estimatedCyclomaticComplexity: decisionCount + 1,
    },
    branches: context.branches,
    paths,
    testcaseCandidates: candidates,
    candidateCoverage: {
      branchOutcomeCount: allOutcomes.length,
      outcomesWithCandidate: allOutcomes.filter((id) =>
        candidateOutcomes.has(id),
      ),
      outcomesWithoutCandidate: allOutcomes.filter(
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
