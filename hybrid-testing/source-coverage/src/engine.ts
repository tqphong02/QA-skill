import { extname, resolve } from "node:path";
import { analyzeFunction } from "./analyzer.js";
import {
  analyzeGenericFunction,
  detectGenericLanguage,
  locateGenericFunctions,
} from "./generic-analyzer.js";
import { locateFunctions } from "./locator.js";
import type {
  Analysis,
  AnalyzeOptions,
  FunctionMatch,
} from "./types.js";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export function findAnyFunctions(
  repositoryPath: string,
  functionName: string,
  filePath?: string,
  className?: string,
): FunctionMatch[] {
  if (filePath) {
    const extension = extname(filePath).toLowerCase();
    if (TS_EXTENSIONS.has(extension)) {
      return locateFunctions(
        repositoryPath,
        functionName,
        filePath,
        className,
      ).map(({ match }) => match);
    }
    if (detectGenericLanguage(filePath)) {
      return locateGenericFunctions(
        repositoryPath,
        functionName,
        filePath,
        className,
      ).map(({ match }) => match);
    }
    throw new Error(`LANGUAGE_NOT_SUPPORTED: ${extension || filePath}`);
  }
  return [
    ...locateFunctions(repositoryPath, functionName, undefined, className).map(
      ({ match }) => match,
    ),
    ...locateGenericFunctions(
      repositoryPath,
      functionName,
      undefined,
      className,
    ).map(({ match }) => match),
  ].sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) || left.line - right.line,
  );
}

export function analyzeAnyFunction(options: AnalyzeOptions): Analysis {
  const normalized: AnalyzeOptions = {
    ...options,
    repositoryPath: resolve(options.repositoryPath),
    maxBranches: options.maxBranches ?? 20,
    maxPaths: options.maxPaths ?? 50,
    maxDepth: options.maxDepth ?? 5,
  };
  if (normalized.filePath) {
    const extension = extname(normalized.filePath).toLowerCase();
    if (TS_EXTENSIONS.has(extension)) return analyzeFunction(normalized);
    if (detectGenericLanguage(normalized.filePath)) {
      return analyzeGenericFunction(normalized);
    }
    throw new Error(
      `LANGUAGE_NOT_SUPPORTED: ${extension || normalized.filePath}`,
    );
  }

  const matches = findAnyFunctions(
    normalized.repositoryPath,
    normalized.functionName,
    undefined,
    normalized.className,
  );
  if (matches.length === 0) {
    throw new Error(`FUNCTION_NOT_FOUND: ${normalized.functionName}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `AMBIGUOUS_FUNCTION:\n${matches
        .map(
          (match) =>
            `${match.filePath}:${match.line} [${match.language}] ${match.className ? `${match.className}.` : ""}${match.functionName}`,
        )
        .join("\n")}`,
    );
  }
  const match = matches[0];
  return analyzeAnyFunction({
    ...normalized,
    filePath: match.filePath,
    className: match.className ?? undefined,
  });
}
