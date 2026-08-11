import { readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".cs",
  ".dart",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
]);

function isGeneratedFile(path: string): boolean {
  return (
    path.endsWith(".d.ts") ||
    /\.(generated|gen|min)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|[/\\])generated([/\\]|$)/.test(path)
  );
}

export function scanRepository(repositoryPath: string): string[] {
  const root = resolve(repositoryPath);
  const files: string[] = [];

  function visit(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(absolute);
        continue;
      }
      if (
        entry.isFile() &&
        SOURCE_EXTENSIONS.has(extname(entry.name)) &&
        !isGeneratedFile(absolute)
      ) {
        files.push(absolute);
      }
    }
  }

  visit(root);
  return files.sort((a, b) =>
    relative(root, a).localeCompare(relative(root, b)),
  );
}
