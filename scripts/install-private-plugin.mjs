#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const PLUGIN_NAME = "qa-skill-suite";
const SOURCE_PLUGIN_ROOT = path.join(REPOSITORY_ROOT, "plugins", PLUGIN_NAME);
const REGISTRY_PATH = path.join(REPOSITORY_ROOT, "config", "skill-registry.json");
const SYNC_SCRIPT = path.join(SOURCE_PLUGIN_ROOT, "scripts", "sync-skills.mjs");
const SOURCE_MANIFEST = path.join(SOURCE_PLUGIN_ROOT, ".codex-plugin", "plugin.json");

const COPY_EXCLUDES = new Set([
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
  "evidence",
  "node_modules",
  "qa-knowledge",
]);

function printHelp() {
  console.log(`Usage:
  node <clone>/scripts/install-private-plugin.mjs [options]

Options:
  --cleanup-source       Delete the clean cloned repository after full verification
  --skip-deps            Skip npm and Python dependency installation
  --skip-standalone      Skip standalone skills used by the Codex IDE extension
  --skip-codex-install   Prepare the local plugin and marketplace without running codex plugin add
  --target-home <path>   Override the personal install root (mainly for isolated verification)
  --dry-run              Print planned actions without changing files
  --help                 Show this help

Recommended new-laptop flow (run from the parent directory, not inside the clone):
  node QA-skill/scripts/install-private-plugin.mjs --cleanup-source`);
}

function parseArguments(argv) {
  const options = {
    cleanupSource: false,
    dryRun: false,
    skipCodexInstall: false,
    skipDeps: false,
    skipStandalone: false,
    targetHome: os.homedir(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--cleanup-source") options.cleanupSource = true;
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--skip-codex-install") options.skipCodexInstall = true;
    else if (value === "--skip-deps") options.skipDeps = true;
    else if (value === "--skip-standalone") options.skipStandalone = true;
    else if (value === "--target-home") {
      index += 1;
      if (!argv[index]) throw new Error("--target-home requires a path");
      options.targetHome = path.resolve(argv[index]);
    } else if (value.startsWith("--target-home=")) {
      options.targetHome = path.resolve(value.slice("--target-home=".length));
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  if (options.cleanupSource && options.dryRun) {
    throw new Error("--cleanup-source cannot be combined with --dry-run");
  }
  if (options.cleanupSource && (options.skipCodexInstall || options.skipStandalone)) {
    throw new Error("Source cleanup requires both plugin installation and standalone IDE skills");
  }
  return options;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function commandText(command, args) {
  return [command, ...args].map((value) => (/\s/.test(value) ? JSON.stringify(value) : value)).join(" ");
}

function run(command, args, {
  capture = false,
  cwd = REPOSITORY_ROOT,
  dryRun = false,
  env = process.env,
} = {}) {
  console.log(`[run] ${commandText(command, args)}`);
  if (dryRun) return { status: 0, stdout: "", stderr: "" };

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${commandText(command, args)}`);
  }
  return result;
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertSafeChild(parent, candidate, label) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedParent === resolvedCandidate || !isInside(resolvedParent, resolvedCandidate)) {
    throw new Error(`Unsafe ${label}: ${resolvedCandidate}`);
  }
}

function safeRemove(parent, candidate) {
  assertSafeChild(parent, candidate, "remove target");
  if (fs.existsSync(candidate)) {
    fs.rmSync(candidate, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${filePath}: ${error.message}`);
  }
}

function validateSourceBundle(registry) {
  if (!fs.existsSync(SOURCE_MANIFEST)) throw new Error(`Missing plugin manifest: ${SOURCE_MANIFEST}`);
  if (!fs.existsSync(SYNC_SCRIPT)) throw new Error(`Missing plugin sync script: ${SYNC_SCRIPT}`);

  const manifest = readJson(SOURCE_MANIFEST, "plugin manifest");
  if (manifest.name !== PLUGIN_NAME) throw new Error(`Unexpected plugin name: ${manifest.name}`);

  const bundleManifestPath = path.join(SOURCE_PLUGIN_ROOT, "bundle-manifest.json");
  const bundle = readJson(bundleManifestPath, "bundle manifest");
  if (bundle.skill_count !== registry.skills.length) {
    throw new Error(`Plugin bundle has ${bundle.skill_count} skills; expected ${registry.skills.length}`);
  }
}

function findBash() {
  const candidates = [];
  if (process.env.QA_SKILL_BASH) candidates.push(process.env.QA_SKILL_BASH);
  if (process.platform === "win32") {
    candidates.push(
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "bash.exe"),
    );
  }
  candidates.push("bash");

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error("Bash was not found. Install Git for Windows, Git Bash, or bash first");
}

function toBashPath(filePath) {
  if (process.platform !== "win32") return filePath;
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  return match ? `/${match[1].toLowerCase()}/${match[2]}` : normalized;
}

function installStandaloneSkills(options) {
  if (options.skipStandalone) {
    console.log("[skip] Standalone IDE skills");
    return;
  }
  const args = [
    toBashPath(path.join(REPOSITORY_ROOT, "scripts", "setup.sh")),
    "--agent=codex",
    "--profile=full",
    "--skip-mcp-setup",
    "--yes",
  ];
  if (options.skipDeps) args.push("--skip-deps");
  if (options.dryRun) args.push("--dry-run");
  run(findBash(), args, { dryRun: false });
}

function copyPluginSource(source, destination) {
  fs.cpSync(source, destination, {
    filter(current) {
      if (current === source) return true;
      const relative = path.relative(source, current);
      return !relative.split(path.sep).some((segment) => COPY_EXCLUDES.has(segment));
    },
    recursive: true,
  });
}

function updateInstalledManifest(pluginRoot) {
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = readJson(manifestPath, "installed plugin manifest");
  const baseVersion = String(manifest.version || "1.0.0").split("+")[0];
  manifest.version = `${baseVersion}+codex.local-${timestamp()}`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest.version;
}

function npmInvocation() {
  if (process.platform !== "win32") return { args: [], command: "npm" };
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const cli = candidates.find((candidate) => fs.existsSync(candidate));
  if (cli) return { args: [cli], command: process.execPath };
  return { args: [], command: "npm" };
}

function quarantineNestedDependencySkills(skillRoot) {
  const dependencyRoot = path.join(skillRoot, "node_modules");
  if (!fs.existsSync(dependencyRoot)) return 0;
  let count = 0;

  function visit(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile() && item.name === "SKILL.md") {
        fs.renameSync(absolute, path.join(current, "SKILL.dependency-resource.md"));
        count += 1;
      }
    }
  }

  visit(dependencyRoot);
  return count;
}

function installPluginDependencies(pluginRoot, registry, options) {
  if (options.skipDeps) {
    console.log("[skip] Plugin npm dependencies");
    return;
  }

  for (const skill of registry.skills) {
    const skillRoot = path.join(pluginRoot, "skills", skill.id);
    if (!fs.existsSync(path.join(skillRoot, "package.json"))) continue;
    const npm = npmInvocation();
    const dependencyEnv = { ...process.env };
    if (process.platform === "win32") {
      const systemNodeRoot = path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs");
      dependencyEnv.PATH = `${systemNodeRoot}${path.delimiter}${process.env.PATH || ""}`;
    }
    dependencyEnv.npm_config_cache = path.join(options.targetHome, ".cache", "qa-skill-npm");
    run(npm.command, [...npm.args, "install", "--no-audit", "--no-fund", "--loglevel=error"], {
      cwd: skillRoot,
      dryRun: options.dryRun,
      env: dependencyEnv,
    });
    if (!options.dryRun) {
      const count = quarantineNestedDependencySkills(skillRoot);
      if (count > 0) console.log(`[ok] Quarantined ${count} dependency skill manifest(s) in ${skill.id}`);
    }
  }
}

function verifyInstalledPlugin(pluginRoot, registry) {
  const manifest = readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "installed plugin manifest");
  if (manifest.name !== PLUGIN_NAME) throw new Error("Installed plugin manifest name mismatch");

  let recursiveSkillManifests = 0;
  function countSkillManifests(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) countSkillManifests(absolute);
      else if (item.isFile() && item.name === "SKILL.md") recursiveSkillManifests += 1;
    }
  }

  for (const skill of registry.skills) {
    const skillManifest = path.join(pluginRoot, "skills", skill.id, "SKILL.md");
    if (!fs.existsSync(skillManifest)) throw new Error(`Missing installed skill: ${skill.id}`);
  }
  countSkillManifests(path.join(pluginRoot, "skills"));
  if (recursiveSkillManifests !== registry.skills.length) {
    throw new Error(`Found ${recursiveSkillManifests} public SKILL.md files; expected ${registry.skills.length}`);
  }
  return manifest.version;
}

function installPluginFiles(options, registry) {
  const pluginsRoot = path.join(options.targetHome, "plugins");
  const target = path.join(pluginsRoot, PLUGIN_NAME);
  const staging = path.join(pluginsRoot, `.${PLUGIN_NAME}.staging-${process.pid}-${timestamp()}`);
  const backup = path.join(
    options.targetHome,
    ".agents",
    "qa-skill-backups",
    timestamp(),
    "plugins",
    PLUGIN_NAME,
  );

  if (options.dryRun) {
    console.log(`[dry-run] Copy ${SOURCE_PLUGIN_ROOT} -> ${target}`);
    return { backup: null, target, version: "dry-run" };
  }

  fs.mkdirSync(pluginsRoot, { recursive: true });
  safeRemove(pluginsRoot, staging);
  let stagedVersion;
  try {
    copyPluginSource(SOURCE_PLUGIN_ROOT, staging);
    stagedVersion = updateInstalledManifest(staging);
    installPluginDependencies(staging, registry, options);
    verifyInstalledPlugin(staging, registry);
  } catch (error) {
    safeRemove(pluginsRoot, staging);
    throw error;
  }

  let backupPath = null;
  if (fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(target, backup);
    backupPath = backup;
  }
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(target)) {
      fs.renameSync(backupPath, target);
    }
    throw error;
  }
  const version = verifyInstalledPlugin(target, registry);
  if (version !== stagedVersion) throw new Error("Installed plugin version changed during copy");
  return { backup: backupPath, target, version };
}

function upsertPersonalMarketplace(options) {
  const marketplacePath = path.join(options.targetHome, ".agents", "plugins", "marketplace.json");
  if (options.dryRun) {
    console.log(`[dry-run] Register ${PLUGIN_NAME} in ${marketplacePath}`);
    return { marketplaceName: "personal", marketplacePath };
  }

  let marketplace;
  if (fs.existsSync(marketplacePath)) {
    marketplace = readJson(marketplacePath, "personal marketplace");
  } else {
    marketplace = { name: "personal", interface: { displayName: "Personal" }, plugins: [] };
  }

  if (!/^[A-Za-z0-9_-]+$/.test(marketplace.name || "")) {
    throw new Error(`Invalid marketplace name: ${marketplace.name}`);
  }
  if (!Array.isArray(marketplace.plugins)) throw new Error("marketplace.plugins must be an array");
  if (!marketplace.interface || typeof marketplace.interface !== "object") {
    marketplace.interface = { displayName: "Personal" };
  }

  const entry = {
    name: PLUGIN_NAME,
    source: { source: "local", path: `./plugins/${PLUGIN_NAME}` },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Developer Tools",
  };
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin?.name === PLUGIN_NAME);
  if (existingIndex >= 0) marketplace.plugins[existingIndex] = entry;
  else marketplace.plugins.push(entry);

  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  const temporary = `${marketplacePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, marketplacePath);
  return { marketplaceName: marketplace.name, marketplacePath };
}

function findCodexExecutable(targetHome) {
  const candidates = [];
  if (process.env.QA_SKILL_CODEX_CLI) candidates.push(process.env.QA_SKILL_CODEX_CLI);

  if (process.platform === "win32") {
    const extensionsRoot = path.join(targetHome, ".vscode", "extensions");
    if (fs.existsSync(extensionsRoot)) {
      const extensionCandidates = fs.readdirSync(extensionsRoot, { withFileTypes: true })
        .filter((item) => item.isDirectory() && item.name.startsWith("openai.chatgpt-"))
        .map((item) => path.join(extensionsRoot, item.name, "bin", "windows-x86_64", "codex.exe"))
        .filter((candidate) => fs.existsSync(candidate))
        .sort()
        .reverse();
      candidates.push(...extensionCandidates);
    }
  } else {
    candidates.push("codex");
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["plugin", "--help"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error(
    "Codex CLI with plugin support was not found. Install/update Codex CLI, or set QA_SKILL_CODEX_CLI to the Codex executable",
  );
}

function installWithCodex(options, marketplaceName) {
  if (options.skipCodexInstall) {
    console.log("[skip] codex plugin add");
    return null;
  }
  const codex = findCodexExecutable(options.targetHome);
  const qualifiedName = `${PLUGIN_NAME}@${marketplaceName}`;
  run(codex, ["plugin", "add", qualifiedName], { capture: true });
  const listing = run(codex, ["plugin", "list"], { capture: true });
  const combined = `${listing.stdout || ""}\n${listing.stderr || ""}`;
  const installedLine = combined.split(/\r?\n/).find((line) => line.includes(qualifiedName));
  if (!installedLine || !/\binstalled\b/i.test(installedLine)) {
    throw new Error(`Codex did not report ${qualifiedName} as installed`);
  }
  return codex;
}

function verifyStandaloneSkills(options, registry) {
  if (options.skipStandalone || options.dryRun) return;
  const skillsRoot = path.join(options.targetHome, ".agents", "skills");
  for (const skill of registry.skills) {
    if (!fs.existsSync(path.join(skillsRoot, skill.id, "SKILL.md"))) {
      throw new Error(`Standalone IDE skill was not installed: ${skill.id}`);
    }
  }
}

function captureGit(args) {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Git verification failed: git ${args.join(" ")}`);
  }
  return result.stdout.trim();
}

function validateCleanupPreconditions(options) {
  if (!options.cleanupSource) return;
  const repository = fs.realpathSync(REPOSITORY_ROOT);
  const currentDirectory = fs.realpathSync(process.cwd());
  const targetHome = path.resolve(options.targetHome);
  const filesystemRoot = path.parse(repository).root;

  if (repository === filesystemRoot || repository === fs.realpathSync(os.homedir())) {
    throw new Error(`Refusing to delete broad path: ${repository}`);
  }
  if (isInside(repository, currentDirectory)) {
    throw new Error(
      `Run the cleanup command from the clone's parent directory, not from inside ${repository}`,
    );
  }
  if (isInside(repository, targetHome)) {
    throw new Error("The plugin target must not be inside the cloned repository");
  }
  const topLevel = path.resolve(captureGit(["rev-parse", "--show-toplevel"]));
  if (topLevel.toLowerCase() !== repository.toLowerCase()) {
    throw new Error(`Git top-level mismatch: ${topLevel}`);
  }
  const dirty = captureGit(["status", "--porcelain", "--untracked-files=all", "--ignored"]);
  if (dirty) {
    throw new Error("The clone contains modified, untracked, or ignored files; source cleanup was refused");
  }
}

function cleanupSource(options) {
  if (!options.cleanupSource) return false;
  validateCleanupPreconditions(options);
  const parent = path.dirname(REPOSITORY_ROOT);
  assertSafeChild(parent, REPOSITORY_ROOT, "repository cleanup target");
  process.chdir(options.targetHome);
  safeRemove(parent, REPOSITORY_ROOT);
  return true;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const registry = readJson(REGISTRY_PATH, "skill registry");
  if (!Array.isArray(registry.skills) || registry.skills.length !== 23) {
    throw new Error(`Expected 23 canonical skills, found ${registry.skills?.length ?? 0}`);
  }

  validateCleanupPreconditions(options);
  validateSourceBundle(registry);
  run(process.execPath, [SYNC_SCRIPT, "--check"], { dryRun: options.dryRun });
  installStandaloneSkills(options);
  const installed = installPluginFiles(options, registry);
  const marketplace = upsertPersonalMarketplace(options);
  installWithCodex(options, marketplace.marketplaceName);
  verifyStandaloneSkills(options, registry);

  if (!options.dryRun) {
    const version = verifyInstalledPlugin(installed.target, registry);
    console.log(`[ok] Private plugin installed: ${PLUGIN_NAME}@${marketplace.marketplaceName}`);
    console.log(`[ok] Version: ${version}`);
    console.log(`[ok] Plugin path: ${installed.target}`);
    console.log(`[ok] Marketplace: ${marketplace.marketplacePath}`);
    if (installed.backup) console.log(`[ok] Previous plugin backup: ${installed.backup}`);
  }

  const removed = cleanupSource(options);
  if (removed) console.log(`[ok] Clean cloned repository removed: ${REPOSITORY_ROOT}`);
  else if (!options.dryRun) console.log(`[info] Clone kept: ${REPOSITORY_ROOT}`);
  console.log("[done] Start a new Codex CLI/Desktop session; IDE uses the standalone global skills");
}

try {
  main();
} catch (error) {
  console.error(`[failed] ${error instanceof Error ? error.message : String(error)}`);
  console.error("The cloned repository was kept so the installation can be diagnosed or retried");
  process.exitCode = 1;
}
