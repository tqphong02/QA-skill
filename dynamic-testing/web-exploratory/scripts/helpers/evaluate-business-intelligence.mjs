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

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function textValues(value) {
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') {
    return [value.statement, value.oracle, value.name, value.label, value.action]
      .filter(Boolean)
      .flatMap(textValues);
  }
  return value === undefined || value === null ? [] : [String(value)];
}

function requirementValues(value) {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap(item => {
    if (typeof item === 'string') return [item];
    if (Array.isArray(item)) return item;
    return [item.match, item.expected, ...(item.aliases || [])].filter(Boolean);
  });
}

function evaluateField(field, predictedValue, expectedValue) {
  const predicted = [...new Set(textValues(predictedValue).map(String).filter(Boolean))];
  const expected = requirementValues(expectedValue).map(String).filter(Boolean);
  const matched = expected.filter(needle => {
    const target = normalize(needle);
    return predicted.some(candidate => normalize(candidate).includes(target));
  });
  const predictedMatches = predicted.filter(candidate => (
    expected.some(needle => normalize(candidate).includes(normalize(needle)))
  ));
  return {
    field,
    expected_count: expected.length,
    predicted_count: predicted.length,
    matched_count: matched.length,
    missing: expected.filter(item => !matched.includes(item)),
    precision: predicted.length ? predictedMatches.length / predicted.length : expected.length ? 0 : 1,
    recall: expected.length ? matched.length / expected.length : 1,
  };
}

export function evaluateBusinessIntelligence(brief, golden) {
  const context = brief?.business_context || {};
  const fields = golden?.required || golden?.fields || {};
  const fieldResults = Object.entries(fields).map(([field, expected]) => evaluateField(
    field,
    field === 'invariants' ? context.business_model?.invariants : context[field],
    expected,
  ));
  const forbidden = requirementValues(golden?.forbidden || []).filter(needle => (
    Object.values(context).flatMap(textValues).some(value => normalize(value).includes(normalize(needle)))
  ));
  const minRecall = Number(golden?.thresholds?.min_recall ?? 1);
  const minPrecision = Number(golden?.thresholds?.min_precision ?? 0);
  const missing = fieldResults.flatMap(result => result.missing.map(item => `${result.field}: ${item}`));
  const recall = fieldResults.length
    ? fieldResults.reduce((sum, result) => sum + result.recall, 0) / fieldResults.length
    : 1;
  const precision = fieldResults.length
    ? fieldResults.reduce((sum, result) => sum + result.precision, 0) / fieldResults.length
    : 1;
  const pass = brief?.status === 'READY'
    && !missing.length
    && !forbidden.length
    && recall >= minRecall
    && precision >= minPrecision;
  return {
    schema_version: 1,
    artifact: 'business-intelligence-evaluation',
    golden_id: golden?.id || golden?.name || 'unnamed-golden',
    brief_status: brief?.status || 'unknown',
    verdict: pass ? 'PASS' : 'FAILED',
    aggregate: { precision, recall, min_precision: minPrecision, min_recall: minRecall },
    fields: fieldResults,
    missing,
    forbidden,
    limitation: 'Deterministic substring matching measures retrieval/coverage; semantic correctness still requires reviewer and runtime evidence',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const briefPath = getArg('--brief');
  const goldenPath = getArg('--golden');
  if (!briefPath || !goldenPath) {
    console.error('[business-intelligence-eval] BLOCKED: --brief and --golden are required');
    process.exit(2);
  }
  const brief = readJson(path.resolve(briefPath));
  const golden = readJson(path.resolve(goldenPath));
  if (!brief || !golden) {
    console.error('[business-intelligence-eval] BLOCKED: invalid brief or golden dataset');
    process.exit(2);
  }
  const report = evaluateBusinessIntelligence(brief, golden);
  const output = getArg('--output', '');
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}
