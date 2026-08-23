#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_EXTENSIONS = new Set(['ts', 'js', 'json', 'yml', 'yaml', 'md']);
const DEFAULT_FILES = ['Jenkinsfile', '.env.example'];
const PLACEHOLDER_RE = /<([A-Z][A-Z0-9_]+|[a-z][a-z0-9._@-]+)>/g;
const GENERIC_RE = /<([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:extends|=)|\s+[A-Za-z_]|\s*[,|])/;
const EXCLUDED_NAMES = new Set([
  'README.md',
  'PLACEHOLDERS.md',
  'TEMPLATE.md',
]);
const EXCLUDED_PARTS = new Set([
  '.git',
  'node_modules',
  'sessions',
  'runtime-data',
  'reports',
  'playwright-report',
  'test-results',
  'allure-results',
]);

function isExcluded(filePath) {
  const parts = filePath.split(path.sep);
  const basename = path.basename(filePath);
  return EXCLUDED_NAMES.has(basename)
    || parts.some(part => EXCLUDED_PARTS.has(part))
    || /^\.env(?:\..*)?$/.test(basename);
}

function walk(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function candidateFiles(root, explicitFiles = []) {
  if (explicitFiles.length > 0) {
    return explicitFiles.map(value => path.resolve(root, value));
  }
  const files = walk(root).filter(filePath => {
    if (isExcluded(filePath)) return false;
    const extension = path.extname(filePath).slice(1).toLowerCase();
    return DEFAULT_EXTENSIONS.has(extension) || DEFAULT_FILES.includes(path.basename(filePath));
  });
  for (const file of DEFAULT_FILES.map(value => path.join(root, value))) {
    if (fs.existsSync(file) && !files.includes(file) && !isExcluded(file)) files.push(file);
  }
  return files.sort();
}

function isCommentLine(line, extension) {
  const trimmed = line.trim();
  if (['ts', 'js', 'tsx', 'jsx'].includes(extension)) return /^(?:\/\/|\/\*|\*)/.test(trimmed);
  if (['yml', 'yaml'].includes(extension)) return trimmed.startsWith('#');
  if (extension === 'md') return trimmed.startsWith('<!--');
  return false;
}

function meaningfulMatches(line, extension) {
  if (isCommentLine(line, extension)) return [];
  const matches = [];
  for (const match of line.matchAll(PLACEHOLDER_RE)) {
    const token = match[0];
    const previous = line[match.index - 1] || '';
    if (GENERIC_RE.test(token) || /[A-Za-z0-9_$>]/.test(previous)) continue;
    matches.push(token);
  }
  return matches;
}

export function findPlaceholders({ root = process.cwd(), files = [] } = {}) {
  const resolvedRoot = path.resolve(root);
  const issues = [];
  for (const filePath of candidateFiles(resolvedRoot, files)) {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const extension = path.extname(filePath).slice(1).toLowerCase();
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const token of meaningfulMatches(line, extension)) {
        issues.push({ file: path.relative(resolvedRoot, filePath), line: index + 1, token });
      }
    });
  }
  return issues;
}

function main() {
  const root = process.cwd();
  const issues = findPlaceholders({ root, files: process.argv.slice(2) });
  if (issues.length === 0) {
    console.log('PASS: no unresolved placeholders found');
    return;
  }
  console.error(`BLOCKED: found ${issues.length} unresolved placeholder(s)`);
  for (const issue of issues) console.error(`  ${issue.file}:${issue.line} ${issue.token}`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[placeholder-check] BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
