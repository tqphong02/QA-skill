#!/usr/bin/env node

/** Merge same-session selector evidence from one module's Playwright attachments. */

import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('-attachment.json')) output.push(full);
  }
  return output;
}

function testcaseIdFromAttachmentPath(filePath) {
  const parts = filePath.split(path.sep);
  const allureIndex = parts.lastIndexOf('allure-results');
  if (allureIndex <= 0) return null;
  const candidate = parts[allureIndex - 1];
  return candidate && !/^slot-\d+$/i.test(candidate) ? candidate : null;
}

function eligible(record) {
  const verification = record?.verification ?? {};
  const candidate = (record?.candidates ?? []).find(item => item.strategy === record.strategy && item.available)
    ?? (record?.candidates ?? []).find(item => item.available);
  return record?.status === 'runtime_verified'
    && Boolean(record.target_key)
    && verification.count === 1
    && (verification.visible === true || verification.actionable === true)
    && candidate?.value !== null
    && candidate?.value !== undefined;
}

function normalizeRecord(record) {
  if (!record?.locator || !Array.isArray(record.candidates)) return record;
  return {
    ...record,
    candidates: record.candidates.map(candidate => candidate?.available === true
      && candidate.strategy === record.strategy
      && (candidate.value === null || candidate.value === undefined)
      ? { ...candidate, value: record.locator }
      : candidate),
  };
}

function evidenceKey(record) {
  return `${String(record.testcase_id || 'legacy')}::${String(record.target_key || '')}`;
}

function main() {
  const projectRoot = path.resolve(arg('--project-root', process.cwd()));
  const feature = arg('--feature');
  if (!feature) throw new Error('BLOCKED: --feature is required');
  const inputRoot = path.resolve(arg('--input-root', path.join(projectRoot, 'reports', 'module-runs', feature)));
  const evidencePath = path.resolve(arg('--evidence-file', path.join(projectRoot, 'selector-evidence', `${feature}.json`)));
  const replace = process.argv.includes('--replace');
  const records = [];
  for (const filePath of walk(inputRoot)) {
    const artifact = readJson(filePath);
    const artifactRecords = Array.isArray(artifact) ? artifact : artifact?.targets ?? [];
    const inferredTestcaseId = testcaseIdFromAttachmentPath(filePath);
    for (const rawRecord of artifactRecords) {
      const contextualRecord = rawRecord?.testcase_id || !inferredTestcaseId
        ? rawRecord
        : { ...rawRecord, testcase_id: inferredTestcaseId };
      const record = normalizeRecord(contextualRecord);
      if (eligible(record)) records.push(record);
    }
  }
  const existing = readJson(evidencePath) ?? { schema_version: 1, feature, targets: [] };
  const byKey = new Map((replace ? [] : (existing.targets ?? []))
    .filter(item => item?.target_key)
    .map(item => [evidenceKey(item), item]));
  for (const record of records) byKey.set(evidenceKey(record), record);
  const merged = {
    ...existing,
    schema_version: 1,
    feature: existing.feature ?? feature,
    captured_at: records.at(-1)?.captured_at ?? existing.captured_at,
    run_id: records.at(-1)?.run_id ?? existing.run_id,
    app_build: records.at(-1)?.app_build ?? existing.app_build,
    targets: [...byKey.values()].sort((a, b) => String(a.target_key).localeCompare(String(b.target_key))),
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'PASS', feature, input_root: inputRoot, eligible_records: records.length, evidence: evidencePath }, null, 2));
}

try { main(); } catch (error) {
  console.error(`[promote-runtime-evidence] ${error.message}`);
  process.exitCode = 2;
}
