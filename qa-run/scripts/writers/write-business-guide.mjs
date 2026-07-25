#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ICON_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;
const REQUIRED_HEADINGS = [
  '# Business Flow Guide',
  '## Metadata',
  '## Sources and confidence',
  '## Roles and permissions',
  '## Entry points',
  '## Happy business flow',
  '## Business rules',
  '## States and transitions',
  '## Inputs and validation',
  '## Side effects and integrations',
  '## API and network contracts',
  '## UI and UX behavior',
  '## Known issues',
  '## Reusable test assets',
  '## Unresolved questions',
  '## Latest QA run',
];
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'access_token', 'refresh_token', 'api_key', 'apikey',
  'client_secret', 'cookie', 'authorization', 'secret',
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function clean(value, field = 'content') {
  const text = String(value ?? '').trim();
  if (ICON_RE.test(text)) fail(`${field} must not contain emoji or icons`);
  return text.split('\n').map(line => line.trimEnd().replace(/\.+$/, '')).join('\n');
}

function isPlaceholder(value) {
  const text = String(value ?? '').trim();
  return !text || /^<[^<>]+>$/.test(text) || /^\[?redacted\]?$/i.test(text);
}

function rejectSecrets(value, pathLabel = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecrets(item, `${pathLabel}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const currentPath = `${pathLabel}.${key}`;
    if (SENSITIVE_KEYS.has(key.toLowerCase()) && !isPlaceholder(item)) {
      fail(`${currentPath} must not contain a real credential`);
    }
    rejectSecrets(item, currentPath);
  }
}

function slugify(value) {
  return String(value || 'feature')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
}

function label(key) {
  return key.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
}

function scalar(value, field) {
  if (Array.isArray(value)) return value.map(item => clean(item, field)).join(', ');
  if (value && typeof value === 'object') return clean(JSON.stringify(value), field);
  return clean(value, field);
}

function renderItems(title, items) {
  const lines = [`## ${title}`, ''];
  if (!Array.isArray(items) || !items.length) return [...lines, '- Không có dữ liệu đã xác nhận', ''];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      lines.push(`- ${clean(item, title)}`);
      continue;
    }
    const primaryKeys = ['title', 'name', 'role', 'route', 'rule', 'state', 'input', 'integration', 'endpoint', 'behavior', 'issue', 'asset', 'question', 'action'];
    const primaryKey = primaryKeys.find(key => item[key] !== undefined);
    const primary = primaryKey ? scalar(item[primaryKey], `${title}.${primaryKey}`) : 'Chi tiết';
    lines.push(`- ${primary}`);
    for (const [key, value] of Object.entries(item)) {
      if (key === primaryKey || value === undefined || value === null || value === '') continue;
      lines.push(`  - ${label(key)}: ${scalar(value, `${title}.${key}`)}`);
    }
  }
  lines.push('');
  return lines;
}

function renderFlow(steps) {
  const lines = ['## Happy business flow', ''];
  if (!Array.isArray(steps) || !steps.length) return [...lines, '- Không có flow đã xác nhận', ''];
  steps.forEach((step, index) => {
    const action = typeof step === 'object' && step !== null ? step.action : step;
    lines.push(`### Step ${index + 1} — ${clean(action, `happy_flow[${index}].action`)}`);
    if (typeof step === 'object' && step !== null) {
      for (const key of ['status', 'role', 'precondition', 'expected', 'observed', 'evidence', 'source']) {
        if (step[key] !== undefined && step[key] !== '') {
          lines.push(`- **${label(key)}:** ${scalar(step[key], `happy_flow[${index}].${key}`)}`);
        }
      }
    }
    lines.push('');
  });
  return lines;
}

function renderGuide(data) {
  const verdict = String(data.latest_run?.verdict || '').toUpperCase();
  if (!['PASS', 'FAILED', 'BLOCKED', 'PARTIAL'].includes(verdict)) {
    fail('latest_run.verdict must be PASS, FAILED, BLOCKED or PARTIAL');
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(data.last_verified || ''))) {
    fail('last_verified must start with YYYY-MM-DD');
  }
  const guideKind = String(data.guide_kind || 'feature').toLowerCase();
  if (!['app', 'feature'].includes(guideKind)) fail('guide_kind must be app or feature');
  if (guideKind === 'app' && (!Array.isArray(data.coverage_map) || !data.coverage_map.length)) {
    fail('app guide requires a non-empty coverage_map');
  }
  const lines = [
    `# Business Flow Guide — ${clean(data.feature, 'feature')}`,
    '',
    '## Metadata',
    '',
    `- **Project:** ${clean(data.project, 'project')}`,
    `- **Feature:** ${clean(data.feature, 'feature')}`,
    `- **Guide kind:** ${guideKind}`,
    `- **Environment:** ${clean(data.environment, 'environment')}`,
    `- **Base URL:** ${clean(data.base_url || 'N/A', 'base_url')}`,
    `- **Last verified:** ${clean(data.last_verified, 'last_verified')}`,
    `- **Confidence:** ${clean(data.confidence || 'mixed', 'confidence')}`,
    '',
    ...renderItems('Sources and confidence', data.source_refs),
    ...(Array.isArray(data.coverage_map) && data.coverage_map.length
      ? renderItems('Module coverage map', data.coverage_map)
      : []),
    ...renderItems('Roles and permissions', data.roles),
    ...renderItems('Entry points', data.entry_points),
    ...renderFlow(data.happy_flow),
    ...renderItems('Business rules', data.business_rules),
    ...renderItems('States and transitions', data.states),
    ...renderItems('Inputs and validation', data.inputs),
    ...renderItems('Side effects and integrations', [
      ...(data.side_effects || []), ...(data.integrations || []),
    ]),
    ...renderItems('API and network contracts', data.api_network),
    ...renderItems('UI and UX behavior', data.ui_ux),
    ...renderItems('Known issues', data.known_issues),
    ...renderItems('Reusable test assets', data.reusable_assets),
    ...renderItems('Unresolved questions', data.unresolved),
    '## Latest QA run',
    '',
    `- **Scope:** ${clean(data.latest_run.scope || 'N/A', 'latest_run.scope')}`,
    `- **Verdict:** ${verdict}`,
  ];
  for (const note of data.latest_run.notes || []) lines.push(`- ${clean(note, 'latest_run.notes')}`);
  lines.push('');
  return lines.join('\n');
}

function validateGuide(markdown) {
  const failures = [];
  for (const heading of REQUIRED_HEADINGS) {
    if (!markdown.includes(heading)) failures.push(`missing heading: ${heading}`);
  }
  if (ICON_RE.test(markdown)) failures.push('guide contains emoji or icons');
  if (/Bearer\s+(?!<)[A-Za-z0-9._-]{8,}/i.test(markdown)) failures.push('guide may contain a real bearer token');
  return failures;
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  if (!args[1]) fail('Usage: write-business-guide.mjs --check <guide.md>');
  const markdown = fs.readFileSync(path.resolve(args[1]), 'utf8');
  const failures = validateGuide(markdown);
  if (failures.length) fail(`BUSINESS GUIDE INVALID\n${failures.map(item => `- ${item}`).join('\n')}`);
  console.log(`BUSINESS GUIDE PASS: ${path.resolve(args[1])}`);
  process.exit(0);
}

if (args.length < 2) fail('Usage: write-business-guide.mjs <input.json> <project-root>');
const inputPath = path.resolve(args[0]);
const projectRoot = path.resolve(args[1]);
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
for (const field of ['project', 'feature', 'environment', 'last_verified', 'latest_run']) {
  if (!data[field]) fail(`Missing required field: ${field}`);
}
rejectSecrets(data);
const markdown = renderGuide(data);
const failures = validateGuide(markdown);
if (failures.length) fail(`BUSINESS GUIDE INVALID\n${failures.map(item => `- ${item}`).join('\n')}`);
const slug = slugify(data.slug || data.feature);
const outputDir = path.join(projectRoot, 'qa-knowledge');
const outputPath = path.join(outputDir, `${slug}-business-guide.md`);
if (fs.existsSync(outputPath)) {
  const previousPath = data.previous_guide
    ? path.resolve(projectRoot, data.previous_guide)
    : '';
  if (previousPath !== outputPath || data.merge_confirmed !== true) {
    fail('Existing guide requires previous_guide pointing to the same file and merge_confirmed=true');
  }
}
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${markdown.trimEnd()}\n`, 'utf8');
console.log(`BUSINESS GUIDE WRITTEN: ${outputPath}`);
