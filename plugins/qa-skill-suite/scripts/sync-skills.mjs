#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");
const SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills");
const REGISTRY_PATH = path.join(REPOSITORY_ROOT, "config", "skill-registry.json");
const MANIFEST_PATH = path.join(PLUGIN_ROOT, "bundle-manifest.json");
const CHECK_ONLY = process.argv.includes("--check");

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "evidence",
  "node_modules",
  "project-specific",
  "qa-knowledge",
  "tests",
  "vendor",
]);
const IGNORED_FILE_NAMES = new Set([
  ".DS_Store",
  ".env",
  "auth.json",
  "fix_template.py",
  "test-outline.py",
  "test_cf.py",
  "test_cf.xlsx",
]);
const IGNORED_FILE_SUFFIXES = [".bak", ".orig", ".pyc", ".pyo", ".tmp"];
const IGNORED_FILE_PREFIXES = ["test-output"];
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const PLUGIN_RUNTIME_CONTRACT = `
## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this \`SKILL.md\` as \`SKILL_ROOT\` and its parent as \`PLUGIN_SKILLS_ROOT\`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.
`;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function readRegistry() {
  const payload = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
    throw new Error("config/skill-registry.json has no public skills");
  }

  const seenIds = new Set();
  const entries = payload.skills.map((skill) => {
    if (!skill || typeof skill.id !== "string" || typeof skill.path !== "string") {
      throw new Error("Each registry entry must have string id and path fields");
    }
    if (seenIds.has(skill.id)) {
      throw new Error(`Duplicate registry skill id: ${skill.id}`);
    }
    seenIds.add(skill.id);

    const sourceRoot = path.resolve(REPOSITORY_ROOT, skill.path);
    assertInside(REPOSITORY_ROOT, sourceRoot, `source skill ${skill.id}`);
    if (!fs.existsSync(path.join(sourceRoot, "SKILL.md"))) {
      throw new Error(`Missing SKILL.md for ${skill.id} at ${skill.path}`);
    }

    return {
      ...skill,
      sourceRoot,
      bundleRoot: path.join(SKILLS_ROOT, skill.id),
    };
  });

  return { payload, entries };
}

function assertInside(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes ${parent}`);
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function normalizedRelative(from, to) {
  const relative = toPosix(path.relative(from, to));
  if (relative === "") return ".";
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function listSourceFiles(root) {
  const output = [];

  function visit(current) {
    const items = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const item of items) {
      if (item.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in plugin bundles: ${path.join(current, item.name)}`);
      }
      if (item.isDirectory() && IGNORED_DIRECTORIES.has(item.name)) continue;
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) {
        visit(absolute);
      } else if (
        item.isFile()
        && !IGNORED_FILE_NAMES.has(item.name)
        && !IGNORED_FILE_PREFIXES.some((prefix) => item.name.startsWith(prefix))
        && !IGNORED_FILE_SUFFIXES.some((suffix) => item.name.endsWith(suffix))
      ) {
        output.push(absolute);
      }
    }
  }

  visit(root);
  return output;
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || path.basename(filePath) === "Dockerfile";
}

function replaceAll(value, search, replacement) {
  return search && search !== replacement ? value.split(search).join(replacement) : value;
}

function replaceRepositoryPath(value, search, replacement) {
  if (!search || search === replacement) return value;
  let cursor = 0;
  let output = "";
  while (cursor < value.length) {
    const index = value.indexOf(search, cursor);
    if (index === -1) return output + value.slice(cursor);
    output += value.slice(cursor, index);
    output += index > 0 && value[index - 1] === "." ? search : replacement;
    cursor = index + search.length;
  }
  return output;
}

function rewriteCrossSkillPaths(contents, sourceFile, bundleFile, entries) {
  const replacements = [];

  for (const target of entries) {
    const bundledTarget = normalizedRelative(path.dirname(bundleFile), target.bundleRoot);
    const sourceRelative = normalizedRelative(path.dirname(sourceFile), target.sourceRoot);
    const repositoryRelative = toPosix(target.path).replace(/^\.\//, "");

    if (sourceRelative !== ".") {
      replacements.push([sourceRelative, bundledTarget, false]);
      replacements.push([sourceRelative.replaceAll("/", "\\"), bundledTarget, false]);
    }
    replacements.push([repositoryRelative, bundledTarget, true]);
    replacements.push([repositoryRelative.replaceAll("/", "\\"), bundledTarget, true]);
  }

  replacements.sort((left, right) => right[0].length - left[0].length);
  let rewritten = contents;
  for (const [search, replacement, repositoryPath] of replacements) {
    rewritten = repositoryPath
      ? replaceRepositoryPath(rewritten, search, replacement)
      : replaceAll(rewritten, search, replacement);
  }
  return rewritten;
}

function injectRuntimeContract(contents, relativePath) {
  if (toPosix(relativePath) !== "SKILL.md" || contents.includes("## Plugin runtime contract")) {
    return contents;
  }
  if (!contents.startsWith("---\n")) {
    throw new Error("Top-level SKILL.md must start with YAML frontmatter");
  }
  const frontmatterEnd = contents.indexOf("\n---", 4);
  if (frontmatterEnd === -1) {
    throw new Error("Top-level SKILL.md frontmatter is not closed");
  }
  const insertionPoint = frontmatterEnd + 4;
  return `${contents.slice(0, insertionPoint)}\n${PLUGIN_RUNTIME_CONTRACT}${contents.slice(insertionPoint)}`;
}

function expectedBundle(entry, entries) {
  const files = new Map();
  for (const sourceFile of listSourceFiles(entry.sourceRoot)) {
    const sourceRelative = path.relative(entry.sourceRoot, sourceFile);
    const isNestedSkillManifest = path.basename(sourceRelative) === "SKILL.md"
      && path.dirname(sourceRelative) !== ".";
    const relative = isNestedSkillManifest
      ? path.join(path.dirname(sourceRelative), "SKILL.dependency-resource.md")
      : sourceRelative;
    const bundleFile = path.join(entry.bundleRoot, relative);
    let contents = fs.readFileSync(sourceFile);

    if (isTextFile(sourceFile)) {
      let text = contents.toString("utf8").replaceAll("\r\n", "\n");
      text = rewriteCrossSkillPaths(text, sourceFile, bundleFile, entries);
      text = injectRuntimeContract(text, sourceRelative);
      contents = Buffer.from(text, "utf8");
    }
    files.set(toPosix(relative), contents);
  }
  return files;
}

function treeHash(files) {
  const hash = crypto.createHash("sha256");
  for (const [relative, contents] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(relative);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function sourceHash(entry) {
  const files = new Map();
  for (const file of listSourceFiles(entry.sourceRoot)) {
    files.set(toPosix(path.relative(entry.sourceRoot, file)), fs.readFileSync(file));
  }
  return treeHash(files);
}

function writeBundle(entry, files) {
  assertInside(SKILLS_ROOT, entry.bundleRoot, `bundle skill ${entry.id}`);
  fs.rmSync(entry.bundleRoot, { recursive: true, force: true });
  fs.mkdirSync(entry.bundleRoot, { recursive: true });
  for (const [relative, contents] of files) {
    const destination = path.join(entry.bundleRoot, relative);
    assertInside(entry.bundleRoot, destination, `bundle file ${entry.id}/${relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
}

function actualBundle(root) {
  const files = new Map();
  if (!fs.existsSync(root)) return files;
  for (const file of listSourceFiles(root)) {
    files.set(toPosix(path.relative(root, file)), fs.readFileSync(file));
  }
  return files;
}

function compareBundles(entry, expected) {
  const actual = actualBundle(entry.bundleRoot);
  const expectedNames = [...expected.keys()].sort();
  const actualNames = [...actual.keys()].sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
    fail(`${entry.id}: bundled file list differs from canonical source`);
    return false;
  }
  for (const name of expectedNames) {
    if (!expected.get(name).equals(actual.get(name))) {
      fail(`${entry.id}: bundled content differs at ${name}`);
      return false;
    }
  }
  return true;
}

function buildManifest(registry, entries, expectedById) {
  return {
    schema_version: 1,
    generated_by: "scripts/sync-skills.mjs",
    registry_version: registry.version,
    skill_count: entries.length,
    skills: entries.map((entry) => {
      const files = expectedById.get(entry.id);
      return {
        id: entry.id,
        source_path: toPosix(entry.path),
        file_count: files.size,
        source_sha256: sourceHash(entry),
        bundled_sha256: treeHash(files),
      };
    }),
  };
}

function main() {
  const { payload: registry, entries } = readRegistry();
  fs.mkdirSync(SKILLS_ROOT, { recursive: true });
  const expectedById = new Map(entries.map((entry) => [entry.id, expectedBundle(entry, entries)]));
  const expectedManifest = buildManifest(registry, entries, expectedById);
  const expectedManifestText = `${JSON.stringify(expectedManifest, null, 2)}\n`;

  if (CHECK_ONLY) {
    let valid = true;
    const expectedDirectories = new Set(entries.map((entry) => entry.id));
    const unexpected = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((item) => item.isDirectory() && !item.name.startsWith(".") && !expectedDirectories.has(item.name))
      .map((item) => item.name);
    if (unexpected.length > 0) {
      fail(`Unexpected skill directories: ${unexpected.join(", ")}`);
      valid = false;
    }
    for (const entry of entries) {
      valid = compareBundles(entry, expectedById.get(entry.id)) && valid;
    }
    const actualManifestText = fs.existsSync(MANIFEST_PATH) ? fs.readFileSync(MANIFEST_PATH, "utf8") : "";
    if (actualManifestText !== expectedManifestText) {
      fail("bundle-manifest.json is missing or stale");
      valid = false;
    }
    if (valid && process.exitCode !== 1) {
      console.log(`PASS: ${entries.length} plugin skills match config/skill-registry.json`);
    }
    return;
  }

  for (const entry of entries) {
    writeBundle(entry, expectedById.get(entry.id));
  }
  for (const item of fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith(".")) continue;
    if (!entries.some((entry) => entry.id === item.name)) {
      const stale = path.join(SKILLS_ROOT, item.name);
      assertInside(SKILLS_ROOT, stale, `stale skill ${item.name}`);
      fs.rmSync(stale, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(MANIFEST_PATH, expectedManifestText, "utf8");
  console.log(`Synced ${entries.length} skills into ${path.relative(REPOSITORY_ROOT, PLUGIN_ROOT)}`);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
