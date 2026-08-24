#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function getArg(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find(value => value.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
}

function getArgs(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flag && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.push(args[index + 1]);
      index += 1;
    } else if (value.startsWith(`${flag}=`)) {
      values.push(value.slice(flag.length + 1));
    }
  }
  return values.map(value => value.trim()).filter(Boolean);
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walkFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files.sort();
}

export function findAllureResultDirs(inputRoot) {
  const resolvedRoot = path.resolve(inputRoot);
  const directories = [];
  function visit(current) {
    if (!fs.existsSync(current)) return;
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) return;
    if (path.basename(current) === 'allure-results') {
      directories.push(current);
      return;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(current, entry.name));
    }
  }
  visit(resolvedRoot);
  return directories.sort();
}

function assertSafeOutput(inputRoot, outputDir) {
  const relative = path.relative(inputRoot, outputDir);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error(`Output directory must be outside the input artifact root: ${outputDir}`);
  }
}

function safeExpectedArtifact(inputRoot, name) {
  const directory = path.resolve(inputRoot, name);
  const relative = path.relative(inputRoot, directory);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Expected artifact must be a child of the input artifact root: ${name}`);
  }
  return directory;
}

export function mergeAllureResults({
  inputRoot = 'ci-artifacts',
  outputDir = 'reports/allure-results',
  expectedArtifacts = [],
} = {}) {
  const resolvedInput = path.resolve(inputRoot);
  const resolvedOutput = path.resolve(outputDir);
  assertSafeOutput(resolvedInput, resolvedOutput);
  const sourceDirectories = findAllureResultDirs(resolvedInput);
  const expected = [...new Set(expectedArtifacts.map(value => String(value).trim()).filter(Boolean))];
  const missingArtifacts = [];
  const artifactsWithoutResults = [];
  for (const artifact of expected) {
    const artifactDirectory = safeExpectedArtifact(resolvedInput, artifact);
    if (!fs.existsSync(artifactDirectory) || !fs.statSync(artifactDirectory).isDirectory()) {
      missingArtifacts.push(artifact);
    } else if (findAllureResultDirs(artifactDirectory).length === 0) {
      artifactsWithoutResults.push(artifact);
    }
  }
  const emptyResultDirectories = sourceDirectories.filter(directory => (
    !walkFiles(directory).some(file => /-result\.json$/i.test(path.basename(file)))
  ));
  if (sourceDirectories.length === 0
    || missingArtifacts.length > 0
    || artifactsWithoutResults.length > 0
    || emptyResultDirectories.length > 0) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      reason: sourceDirectories.length === 0
        ? 'No allure-results directory found under the CI artifact root'
        : 'One or more expected CI artifacts have no canonical Allure result',
      input_root: resolvedInput,
      output_dir: resolvedOutput,
      expected_artifacts: expected,
      missing_artifacts: missingArtifacts,
      artifacts_without_results: artifactsWithoutResults,
      empty_result_directories: emptyResultDirectories,
      source_directories: sourceDirectories,
      copied_files: 0,
      deduplicated_files: 0,
      conflicts: [],
    };
  }

  const planned = new Map();
  const conflicts = [];
  for (const sourceDirectory of sourceDirectories) {
    for (const source of walkFiles(sourceDirectory)) {
      const relative = path.relative(sourceDirectory, source);
      const destination = path.resolve(resolvedOutput, relative);
      const digest = hashFile(source);
      const existing = planned.get(relative);
      if (existing && existing.digest !== digest) {
        conflicts.push({ relative, first: existing.source, second: source });
      } else if (!existing) {
        planned.set(relative, { source, digest });
      }
      if (!destination.startsWith(`${resolvedOutput}${path.sep}`)) {
        throw new Error(`Refusing to copy an artifact outside the output directory: ${destination}`);
      }
    }
  }
  if (conflicts.length > 0) {
    throw new Error(`ALLURE_RESULT_COLLISION: ${JSON.stringify(conflicts)}`);
  }

  fs.rmSync(resolvedOutput, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutput, { recursive: true });
  let copiedFiles = 0;
  let deduplicatedFiles = 0;
  for (const [relative, item] of planned.entries()) {
    const destination = path.join(resolvedOutput, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(item.source, destination);
    copiedFiles += 1;
  }
  const totalSourceFiles = sourceDirectories.reduce((total, directory) => total + walkFiles(directory).length, 0);
  deduplicatedFiles = totalSourceFiles - copiedFiles;
  return {
    schema_version: 1,
    status: 'PASS',
    input_root: resolvedInput,
    output_dir: resolvedOutput,
    expected_artifacts: expected,
    missing_artifacts: [],
    artifacts_without_results: [],
    empty_result_directories: [],
    source_directories: sourceDirectories,
    copied_files: copiedFiles,
    deduplicated_files: deduplicatedFiles,
    conflicts: [],
  };
}

function main() {
  const args = process.argv.slice(2);
  const result = mergeAllureResults({
    inputRoot: getArg(args, '--input', 'ci-artifacts'),
    outputDir: getArg(args, '--output', 'reports/allure-results'),
    expectedArtifacts: getArgs(args, '--expect-artifact'),
  });
  const summaryPath = path.resolve(getArg(args, '--summary', 'reports/allure-merge.json'));
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[allure-merge] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
