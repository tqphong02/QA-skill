#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1] || fallback;
};

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

export function validateHostSmoke(result, expectedHost = 'antigravity', { baseDir = null } = {}) {
  const missing = [];
  if (!result || typeof result !== 'object') return { verdict: 'BLOCKED', missing: ['result'] };
  if (String(result.host || '').toLowerCase() !== expectedHost) missing.push(`host=${expectedHost}`);
  if (result.browser_driver !== 'antigravity-native') missing.push('browser_driver=antigravity-native');
  if (result.same_session !== true) missing.push('same_session=true');
  if (!Array.isArray(result.screenshot_paths) || result.screenshot_paths.length === 0) {
    missing.push('screenshot_paths');
  } else if (baseDir && !result.screenshot_paths.every(file => (
    typeof file === 'string'
    && file.trim()
    && fs.existsSync(path.resolve(baseDir, file))
  ))) {
    missing.push('screenshot_files_exist');
  }
  for (const field of ['network_observed', 'console_observed', 'page_errors_observed']) {
    if (result[field] !== true) missing.push(`${field}=true`);
  }
  if (result.verdict && result.verdict !== 'PASS') missing.push('verdict=PASS');
  return {
    schema_version: 1,
    artifact: 'host-smoke-validation',
    host: expectedHost,
    verdict: missing.length ? 'BLOCKED' : 'PASS',
    missing,
    limitation: 'This validates submitted same-session evidence; it does not launch Antigravity or claim a live run by itself',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = getArg('--result');
  if (!input) {
    console.error('[host-smoke] BLOCKED: --result <json> is required');
    process.exit(2);
  }
  const resultPath = path.resolve(input);
  const result = validateHostSmoke(readJson(resultPath), 'antigravity', {
    baseDir: path.dirname(resultPath),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict === 'PASS' ? 0 : 2);
}
