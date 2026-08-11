import { relative, resolve } from "node:path";
import { extname } from "node:path";
import {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
  Node,
  Project,
  SourceFile,
  SyntaxKind,
} from "ts-morph";
import { scanRepository } from "./scanner.js";
import type { FunctionMatch } from "./types.js";

export type SupportedFunction =
  | FunctionDeclaration
  | MethodDeclaration
  | ArrowFunction
  | FunctionExpression;

export interface LocatedFunction {
  match: FunctionMatch;
  node: SupportedFunction;
  sourceFile: SourceFile;
}

function createProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      target: 9,
    },
  });
}

function addFiles(
  project: Project,
  repositoryPath: string,
  filePath?: string,
): void {
  if (filePath) {
    const absolute = resolve(repositoryPath, filePath);
    project.addSourceFileAtPath(absolute);
    return;
  }
  for (const file of scanRepository(repositoryPath).filter((candidate) =>
    [".ts", ".tsx", ".js", ".jsx"].includes(
      extname(candidate).toLowerCase(),
    ),
  )) {
    project.addSourceFileAtPath(file);
  }
}

function matchFromNode(
  repositoryPath: string,
  sourceFile: SourceFile,
  node: SupportedFunction,
  functionName: string,
  functionKind: string,
  className: string | null,
  isStatic = false,
): LocatedFunction {
  const absoluteFilePath = sourceFile.getFilePath();
  const language =
    [".js", ".jsx"].includes(extname(absoluteFilePath).toLowerCase())
      ? "javascript"
      : "typescript";
  return {
    match: {
      filePath: relative(resolve(repositoryPath), absoluteFilePath),
      absoluteFilePath,
      functionName,
      functionKind,
      language,
      className,
      line: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      isAsync: node.isAsync(),
      isStatic,
    },
    node,
    sourceFile,
  };
}

export function locateFunctions(
  repositoryPath: string,
  functionName: string,
  filePath?: string,
  className?: string,
): LocatedFunction[] {
  const project = createProject();
  addFiles(project, repositoryPath, filePath);
  const matches: LocatedFunction[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const fn of sourceFile.getFunctions()) {
      if (fn.getName() === functionName && !className) {
        matches.push(
          matchFromNode(
            repositoryPath,
            sourceFile,
            fn,
            functionName,
            "function-declaration",
            null,
          ),
        );
      }
    }

    for (const method of sourceFile.getDescendantsOfKind(
      SyntaxKind.MethodDeclaration,
    )) {
      const owner = method.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      const ownerName = owner?.getName() ?? null;
      if (
        method.getName() === functionName &&
        (!className || ownerName === className)
      ) {
        matches.push(
          matchFromNode(
            repositoryPath,
            sourceFile,
            method,
            functionName,
            "class-method",
            ownerName,
            method.isStatic(),
          ),
        );
      }
    }

    for (const variable of sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration,
    )) {
      if (variable.getName() !== functionName || className) continue;
      const initializer = variable.getInitializer();
      if (
        initializer &&
        (Node.isArrowFunction(initializer) ||
          Node.isFunctionExpression(initializer))
      ) {
        matches.push(
          matchFromNode(
            repositoryPath,
            sourceFile,
            initializer,
            functionName,
            Node.isArrowFunction(initializer)
              ? "arrow-function"
              : "function-expression",
            null,
          ),
        );
      }
    }
  }

  return matches.sort(
    (a, b) =>
      a.match.filePath.localeCompare(b.match.filePath) ||
      a.match.line - b.match.line,
  );
}
