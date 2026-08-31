#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CI_SURFACES = Object.freeze(['ui', 'api', 'functional']);

const SPEC_PATTERN = /\.spec\.(?:[cm]?[jt]sx?)$/i;

function walkSpecs(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walkSpecs(target, output);
    else if (entry.isFile() && SPEC_PATTERN.test(entry.name)) output.push(target);
  }
  return output;
}

export function detectCiSurfaces(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const files = Object.fromEntries(CI_SURFACES.map(surface => [
    surface,
    walkSpecs(path.join(root, 'tests', surface))
      .map(file => path.relative(root, file).split(path.sep).join('/'))
      .sort(),
  ]));
  const surfaces = CI_SURFACES.filter(surface => files[surface].length > 0);
  return {
    projectRoot: root,
    surfaces,
    files,
    counts: Object.fromEntries(CI_SURFACES.map(surface => [surface, files[surface].length])),
  };
}

export function playwrightSurface(surfaces) {
  if (surfaces.length === 0) {
    throw new Error('CI_SURFACE_EMPTY: no tests/<surface>/**/*.spec.* files were found');
  }
  return surfaces.length === 1 ? surfaces[0] : 'all';
}

export function allureMode(surfaces) {
  return surfaces.length === 1 && surfaces[0] === 'api' ? 'api' : 'mixed';
}

export function expectedCiArtifacts(surfaces, runId) {
  const suffix = String(runId || '').trim();
  if (!suffix) throw new Error('CI_RUN_ID_REQUIRED: --run-id is required for artifact names');
  const artifacts = [];
  if (surfaces.includes('ui')) {
    artifacts.push(`qa-ui-chromium-${suffix}`, `qa-ui-firefox-${suffix}`);
  }
  if (surfaces.includes('functional')) {
    artifacts.push(`qa-functional-chromium-${suffix}`, `qa-functional-firefox-${suffix}`);
  }
  if (surfaces.includes('api')) artifacts.push(`qa-api-${suffix}`);
  return artifacts;
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  const inline = process.argv.find(value => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function writeGithubOutput(file, detection) {
  const rows = [
    ...CI_SURFACES.map(surface => `${surface}=${detection.surfaces.includes(surface)}`),
    `surfaces=${detection.surfaces.join(',')}`,
    `test_surface=${playwrightSurface(detection.surfaces)}`,
    `allure_mode=${allureMode(detection.surfaces)}`,
  ];
  fs.appendFileSync(path.resolve(file), `${rows.join('\n')}\n`, 'utf8');
}

function main() {
  const detection = detectCiSurfaces(arg('--project-root', '.'));
  if (process.argv.includes('--require')) playwrightSurface(detection.surfaces);
  const format = arg('--format', 'json');
  if (format === 'json') console.log(JSON.stringify(detection, null, 2));
  else if (format === 'csv') console.log(detection.surfaces.join(','));
  else if (format === 'test-surface') console.log(playwrightSurface(detection.surfaces));
  else if (format === 'allure-mode') console.log(allureMode(detection.surfaces));
  else if (format === 'artifacts') {
    for (const artifact of expectedCiArtifacts(detection.surfaces, arg('--run-id'))) console.log(artifact);
  } else {
    throw new Error(`Unknown --format ${format}. Expected json, csv, test-surface, allure-mode or artifacts`);
  }
  const githubOutput = arg('--github-output');
  if (githubOutput) writeGithubOutput(githubOutput, detection);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[ci-surfaces] ${error.message}`);
    process.exitCode = 1;
  }
}
