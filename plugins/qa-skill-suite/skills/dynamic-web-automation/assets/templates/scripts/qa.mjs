#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireExecutionLock } from './execution-lock.mjs';

const SURFACE_TAGS = Object.freeze({
  ui: '@ui',
  api: '@api',
  functional: '@functional',
  all: null,
});

const ALLURE_MODES = new Set(['ui', 'api', 'functional', 'mixed']);

const GENERATED_PATHS = Object.freeze([
  'reports',
  'evidence',
  'sessions',
  'runtime-data',
  'playwright-report',
  'test-results',
  'ci-artifacts',
  'node_modules/.cache',
]);

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function optionValue(args, name, fallback = '') {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0 && args[exactIndex + 1] && !args[exactIndex + 1].startsWith('--')) {
    return args[exactIndex + 1];
  }
  const prefix = `${name}=`;
  const inline = args.find(argument => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.push(args[index + 1]);
      index += 1;
    } else if (argument.startsWith(`${name}=`)) {
      values.push(argument.slice(name.length + 1));
    }
  }
  return values.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
}

function removeOption(args, name) {
  const remaining = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === name) {
      if (args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
      continue;
    }
    if (argument.startsWith(`${name}=`)) continue;
    if (argument === '--') continue;
    remaining.push(argument);
  }
  return remaining;
}

function hasOption(args, name) {
  return args.some(argument => argument === name || argument.startsWith(`${name}=`));
}

function normalizedSurface(surface) {
  const value = String(surface || 'all').toLowerCase();
  if (!Object.hasOwn(SURFACE_TAGS, value)) {
    throw new Error(`Unknown test surface: ${surface}. Expected ui, api, functional or all`);
  }
  return value;
}

function normalizedAllureMode(mode) {
  const value = String(mode || 'mixed').toLowerCase();
  if (!ALLURE_MODES.has(value)) {
    throw new Error(`Unknown Allure mode: ${mode}. Expected ui, api, functional or mixed`);
  }
  return value;
}

export function buildPlaywrightArgs(surface = 'all', extraArgs = []) {
  const selectedSurface = normalizedSurface(surface);
  const args = ['--no-install', 'playwright', 'test'];
  const forwarded = [...extraArgs].filter(argument => argument !== '--');
  const tag = SURFACE_TAGS[selectedSurface];
  if (tag && !hasOption(forwarded, '--grep')) {
    args.push('--grep', tag);
  }
  return [...args, ...forwarded];
}

export function parseTestArgs(args = []) {
  const surface = normalizedSurface(optionValue(args, '--surface', 'all'));
  return {
    surface,
    extraArgs: removeOption(args, '--surface'),
  };
}

function run(command, args, {
  cwd = process.cwd(),
  env = process.env,
  label = `${command} ${args.join(' ')}`,
} = {}) {
  console.log(`[qa] ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[qa] ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function qaEnvironment() {
  const runId = process.env.QA_RUN_ID || process.env.RUN_ID || `local-${Date.now()}-${process.pid}`;
  return {
    ...process.env,
    QA_UNIFIED_EVIDENCE: process.env.QA_UNIFIED_EVIDENCE || 'true',
    QA_RUN_ID: runId,
    RUN_ID: runId,
  };
}

function runPlaywright(surface, extraArgs, env = qaEnvironment()) {
  return run(NPX, buildPlaywrightArgs(surface, extraArgs), {
    env,
    label: `playwright ${surface}`,
  });
}

function withPlaywrightLock(surface, operation) {
  const env = qaEnvironment();
  const lock = acquireExecutionLock(process.cwd(), {
    runId: env.RUN_ID,
    operation: `qa:${surface}`,
  });
  try {
    return operation(env);
  } finally {
    lock.release();
  }
}

function runNodeScript(script, args = [], label = script) {
  return run(process.execPath, [script, ...args], { label });
}

function runContract(mode = 'mixed', extraArgs = []) {
  const selectedMode = normalizedAllureMode(mode);
  const resultDir = optionValue(extraArgs, '--results-dir', 'reports/allure-results');
  const outputPath = optionValue(extraArgs, '--output', 'reports/allure-contract.json');
  let forwarded = removeOption(extraArgs, '--mode');
  forwarded = removeOption(forwarded, '--results-dir');
  forwarded = removeOption(forwarded, '--output');
  return runNodeScript('scripts/verify-allure-contract.mjs', [
    '--results-dir', resultDir,
    '--mode', selectedMode,
    '--output', outputPath,
    ...forwarded,
  ], `Allure contract (${selectedMode})`);
}

function runQualityGate(extraArgs = []) {
  const configPath = optionValue(extraArgs, '--config', 'quality-gates.json');
  const reportPath = optionValue(extraArgs, '--report', 'reports/playwright.json');
  const outputPath = optionValue(extraArgs, '--output', 'reports/quality-gate.json');
  const surface = normalizedSurface(optionValue(extraArgs, '--surface', 'all'));
  const projects = optionValues(extraArgs, '--project');
  if (!fs.existsSync(path.resolve(reportPath))) {
    console.warn(`[qa] ${reportPath} not found; quality gate is BLOCKED`);
    return 2;
  }
  const qualityArgs = [
    '--config', configPath,
    '--report', reportPath,
    '--output', outputPath,
    '--surface', surface,
  ];
  for (const project of projects) qualityArgs.push('--project', project);
  return runNodeScript('scripts/quality-gate.mjs', qualityArgs, `quality gate (${surface})`);
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return !relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function parseReportArgs(extraArgs = []) {
  if (hasOption(extraArgs, '--output')) {
    throw new Error('qa report does not accept ambiguous --output; use --contract-output and --report-output');
  }
  if (hasOption(extraArgs, '--no-media')) {
    throw new Error('--no-media is forbidden by the canonical Allure contract');
  }
  const mode = normalizedAllureMode(optionValue(extraArgs, '--mode', 'mixed'));
  const resultsDir = optionValue(extraArgs, '--results-dir', 'reports/allure-results');
  const contractOutput = optionValue(extraArgs, '--contract-output', 'reports/allure-contract.json');
  const reportOutput = optionValue(extraArgs, '--report-output', 'reports/allure-report');
  if (isWithin(reportOutput, contractOutput)) {
    throw new Error('--contract-output must be outside --report-output because report generation cleans its output directory');
  }
  if (isWithin(resultsDir, contractOutput)) {
    throw new Error('--contract-output must be outside the raw --results-dir');
  }
  if (isWithin(resultsDir, reportOutput) || isWithin(reportOutput, resultsDir)) {
    throw new Error('--results-dir and --report-output must be separate directories');
  }
  return { mode, resultsDir, contractOutput, reportOutput };
}

function runReport(extraArgs = []) {
  const parsed = parseReportArgs(extraArgs);
  const contractCode = runContract(parsed.mode, [
    '--results-dir', parsed.resultsDir,
    '--output', parsed.contractOutput,
  ]);
  if (contractCode !== 0) return contractCode;
  return run(NPX, [
    '--no-install', 'allure', 'generate', parsed.resultsDir, '-o', parsed.reportOutput, '--clean',
  ], { label: 'Allure report' });
}

function runAllureCommand(command, args) {
  return run(NPX, ['--no-install', 'allure', command, ...args], {
    label: `Allure ${command}`,
  });
}

function isPreservedGeneratedFile(name) {
  return name === '.gitkeep' || /^README(?:\.[^/\\]+)?$/i.test(name);
}

function cleanDirectory(directory) {
  let changed = false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isFile() && isPreservedGeneratedFile(entry.name)) continue;
    if (entry.isDirectory()) {
      changed = cleanDirectory(target) || changed;
      if (fs.readdirSync(target).length === 0) {
        fs.rmdirSync(target);
        changed = true;
      }
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    changed = true;
  }
  return changed;
}

export function cleanGeneratedPaths(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const removed = [];
  for (const relativePath of GENERATED_PATHS) {
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Refusing to clean path outside the project root: ${target}`);
    }
    if (fs.existsSync(target)) {
      const stats = fs.lstatSync(target);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(relativePath);
        continue;
      }
      const changed = cleanDirectory(target);
      if (fs.readdirSync(target).length === 0) {
        fs.rmdirSync(target);
        removed.push(relativePath);
      } else if (changed) {
        removed.push(relativePath);
      }
    }
  }
  console.log(JSON.stringify({ status: 'PASS', command: 'clean', removed }, null, 2));
  return 0;
}

function installBrowsers(args) {
  const browserValue = optionValue(args, '--browser', 'chromium');
  const browsers = browserValue.split(',').map(value => value.trim()).filter(Boolean);
  if (browsers.length === 0) throw new Error('--browser must contain at least one browser');
  const installArgs = ['--no-install', 'playwright', 'install'];
  if (hasOption(args, '--with-deps')) installArgs.push('--with-deps');
  return run(NPX, [...installArgs, ...browsers], { label: `Playwright browsers (${browsers.join(', ')})` });
}

function printHelp() {
  console.log(`Usage: node scripts/qa.mjs <command> [options]

Commands:
  lint                         TypeScript + ESLint
  test --surface <surface>     Run ui, api, functional or all
  contract [--mode <mode>]     Validate the canonical Allure result shape
  report [--mode <mode>]       Validate and generate the Allure report
  html                         Open the Playwright HTML report
  install-browsers              Install project-local Playwright browsers
  quality [--surface <name>]   Evaluate reports/playwright.json for the selected surface/projects
  clean                        Remove only known generated output folders
  ci --surface <surface>       Run tests, quality gate, contract and report
`);
}

export function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...rawArgs] = argv;
  const args = rawArgs.filter(argument => argument !== '--');

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }
  if (command === 'lint') {
    const typesCode = run(NPX, ['--no-install', 'tsc', '--noEmit'], { label: 'TypeScript' });
    if (typesCode !== 0) return typesCode;
    return run(NPX, ['--no-install', 'eslint', '.', '--ext', '.ts'], { label: 'ESLint' });
  }
  if (command === 'test') {
    const parsed = parseTestArgs(args);
    return withPlaywrightLock(
      parsed.surface,
      env => runPlaywright(parsed.surface, parsed.extraArgs, env),
    );
  }
  if (command === 'contract') {
    return runContract(optionValue(args, '--mode', 'mixed'), args);
  }
  if (command === 'report') return runReport(args);
  if (command === 'html') return run(NPX, ['--no-install', 'playwright', 'show-report', 'evidence/html'], { label: 'Playwright HTML report' });
  if (command === 'install-browsers') return installBrowsers(args);
  if (command === 'quality') return runQualityGate(args);
  if (command === 'clean') return cleanGeneratedPaths();
  if (command === 'open-allure') return runAllureCommand('open', [optionValue(args, '--report', 'reports/allure-report')]);
  if (command === 'serve-allure') return runAllureCommand('serve', ['reports/allure-results']);
  if (command === 'ci') {
    const parsed = parseTestArgs(args);
    return withPlaywrightLock(parsed.surface, env => {
      const testCode = runPlaywright(parsed.surface, parsed.extraArgs, env);
      const projectArgs = optionValues(parsed.extraArgs, '--project')
        .flatMap(project => ['--project', project]);
      const qualityCode = runQualityGate(['--surface', parsed.surface, ...projectArgs]);
      const reportCode = runReport(['--mode', parsed.surface === 'api' ? 'api' : 'mixed']);
      return testCode || qualityCode || reportCode;
    });
  }

  console.error(`[qa] Unknown command: ${command}`);
  printHelp();
  return 2;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`[qa] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
