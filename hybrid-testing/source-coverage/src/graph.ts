import { relative, resolve } from "node:path";
import {
  Node,
  Project,
  SyntaxKind,
  type ClassDeclaration,
} from "ts-morph";
import { locateFunctions, type LocatedFunction } from "./locator.js";
import {
  extractGenericCalls,
  locateGenericFunctions,
  type GenericLocated,
} from "./generic-analyzer.js";
import { scanRepository } from "./scanner.js";
import { detectGenericLanguage } from "./generic-analyzer.js";

export interface CallGraph {
  graphVersion: "1.0";
  language: string;
  entrypoint: string;
  limits: { maxDepth: number; maxNodes: number };
  nodes: Array<{
    id: string;
    filePath: string;
    className: string | null;
    functionName: string;
    line: number;
    depth: number;
  }>;
  edges: Array<{
    from: string;
    to: string | null;
    call: string;
    line: number;
    resolution: "resolved" | "ambiguous" | "external-or-dynamic";
    candidates: string[];
  }>;
  truncated: boolean;
}

export interface NestJsGraph {
  graphVersion: "1.0";
  framework: "nestjs";
  components: Array<{
    name: string;
    kind: "controller" | "provider" | "module" | "class";
    filePath: string;
    line: number;
  }>;
  injections: Array<{
    from: string;
    parameter: string;
    token: string;
    to: string | null;
    resolved: boolean;
  }>;
  modules: Array<{
    name: string;
    controllers: string[];
    providers: string[];
    imports: string[];
    exports: string[];
  }>;
  routes: Array<{
    controller: string;
    method: string;
    httpMethod: string;
    path: string;
    handler: string;
  }>;
  warnings: string[];
}

function functionId(located: LocatedFunction): string {
  const match = located.match;
  return `${match.filePath}#${match.className ? `${match.className}.` : ""}${match.functionName}`;
}

function constructorAliases(located: LocatedFunction): Map<string, string> {
  const aliases = new Map<string, string>();
  const owner = located.node.getFirstAncestorByKind(
    SyntaxKind.ClassDeclaration,
  );
  for (const constructor of owner?.getConstructors() ?? []) {
    for (const parameter of constructor.getParameters()) {
      const token =
        parameter
          .getDecorator("Inject")
          ?.getArguments()[0]
          ?.getText()
          .replace(/^['"]|['"]$/g, "") ??
        parameter.getTypeNode()?.getText() ??
        parameter.getType().getText(parameter);
      aliases.set(parameter.getName(), token.replace(/<.*>$/, ""));
    }
  }
  return aliases;
}

function resolveCallCandidates(
  repositoryPath: string,
  current: LocatedFunction,
  expression: import("ts-morph").Expression,
): LocatedFunction[] {
  let functionName: string | null = null;
  let targetClass: string | undefined;
  if (Node.isPropertyAccessExpression(expression)) {
    functionName = expression.getName();
    const receiver = expression.getExpression().getText();
    if (receiver === "this") {
      targetClass = current.match.className ?? undefined;
    } else if (receiver.startsWith("this.")) {
      const alias = receiver.split(".")[1];
      targetClass = constructorAliases(current).get(alias);
    }
  } else if (Node.isIdentifier(expression)) {
    functionName = expression.getText();
  }
  if (!functionName) return [];
  let matches = locateFunctions(
    repositoryPath,
    functionName,
    undefined,
    targetClass,
  );
  if (targetClass && matches.length > 1) {
    const importedFile = current.sourceFile
      .getImportDeclarations()
      .find((declaration) => {
        const defaultName = declaration.getDefaultImport()?.getText();
        const named = declaration.getNamedImports().some((item) => {
          const localName = item.getAliasNode()?.getText() ?? item.getName();
          return localName === targetClass;
        });
        return defaultName === targetClass || named;
      })
      ?.getModuleSpecifierSourceFile()
      ?.getFilePath();
    if (importedFile) {
      matches = matches.filter(
        ({ match }) => match.absoluteFilePath === importedFile,
      );
    }
  }
  if (matches.length > 1 && !targetClass) {
    const sameFile = matches.filter(
      ({ match }) => match.filePath === current.match.filePath,
    );
    if (sameFile.length === 1) matches = sameFile;
  }
  return matches;
}

export function buildCallGraph(options: {
  repositoryPath: string;
  functionName: string;
  filePath?: string;
  className?: string;
  maxDepth?: number;
  maxNodes?: number;
}): CallGraph {
  const repositoryPath = resolve(options.repositoryPath);
  const seeds = locateFunctions(
    repositoryPath,
    options.functionName,
    options.filePath,
    options.className,
  );
  if (seeds.length === 0) {
    throw new Error(`FUNCTION_NOT_FOUND: ${options.functionName}`);
  }
  if (seeds.length > 1) {
    throw new Error(
      `AMBIGUOUS_FUNCTION:\n${seeds
        .map(({ match }) => `${match.filePath}:${match.line}`)
        .join("\n")}`,
    );
  }
  const maxDepth = options.maxDepth ?? 5;
  const maxNodes = options.maxNodes ?? 100;
  const nodes: CallGraph["nodes"] = [];
  const edges: CallGraph["edges"] = [];
  const visited = new Set<string>();
  const queue: Array<{ located: LocatedFunction; depth: number }> = [
    { located: seeds[0], depth: 0 },
  ];
  let truncated = false;

  while (queue.length > 0) {
    const item = queue.shift()!;
    const id = functionId(item.located);
    if (visited.has(id)) continue;
    if (visited.size >= maxNodes) {
      truncated = true;
      break;
    }
    visited.add(id);
    nodes.push({
      id,
      filePath: item.located.match.filePath,
      className: item.located.match.className,
      functionName: item.located.match.functionName,
      line: item.located.match.line,
      depth: item.depth,
    });
    for (const call of item.located.node.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getFirstAncestorByKind(SyntaxKind.Decorator)) continue;
      const expression = call.getExpression();
      const candidates = resolveCallCandidates(
        repositoryPath,
        item.located,
        expression,
      );
      const candidateIds = candidates.map(functionId);
      const resolution =
        candidates.length === 1
          ? "resolved"
          : candidates.length > 1
            ? "ambiguous"
            : "external-or-dynamic";
      edges.push({
        from: id,
        to: candidates.length === 1 ? candidateIds[0] : null,
        call: call.getText(),
        line: call.getStartLineNumber(),
        resolution,
        candidates: candidateIds,
      });
      if (candidates.length === 1) {
        if (item.depth < maxDepth) {
          queue.push({ located: candidates[0], depth: item.depth + 1 });
        } else {
          truncated = true;
        }
      }
    }
  }
  return {
    graphVersion: "1.0",
    language: "typescript/javascript",
    entrypoint: functionId(seeds[0]),
    limits: { maxDepth, maxNodes },
    nodes,
    edges,
    truncated,
  };
}

function genericFunctionId(located: GenericLocated): string {
  const match = located.match;
  return `${match.filePath}#${match.className ? `${match.className}.` : ""}${match.functionName}`;
}

export function buildGenericCallGraph(options: {
  repositoryPath: string;
  functionName: string;
  filePath?: string;
  className?: string;
  maxDepth?: number;
  maxNodes?: number;
}): CallGraph {
  const repositoryPath = resolve(options.repositoryPath);
  const seeds = locateGenericFunctions(
    repositoryPath,
    options.functionName,
    options.filePath,
    options.className,
  );
  if (seeds.length !== 1) {
    throw new Error(
      seeds.length === 0
        ? `FUNCTION_NOT_FOUND: ${options.functionName}`
        : `AMBIGUOUS_FUNCTION:\n${seeds
            .map(({ match }) => `${match.filePath}:${match.line}`)
            .join("\n")}`,
    );
  }
  const maxDepth = options.maxDepth ?? 5;
  const maxNodes = options.maxNodes ?? 100;
  const nodes: CallGraph["nodes"] = [];
  const edges: CallGraph["edges"] = [];
  const visited = new Set<string>();
  const queue: Array<{ located: GenericLocated; depth: number }> = [
    { located: seeds[0], depth: 0 },
  ];
  let truncated = false;
  while (queue.length > 0) {
    const item = queue.shift()!;
    const id = genericFunctionId(item.located);
    if (visited.has(id)) continue;
    if (visited.size >= maxNodes) {
      truncated = true;
      break;
    }
    visited.add(id);
    nodes.push({
      id,
      filePath: item.located.match.filePath,
      className: item.located.match.className,
      functionName: item.located.match.functionName,
      line: item.located.match.line,
      depth: item.depth,
    });
    for (const call of extractGenericCalls(item.located)) {
      let candidates = locateGenericFunctions(
        repositoryPath,
        call.name,
        undefined,
        undefined,
      );
      if (candidates.length > 1) {
        const sameFile = candidates.filter(
          ({ match }) => match.filePath === item.located.match.filePath,
        );
        if (sameFile.length === 1) candidates = sameFile;
      }
      const ids = candidates.map(genericFunctionId);
      edges.push({
        from: id,
        to: candidates.length === 1 ? ids[0] : null,
        call: call.text,
        line: call.line,
        resolution:
          candidates.length === 1
            ? "resolved"
            : candidates.length > 1
              ? "ambiguous"
              : "external-or-dynamic",
        candidates: ids,
      });
      if (candidates.length === 1) {
        if (item.depth < maxDepth) {
          queue.push({ located: candidates[0], depth: item.depth + 1 });
        } else {
          truncated = true;
        }
      }
    }
  }
  return {
    graphVersion: "1.0",
    language: seeds[0].match.language,
    entrypoint: genericFunctionId(seeds[0]),
    limits: { maxDepth, maxNodes },
    nodes,
    edges,
    truncated,
  };
}

export function buildAnyCallGraph(options: {
  repositoryPath: string;
  functionName: string;
  filePath?: string;
  className?: string;
  maxDepth?: number;
  maxNodes?: number;
}): CallGraph {
  if (options.filePath && detectGenericLanguage(options.filePath)) {
    return buildGenericCallGraph(options);
  }
  return buildCallGraph(options);
}

function createProject(repositoryPath: string): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, checkJs: false },
  });
  for (const file of scanRepository(repositoryPath).filter((path) =>
    /\.[cm]?[jt]sx?$/.test(path),
  )) {
    project.addSourceFileAtPath(file);
  }
  return project;
}

function decoratorName(owner: {
  getDecorators(): Array<{ getName(): string }>;
}): string[] {
  return owner.getDecorators().map((decorator) => decorator.getName());
}

function stringArgument(
  decorator: import("ts-morph").Decorator | undefined,
): string {
  return (
    decorator
      ?.getArguments()[0]
      ?.getText()
      .replace(/^['"`]|['"`]$/g, "") ?? ""
  );
}

function arrayProperty(
  object: import("ts-morph").ObjectLiteralExpression,
  name: string,
): string[] {
  const property = object.getProperty(name);
  if (!property || !Node.isPropertyAssignment(property)) return [];
  const initializer = property.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) return [];
  return initializer.getElements().map((element) => element.getText());
}

function classKind(owner: ClassDeclaration): NestJsGraph["components"][number]["kind"] {
  const decorators = decoratorName(owner);
  if (decorators.includes("Controller")) return "controller";
  if (decorators.includes("Injectable")) return "provider";
  if (decorators.includes("Module")) return "module";
  return "class";
}

export function buildNestJsGraph(repositoryPathInput: string): NestJsGraph {
  const repositoryPath = resolve(repositoryPathInput);
  const project = createProject(repositoryPath);
  const classes = project
    .getSourceFiles()
    .flatMap((sourceFile) => sourceFile.getClasses())
    .filter((owner) => owner.getName());
  const classNames = new Set(classes.map((owner) => owner.getName()!));
  const components: NestJsGraph["components"] = [];
  const injections: NestJsGraph["injections"] = [];
  const modules: NestJsGraph["modules"] = [];
  const routes: NestJsGraph["routes"] = [];

  for (const owner of classes) {
    const name = owner.getName()!;
    const kind = classKind(owner);
    components.push({
      name,
      kind,
      filePath: relative(repositoryPath, owner.getSourceFile().getFilePath()),
      line: owner.getStartLineNumber(),
    });
    for (const constructor of owner.getConstructors()) {
      for (const parameter of constructor.getParameters()) {
        const token =
          parameter
            .getDecorator("Inject")
            ?.getArguments()[0]
            ?.getText()
            .replace(/^['"]|['"]$/g, "") ??
          parameter.getTypeNode()?.getText() ??
          parameter.getType().getText(parameter);
        const normalized = token.replace(/<.*>$/, "");
        injections.push({
          from: name,
          parameter: parameter.getName(),
          token: normalized,
          to: classNames.has(normalized) ? normalized : null,
          resolved: classNames.has(normalized),
        });
      }
    }
    const moduleDecorator = owner.getDecorator("Module");
    const moduleArgument = moduleDecorator?.getArguments()[0];
    if (moduleArgument && Node.isObjectLiteralExpression(moduleArgument)) {
      modules.push({
        name,
        controllers: arrayProperty(moduleArgument, "controllers"),
        providers: arrayProperty(moduleArgument, "providers"),
        imports: arrayProperty(moduleArgument, "imports"),
        exports: arrayProperty(moduleArgument, "exports"),
      });
    }
    const controller = owner.getDecorator("Controller");
    if (controller) {
      const basePath = stringArgument(controller);
      for (const method of owner.getMethods()) {
        const routeDecorator = method
          .getDecorators()
          .find((decorator) =>
            ["Get", "Post", "Put", "Patch", "Delete"].includes(
              decorator.getName(),
            ),
          );
        if (!routeDecorator) continue;
        const routePath = stringArgument(routeDecorator);
        routes.push({
          controller: name,
          method: method.getName(),
          httpMethod: routeDecorator.getName().toUpperCase(),
          path: `/${[basePath, routePath]
            .filter(Boolean)
            .join("/")
            .replace(/^\/+|\/+$/g, "")}`,
          handler: `${name}.${method.getName()}`,
        });
      }
    }
  }
  return {
    graphVersion: "1.0",
    framework: "nestjs",
    components,
    injections,
    modules,
    routes,
    warnings: injections
      .filter((edge) => !edge.resolved)
      .map(
        (edge) =>
          `Unresolved injection ${edge.from}.${edge.parameter}: ${edge.token}`,
      ),
  };
}
