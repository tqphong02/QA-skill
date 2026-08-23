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

export function mergeAllureResults({ inputRoot = 'ci-artifacts', outputDir = 'reports/allure-results' } = {}) {
  const resolvedInput = path.resolve(inputRoot);
  const resolvedOutput = path.resolve(outputDir);
  assertSafeOutput(resolvedInput, resolvedOutput);
  const sourceDirectories = findAllureResultDirs(resolvedInput);
  if (sourceDirectories.length === 0) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      reason: 'No allure-results directory found under the CI artifact root',
      input_root: resolvedInput,
      output_dir: resolvedOutput,
      source_directories: [],
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
