#!/usr/bin/env node
/**
 * execute-sheet.mjs — evidence-gated Sheet testcase worker orchestrator
 *
 * This script reads testcases, groups them by functional area, proposes worker
 * assignments, requires an explicit worker selection, and writes back only
 * validated execution results that contain the required evidence
 *
 * Media: evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/
 * Metadata: evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/
 *
 * Planning:
 *   node execute-sheet.mjs --sheet-url <URL> --manifest <file.automation.json> \
 *     --module LOGIN --parallel --plan-only
 *
 * Execute with an external Node worker:
 *   node execute-sheet.mjs --sheet-url <URL> --module LOGIN \
 *     --confirmed-module LOGIN --parallel --workers 2 \
 *     --selected-workers all --worker-script ./run-sheet-worker.mjs
 *
 * Import evidence-backed results collected by browser/agent workers:
 *   node execute-sheet.mjs --sheet-url <URL> --module LOGIN \
 *     --confirmed-module LOGIN --parallel --workers 2 \
 *     --selected-workers all --results-file ./worker-results.json
 */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const __dirname = path.dirname(SCRIPT_PATH);
const DEFAULT_SHEET_NAME = 'Test cases_App';
const MAX_CONCURRENT_WORKERS = 4;
const MAX_GROUPS_PER_ASSIGNMENT = 2;
const VALID_RESULTS = new Set(['Pass', 'Fail', 'N/A', 'Untest']);
const VALID_PRIORITIES = new Set(['Critical', 'High', 'Medium', 'Low']);
const VISUAL_EVIDENCE_EXTENSIONS = /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)(?:$|[?#])/i;

const args = process.argv.slice(2);
const getArg = (flag, fallback = undefined) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : fallback;
};

const DATA = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const SKILL_DIR = path.resolve(process.env.QA_RUN_SKILL_DIR || path.join(__dirname, '../..'));
const EVIDENCE_DIR = path.join(DATA, 'evidence');
const SHEET_EVIDENCE_DIR = path.join(EVIDENCE_DIR, 'sheet');
const localPythonScript = path.join(__dirname, 'drive_sheet_execute.py');
const sharedPythonScript = path.join(path.resolve(SKILL_DIR, '..', 'integration-google-drive', 'scripts'), 'drive_sheet_execute.py');
const DRIVE_PYTHON_SCRIPT = fs.existsSync(localPythonScript) ? localPythonScript : sharedPythonScript;

function sanitizeRunId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `sheet-${Date.now()}`;
}

export function evidenceSlug(value) {
  return String(value || 'general')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'general';
}

function currentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRunDate(value) {
  const normalized = String(value || currentLocalDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('--run-date phải có định dạng YYYY-MM-DD');
  }
  return normalized;
}

function sheetRunMetadataDir(runDate, runId, evidenceRoot = EVIDENCE_DIR) {
  return path.join(
    evidenceRoot,
    'sheet',
    '_runs',
    normalizeRunDate(runDate),
    sanitizeRunId(runId),
  );
}

export function sheetFunctionalEvidenceDir(
  functionalGroup,
  runDate,
  runId,
  workerId,
  evidenceRoot = EVIDENCE_DIR,
) {
  return path.join(
    evidenceRoot,
    'sheet',
    evidenceSlug(functionalGroup),
    normalizeRunDate(runDate),
    sanitizeRunId(runId),
    `worker-${workerId}`,
  ).replace(/\\/g, '/');
}

function validateWorkerCount(value) {
  const count = Number.parseInt(String(value), 10);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CONCURRENT_WORKERS) {
    throw new Error(`--workers phải nằm trong khoảng 1-${MAX_CONCURRENT_WORKERS}`);
  }
  return count;
}

function resolveDataPath(value) {
  if (!value) return '';
  return path.isAbsolute(value) ? value : path.resolve(DATA, value);
}

function loadProvidedDataFile(filePath) {
  const provided = {};
  if (!filePath || !fs.existsSync(filePath)) return provided;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    const normalizedKey = key.trim();
    const normalizedValue = valueParts.join('=').trim();
    if (normalizedKey && normalizedValue && normalizedValue !== '?') {
      provided[normalizedKey] = normalizedValue;
    }
  }
  return provided;
}

function checkAndGenerateMissingDataContract(testcases, dataFile) {
  const providedData = loadProvidedDataFile(dataFile);
  const detectedKeys = new Map();

  for (const testcase of testcases) {
    const groupName = functionalGroupOf(testcase);
    const text = [
      testcase.precondition,
      testcase.procedure,
      testcase.description,
      testcase.expected,
    ].filter(Boolean).join(' ');

    if (/email|mail|đăng nhập|tài khoản|user|username/i.test(text)) {
      if (!detectedKeys.has('email')) detectedKeys.set('email', groupName);
      if (!detectedKeys.has('password')) detectedKeys.set('password', groupName);
    }
    if (/url|trang web|domain|base_url/i.test(text) && !detectedKeys.has('app_url')) {
      detectedKeys.set('app_url', groupName);
    }
    if (/thẻ|thanh toán|card|payment/i.test(text) && !detectedKeys.has('payment_card')) {
      detectedKeys.set('payment_card', groupName);
    }
    if (/api|token|secret/i.test(text) && !detectedKeys.has('api_token')) {
      detectedKeys.set('api_token', groupName);
    }
  }

  const missingKeys = [...detectedKeys.entries()]
    .filter(([key]) => !providedData[key] && !process.env[key.toUpperCase()])
    .map(([key, group]) => ({ key, group }));

  if (!missingKeys.length) return null;

  const byGroup = new Map();
  for (const item of missingKeys) {
    if (!byGroup.has(item.group)) byGroup.set(item.group, []);
    byGroup.get(item.group).push(item.key);
  }

  const lines = [
    '# MISSING TEST DATA CONTRACT',
    '',
    '> Điền các giá trị `key = ?` trước khi chạy worker cần dữ liệu tương ứng',
    '',
  ];
  for (const [group, keys] of byGroup.entries()) {
    lines.push(`### Functional group: ${group}`);
    for (const key of keys) lines.push(`${key} = ?`);
    lines.push('');
  }

  const outputPath = path.join(DATA, 'MISSING_TEST_DATA.md');
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  return outputPath;
}

function runPythonJson(commandArgs) {
  const result = spawnSync('python3', [DRIVE_PYTHON_SCRIPT, ...commandArgs], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'Python Sheet helper failed').trim());
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Sheet helper trả về JSON không hợp lệ: ${result.stdout.slice(0, 500)}`);
  }
}

function readSheetTestcases(source, sheetName) {
  const isLocal = source.toLowerCase().endsWith('.xlsx') || fs.existsSync(source);
  console.log(isLocal
    ? `[execute-sheet] Đọc testcase từ Excel: ${path.resolve(source)}`
    : `[execute-sheet] Đọc testcase từ Google Sheet: ${source}`);

  const commandArgs = ['read', source];
  if (sheetName) commandArgs.push('--sheet-name', sheetName);
  return runPythonJson(commandArgs);
}

const STRUCTURED_STEP_MARKER = /\[(S\d{2,})\]/i;
const OUTCOME_MARKER = /\[OUTCOME\]/i;
const CLEANUP_MARKER = /\[CLEANUP\]/i;
const TARGET_MARKER = /\s*\|\s*Đối tượng:\s*(.*?)\s*\[([^\]]+)\]/i;

function stripLineNumber(value) {
  return String(value || '').trim().replace(/^\d+\.\s*/, '').trim();
}

/**
 * Parse the stable markers emitted by support-testcase-authoring into a worker-facing
 * contract. Legacy prose remains available under procedure/expected but is
 * explicitly marked so a worker cannot mistake it for a verified flow
 */
export function parseStructuredExecutionContract(procedure, expected) {
  const procedureLines = String(procedure || '')
    .split(/\r?\n/)
    .map(stripLineNumber)
    .filter(Boolean);
  const expectedLines = String(expected || '')
    .split(/\r?\n/)
    .map(stripLineNumber)
    .filter(Boolean);
  const cleanup = procedureLines
    .filter((line) => CLEANUP_MARKER.test(line))
    .map((line) => line.replace(CLEANUP_MARKER, '').trim())
    .filter(Boolean);
  const stepLines = procedureLines.filter(
    (line) => STRUCTURED_STEP_MARKER.test(line) && !CLEANUP_MARKER.test(line),
  );
  if (!stepLines.length) {
    return {
      schema_version: null,
      status: 'legacy',
      steps: [],
      outcome_assertions: [],
      cleanup,
    };
  }

  const steps = stepLines.map((line) => {
    const marker = line.match(STRUCTURED_STEP_MARKER);
    const id = marker[1].toUpperCase();
    const content = line.replace(STRUCTURED_STEP_MARKER, '').trim();
    const targetMarker = content.match(TARGET_MARKER);
    const withoutTarget = targetMarker
      ? content.replace(TARGET_MARKER, '').trim()
      : content;
    const waitMarker = withoutTarget.match(/\s+\|\s*Điều kiện tiếp tục:\s*(.*)$/i);
    return {
      id,
      instruction: (waitMarker ? withoutTarget.slice(0, waitMarker.index) : withoutTarget).trim(),
      target_name: targetMarker ? targetMarker[1].trim() : '',
      target_key: targetMarker ? targetMarker[2].trim() : '',
      wait_for: waitMarker ? waitMarker[1].trim() : '',
      assertions: [],
    };
  });
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const outcomeAssertions = [];
  for (const line of expectedLines) {
    if (OUTCOME_MARKER.test(line)) {
      outcomeAssertions.push(line.replace(OUTCOME_MARKER, '').trim());
      continue;
    }
    if (CLEANUP_MARKER.test(line)) {
      cleanup.push(line.replace(CLEANUP_MARKER, '').trim());
      continue;
    }
    const marker = line.match(STRUCTURED_STEP_MARKER);
    if (!marker) continue;
    const id = marker[1].toUpperCase();
    const assertion = line.replace(STRUCTURED_STEP_MARKER, '').trim();
    if (stepById.has(id) && assertion) stepById.get(id).assertions.push(assertion);
  }

  return {
    schema_version: 1,
    status: 'structured',
    steps,
    outcome_assertions: outcomeAssertions,
    cleanup,
  };
}

function normalizeTestcaseId(value) {
  return String(value || '').trim().replace(/^\[|\]$/g, '').trim();
}

export function resolveAutomationManifestPath(source, explicitPath = '', dataRoot = DATA) {
  if (explicitPath) {
    const resolved = path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(dataRoot, explicitPath);
    if (!fs.existsSync(resolved)) throw new Error(`Không tìm thấy automation manifest: ${resolved}`);
    return resolved;
  }
  const sourcePath = String(source || '');
  if (!sourcePath || !fs.existsSync(sourcePath)) return '';
  const resolvedSource = path.resolve(sourcePath);
  const candidate = resolvedSource.replace(/\.(?:xlsx|xlsm|xls)$/i, '.automation.json');
  return candidate !== resolvedSource && fs.existsSync(candidate) ? candidate : '';
}

export function loadAutomationManifest(filePath) {
  const raw = fs.readFileSync(filePath);
  let manifest;
  try {
    manifest = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error(`Automation manifest không phải JSON hợp lệ: ${filePath}`);
  }
  if (Number(manifest?.schema_version) !== 1 || !Array.isArray(manifest?.testcases)) {
    throw new Error('Automation manifest phải có schema_version=1 và testcases[]');
  }
  return {
    manifest,
    metadata: {
      path: path.resolve(filePath),
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
      markdown_sha256: manifest?.source?.markdown_sha256 || null,
      testcase_count: manifest.testcases.length,
    },
  };
}

export function attachAutomationManifest(testcases, manifest) {
  const manifestById = new Map();
  for (const manifestCase of manifest.testcases || []) {
    const id = normalizeTestcaseId(manifestCase.testcase_id);
    if (!id) throw new Error('Automation manifest có testcase thiếu testcase_id');
    if (manifestById.has(id)) throw new Error(`Automation manifest trùng testcase_id: ${id}`);
    manifestById.set(id, manifestCase);
  }

  const seenSheetIds = new Set();
  return testcases.map((testcase) => {
    const id = normalizeTestcaseId(testcase.testcase_id);
    if (!id) throw new Error(`Sheet row ${testcase.row_number || 'unknown'} thiếu testcase_id`);
    if (seenSheetIds.has(id)) throw new Error(`Sheet trùng testcase_id: ${id}`);
    seenSheetIds.add(id);
    const manifestCase = manifestById.get(id);
    if (!manifestCase) throw new Error(`Testcase ${id} không tồn tại trong automation manifest`);
    const execution = manifestCase.execution;
    if (!execution || !Array.isArray(execution.steps) || execution.steps.length === 0) {
      throw new Error(`Testcase ${id} thiếu execution contract trong automation manifest`);
    }
    return {
      ...testcase,
      testcase_id: id,
      group: manifestCase.group || testcase.group,
      scenario_id: manifestCase.scenario_id || testcase.scenario_id,
      scenario_name: manifestCase.scenario_name || testcase.scenario_name,
      description: manifestCase.description || testcase.description,
      priority: manifestCase.priority || testcase.priority,
      execution_contract: {
        schema_version: 1,
        status: 'manifest',
        source: 'automation_manifest',
        testcase_id: id,
        type: manifestCase.type || null,
        bb_technique: manifestCase.bb_technique || null,
        requirement: manifestCase.requirement || null,
        entry: execution.entry || {},
        steps: execution.steps,
        outcome_assertions: execution.outcome?.assertions || [],
        cleanup: execution.cleanup || null,
        mutates: Boolean(execution.mutates),
      },
    };
  });
}

function getExportedKeysFile() {
  return path.join(SHEET_EVIDENCE_DIR, '_state', '.exported-keys.json');
}

function readExportedKeys() {
  const keys = [];
  const candidates = [
    getExportedKeysFile(),
    path.join(EVIDENCE_DIR, '.exported-keys.json'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) keys.push(...parsed);
    } catch {
      // Ignore malformed historical state and preserve any valid current state
    }
  }
  return [...new Set(keys)];
}

function markUpdatesAsExported(keys) {
  const merged = [...new Set([...readExportedKeys(), ...keys])].slice(-5000);
  const filePath = getExportedKeysFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
}

function updateSheetResults(source, sheetName, updates, runId, runDate) {
  const existingKeys = new Set(readExportedKeys());
  const pending = updates
    .filter((update) => {
      const key = `${runId}:row-${update.row_number}:sheet`;
      return !existingKeys.has(key);
    })
    .map((update) => {
      const visualEvidence = (update.evidence || []).filter(isVisualEvidenceReference);
      if (!visualEvidence.length) return update;
      const evidenceText = `Evidence: ${visualEvidence.join(', ')}`;
      return {
        ...update,
        note: update.note ? `${update.note} | ${evidenceText}` : evidenceText,
      };
    });

  if (!pending.length) {
    console.log('[execute-sheet] Không có kết quả mới cần write-back');
    return { updated_count: 0, errors: [] };
  }

  const runDir = sheetRunMetadataDir(runDate, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const updateFile = path.join(runDir, 'sheet-updates.json');
  fs.writeFileSync(updateFile, JSON.stringify(pending, null, 2), 'utf8');

  const commandArgs = ['update', source, '--updates', updateFile];
  if (sheetName) commandArgs.push('--sheet-name', sheetName);
  const response = runPythonJson(commandArgs);
  const errors = Array.isArray(response.errors) ? response.errors : [];

  if (response.updated_count !== pending.length || errors.length) {
    throw new Error(
      `Write-back không đầy đủ: expected=${pending.length}, updated=${response.updated_count || 0}, errors=${errors.join(' | ')}`,
    );
  }

  const exportedKeys = pending.map(
    (update) => `${runId}:row-${update.row_number}:sheet`,
  );
  markUpdatesAsExported(exportedKeys);
  return response;
}

export function functionalGroupOf(testcase) {
  const candidates = [
    testcase.group,
    testcase.scenario_name,
    testcase.module,
    'General',
  ];
  const useful = candidates.find((value) => {
    const normalized = String(value || '').trim();
    return normalized && !/^general$/i.test(normalized);
  });
  return String(useful || candidates.find(Boolean) || 'General').trim();
}

export function partitionByFunctionalGroup(testcases) {
  const groups = new Map();
  for (const testcase of testcases) {
    const key = functionalGroupOf(testcase);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(testcase);
  }
  return groups;
}

function splitGroupTokens(value) {
  return String(value || '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function resolveFunctionalGroupNames(moduleGroups, requestedModule = '') {
  const available = [...moduleGroups.keys()];
  const tokens = splitGroupTokens(requestedModule);
  if (!tokens.length || tokens.some((token) => /^all$/i.test(token))) return available;

  return tokens.map((token) => {
    const exact = available.find((group) => group.toLowerCase() === token.toLowerCase());
    if (exact) return exact;
    const partial = available.filter((group) => group.toLowerCase().includes(token.toLowerCase()));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      throw new Error(`Module "${token}" không rõ ràng; matches: ${partial.join(', ')}`);
    }
    throw new Error(`Không tìm thấy module "${token}"; available: ${available.join(', ')}`);
  });
}

function casesForGroups(moduleGroups, groupNames) {
  return groupNames.flatMap((groupName) => moduleGroups.get(groupName) || []);
}

function sameGroupSet(left, right) {
  const normalize = (items) => [...new Set(items.map((item) => item.toLowerCase()))].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export async function resolveModuleConfirmation(
  moduleGroups,
  requestedGroups,
  {
    confirmedModule,
    interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask,
  } = {},
) {
  if (confirmedModule) {
    const confirmedGroups = resolveFunctionalGroupNames(moduleGroups, confirmedModule);
    if (!sameGroupSet(confirmedGroups, requestedGroups)) {
      throw new Error(
        `Module xác nhận [${confirmedGroups.join(', ')}] không khớp scope đã resolve [${requestedGroups.join(', ')}]`,
      );
    }
    return requestedGroups;
  }
  if (!interactive) {
    throw new Error(
      `Cần xác nhận module trước khi chạy; dùng --confirmed-module "${requestedGroups.join(',')}"`,
    );
  }

  let answer;
  if (ask) {
    answer = await ask(requestedGroups, [...moduleGroups.keys()]);
  } else {
    const interfaceHandle = createInterface({ input: process.stdin, output: process.stdout });
    try {
      answer = await interfaceHandle.question(
        `\nXác nhận module cần chạy [${requestedGroups.join(', ')}]? [yes / tên module khác / cancel]: `,
      );
    } finally {
      interfaceHandle.close();
    }
  }

  const normalized = String(answer || '').trim().toLowerCase();
  if (['yes', 'y', 'đúng', 'dung'].includes(normalized)) return requestedGroups;
  if (['cancel', 'c', 'hủy', 'huy'].includes(normalized)) return [];
  return resolveFunctionalGroupNames(moduleGroups, answer);
}

export async function resolveWorkerCount(
  {
    workers,
    recommended = 1,
    interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
    ask,
  } = {},
) {
  if (workers !== undefined && workers !== null && String(workers).trim()) {
    return validateWorkerCount(workers);
  }
  if (!interactive) {
    throw new Error(`Cần xác nhận số worker trước khi chạy; dùng --workers <1-${MAX_CONCURRENT_WORKERS}>`);
  }

  let answer;
  if (ask) {
    answer = await ask(recommended);
  } else {
    const interfaceHandle = createInterface({ input: process.stdin, output: process.stdout });
    try {
      answer = await interfaceHandle.question(
        `\nBạn muốn chạy bao nhiêu worker? [1-${MAX_CONCURRENT_WORKERS}, đề xuất ${recommended}]: `,
      );
    } finally {
      interfaceHandle.close();
    }
  }
  return validateWorkerCount(answer);
}

function uniqueGroupsForCases(testcases) {
  return [...new Set(testcases.map(functionalGroupOf))];
}

function splitLargestAssignment(assignments) {
  let largestIndex = -1;
  for (let index = 0; index < assignments.length; index += 1) {
    if (assignments[index].testcases.length < 2) continue;
    if (
      largestIndex === -1
      || assignments[index].testcases.length > assignments[largestIndex].testcases.length
    ) {
      largestIndex = index;
    }
  }
  if (largestIndex === -1) return false;

  const original = assignments[largestIndex];
  const midpoint = Math.ceil(original.testcases.length / 2);
  assignments.splice(
    largestIndex,
    1,
    { testcases: original.testcases.slice(0, midpoint) },
    { testcases: original.testcases.slice(midpoint) },
  );
  return true;
}

export function buildWorkerAssignments(
  moduleGroups,
  {
    parallel = true,
    desiredWorkers,
    maxGroupsPerAssignment = MAX_GROUPS_PER_ASSIGNMENT,
    runId = 'run',
    runDate = currentLocalDate(),
    evidenceRoot = EVIDENCE_DIR,
  } = {},
) {
  const entries = [...moduleGroups.entries()];
  if (!entries.length) return [];
  const groupLimit = parallel ? maxGroupsPerAssignment : entries.length;
  const assignments = [];

  for (let index = 0; index < entries.length; index += groupLimit) {
    const chunk = entries.slice(index, index + groupLimit);
    assignments.push({
      testcases: chunk.flatMap(([, cases]) => cases),
    });
  }

  const totalCases = entries.reduce((total, [, cases]) => total + cases.length, 0);
  const requestedAssignmentCount = desiredWorkers
    ? validateWorkerCount(desiredWorkers)
    : assignments.length;
  const targetAssignments = parallel
    ? Math.min(requestedAssignmentCount, totalCases)
    : 1;
  while (assignments.length < targetAssignments && splitLargestAssignment(assignments)) {
    // Split a large group shard until the confirmed worker count is reached
  }

  return assignments.map((assignment, index) => {
    const id = index + 1;
    const functionalGroups = uniqueGroupsForCases(assignment.testcases);
    const evidenceDirectories = Object.fromEntries(functionalGroups.map((group) => [
      group,
      sheetFunctionalEvidenceDir(group, runDate, runId, id, evidenceRoot),
    ]));
    return {
      id,
      functional_groups: functionalGroups,
      testcase_count: assignment.testcases.length,
      shard: `${id}/${assignments.length}`,
      data_scope: `w${id}_${sanitizeRunId(runId)}`,
      evidence_directories: evidenceDirectories,
      testcases: assignment.testcases.map((testcase) => ({
        ...testcase,
        evidence_directory: evidenceDirectories[functionalGroupOf(testcase)],
      })),
    };
  });
}

export function parseWorkerSelection(input, assignments) {
  const normalized = String(input || '').trim().toLowerCase();
  if (!normalized) throw new Error('Chưa chọn worker');
  if (['cancel', 'c', 'hủy', 'huy'].includes(normalized)) return [];
  if (['all', 'a', 'tất cả', 'tat ca'].includes(normalized)) return assignments;

  const selectedIds = [...new Set(
    normalized
      .replace(/worker|#/g, '')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter(Number.isInteger),
  )];
  if (!selectedIds.length) {
    throw new Error('Lựa chọn không hợp lệ; dùng all hoặc danh sách như 1,2');
  }

  const knownIds = new Set(assignments.map((assignment) => assignment.id));
  const unknown = selectedIds.filter((id) => !knownIds.has(id));
  if (unknown.length) throw new Error(`Worker không tồn tại: ${unknown.join(', ')}`);
  return assignments.filter((assignment) => selectedIds.includes(assignment.id));
}

export async function resolveWorkerSelection(
  assignments,
  { selectedWorkers, interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY), ask } = {},
) {
  if (selectedWorkers) return parseWorkerSelection(selectedWorkers, assignments);
  if (!interactive) {
    throw new Error(
      'Cần xác nhận worker trước khi chạy; dùng --selected-workers all hoặc --selected-workers 1,2',
    );
  }

  if (ask) return parseWorkerSelection(await ask(assignments), assignments);
  const interfaceHandle = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await interfaceHandle.question(
      '\nChạy tất cả worker theo nhóm chức năng hay chọn worker? [all / 1,2 / cancel]: ',
    );
    return parseWorkerSelection(answer, assignments);
  } finally {
    interfaceHandle.close();
  }
}

function cleanNote(note) {
  return String(note || '')
    .replace(/Internal Server Error:?.*/gi, 'Hệ thống gặp lỗi xử lý máy chủ')
    .replace(/HTTP\s*(?:status\s*)?[45]\d\d.*/gi, 'Hành động không nhận được phản hồi hợp lệ từ ứng dụng')
    .replace(/NullPointerException.*/gi, 'Dữ liệu trả về bị thiếu hoặc không đúng định dạng')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
    .trim()
    .replace(/\.+$/g, '');
}

function normalizeEvidence(evidence) {
  const values = Array.isArray(evidence) ? evidence : [evidence];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

export function isVisualEvidenceReference(reference) {
  const normalized = String(reference || '').trim();
  if (!normalized) return false;
  if (/^(image|video):/i.test(normalized)) return true;
  return VISUAL_EVIDENCE_EXTENSIONS.test(normalized);
}

function unwrapVisualEvidenceReference(reference) {
  return String(reference || '').replace(/^(image|video):/i, '').trim();
}

function validateVisualEvidenceFiles(references, evidenceBaseDir, expectedDirectory = '') {
  for (const reference of references) {
    const target = unwrapVisualEvidenceReference(reference);
    if (/^(https?:\/\/|drive:\/\/|s3:\/\/|gs:\/\/)/i.test(target)) continue;
    const localPath = path.isAbsolute(target) ? target : path.resolve(evidenceBaseDir, target);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Visual evidence không tồn tại: ${reference}`);
    }
    if (expectedDirectory) {
      const expected = path.resolve(expectedDirectory);
      const relative = path.relative(expected, localPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(
          `Visual evidence nằm sai thư mục chức năng/ngày: ${reference}; expected under ${expected}`,
        );
      }
    }
  }
}

function resultKey(value) {
  if (value?.row_number !== undefined && value?.row_number !== null) {
    return `row:${Number(value.row_number)}`;
  }
  return `id:${String(value?.testcase_id || '').trim()}`;
}

export function validateWorkerResults(
  rawResults,
  assignedTestcases,
  { requireComplete = true, evidenceBaseDir = DATA } = {},
) {
  const resultList = Array.isArray(rawResults) ? rawResults : rawResults?.results;
  if (!Array.isArray(resultList)) throw new Error('Worker result phải là array hoặc object có field results');

  const assignedByKey = new Map();
  for (const testcase of assignedTestcases) {
    assignedByKey.set(resultKey(testcase), testcase);
    if (testcase.testcase_id) assignedByKey.set(`id:${String(testcase.testcase_id).trim()}`, testcase);
  }

  const seenRows = new Set();
  const normalized = [];
  for (const raw of resultList) {
    const testcase = assignedByKey.get(resultKey(raw));
    if (!testcase) {
      throw new Error(`Kết quả không thuộc assignment: ${raw.testcase_id || raw.row_number || 'unknown'}`);
    }

    const rowKey = `row:${Number(testcase.row_number)}`;
    if (seenRows.has(rowKey)) throw new Error(`Kết quả trùng cho row ${testcase.row_number}`);
    seenRows.add(rowKey);

    if (!VALID_RESULTS.has(raw.result)) {
      throw new Error(`Result không hợp lệ cho ${testcase.testcase_id || rowKey}: ${raw.result}`);
    }
    const priority = raw.priority || testcase.priority || 'Medium';
    if (!VALID_PRIORITIES.has(priority)) {
      throw new Error(`Priority không hợp lệ cho ${testcase.testcase_id || rowKey}: ${priority}`);
    }

    const note = cleanNote(raw.note);
    const evidence = normalizeEvidence(raw.evidence);
    const visualEvidence = evidence.filter(isVisualEvidenceReference);
    if (['Pass', 'Fail'].includes(raw.result) && !visualEvidence.length) {
      throw new Error(
        `Thiếu evidence hình ảnh/video cho ${raw.result}: ${testcase.testcase_id || rowKey}`,
      );
    }
    if (visualEvidence.length) {
      validateVisualEvidenceFiles(
        visualEvidence,
        evidenceBaseDir,
        testcase.evidence_directory,
      );
    }
    if (['Fail', 'N/A', 'Untest'].includes(raw.result) && !note) {
      throw new Error(`Thiếu Note cho ${raw.result}: ${testcase.testcase_id || rowKey}`);
    }

    normalized.push({
      row_number: testcase.row_number,
      testcase_id: testcase.testcase_id,
      result: raw.result,
      priority,
      note,
      tester: raw.tester || process.env.QA_TESTER_NAME || 'QA Agent',
      date: raw.date || new Date().toISOString().slice(0, 10),
      evidence,
    });
  }

  if (requireComplete) {
    const missing = assignedTestcases.filter(
      (testcase) => !seenRows.has(`row:${Number(testcase.row_number)}`),
    );
    if (missing.length) {
      throw new Error(
        `Worker chưa trả kết quả cho ${missing.length} testcase: ${missing
          .slice(0, 10)
          .map((testcase) => testcase.testcase_id || `row ${testcase.row_number}`)
          .join(', ')}`,
      );
    }
  }

  return normalized;
}

export async function runWithConcurrency(items, concurrency, handler) {
  const limit = validateWorkerCount(concurrency);
  const results = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => consume()),
  );
  return results;
}

function writeExecutionPlan({
  runId,
  runDate,
  source,
  sheetData,
  assignments,
  maxConcurrentWorkers,
  availableGroups,
  requestedModule,
  resolvedGroups,
  confirmationRequired,
  automationManifest,
}) {
  const runDir = sheetRunMetadataDir(runDate, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const planPath = path.join(runDir, 'sheet-worker-plan.json');
  const plan = {
    schema_version: 3,
    run_id: runId,
    run_date: runDate,
    source,
    automation_manifest: automationManifest || null,
    sheet_name: sheetData.sheet_name,
    header_row: sheetData.header_row,
    module_scope: {
      requested: requestedModule || 'all',
      resolved_functional_groups: resolvedGroups,
      available_functional_groups: availableGroups,
    },
    max_concurrent_workers: maxConcurrentWorkers,
    effective_concurrent_workers: Math.min(maxConcurrentWorkers, assignments.length),
    max_functional_groups_per_assignment: MAX_GROUPS_PER_ASSIGNMENT,
    visual_evidence_required_for: ['Pass', 'Fail'],
    accepted_visual_evidence: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'm4v'],
    evidence_layout: {
      media: 'evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/',
      run_metadata: 'evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/',
    },
    confirmation_required: confirmationRequired,
    assignments,
  };
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  return planPath;
}

function printModuleScope(availableGroups, requestedModule, resolvedGroups) {
  console.log('\nMODULE SCOPE');
  console.log(`  Requested: ${requestedModule || 'all'}`);
  console.log(`  Resolved: [${resolvedGroups.join(', ')}]`);
  console.log(`  Available: [${availableGroups.join(', ')}]`);
}

function printWorkerPlan(assignments, maxConcurrentWorkers) {
  console.log('\nPROPOSED FUNCTIONAL WORKER PLAN');
  console.log(`Concurrency limit: ${maxConcurrentWorkers}`);
  console.log(`Effective concurrent workers: ${Math.min(maxConcurrentWorkers, assignments.length)}`);
  for (const assignment of assignments) {
    console.log(
      `  [Worker ${assignment.id}] Groups: [${assignment.functional_groups.join(', ')}] | Cases: ${assignment.testcase_count} | Shard: ${assignment.shard} | Data scope: ${assignment.data_scope}`,
    );
  }
}

function loadResultFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Không tìm thấy results file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runWorkerProcess(workerScript, assignment, runDir) {
  return new Promise((resolve, reject) => {
    const workerDir = path.join(runDir, 'workers');
    fs.mkdirSync(workerDir, { recursive: true });
    const assignmentPath = path.join(workerDir, `worker-${assignment.id}-assignment.json`);
    const resultPath = path.join(workerDir, `worker-${assignment.id}-results.json`);
    fs.writeFileSync(assignmentPath, JSON.stringify(assignment, null, 2), 'utf8');

    const child = spawn(
      process.execPath,
      [workerScript, '--assignment', assignmentPath, '--result', resultPath],
      {
        cwd: DATA,
        env: {
          ...process.env,
          QA_WORKER_ID: String(assignment.id),
          QA_WORKER_ASSIGNMENT: assignmentPath,
          QA_WORKER_RESULT: resultPath,
          QA_DATA_SCOPE: assignment.data_scope,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (stdout.trim()) console.log(`[Worker ${assignment.id}] ${stdout.trim()}`);
      if (code !== 0) {
        reject(new Error(`Worker ${assignment.id} thất bại (${code}): ${stderr.trim()}`));
        return;
      }
      if (!fs.existsSync(resultPath)) {
        reject(new Error(`Worker ${assignment.id} không tạo result file: ${resultPath}`));
        return;
      }
      try {
        resolve(validateWorkerResults(loadResultFile(resultPath), assignment.testcases));
      } catch (error) {
        reject(new Error(`Worker ${assignment.id}: ${error.message}`));
      }
    });
  });
}

async function main() {
  const source = getArg('--sheet-url', getArg('--excel-file', getArg('--file', args[0])));
  if (!source) {
    throw new Error('Thiếu --sheet-url <URL_OR_ID> hoặc --excel-file <PATH_TO_XLSX>');
  }
  if (!fs.existsSync(DRIVE_PYTHON_SCRIPT)) {
    throw new Error(`Không tìm thấy Sheet helper: ${DRIVE_PYTHON_SCRIPT}`);
  }

  try {
    process.loadEnvFile(path.join(DATA, '.env'));
  } catch {
    // Project .env is optional
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const parallel = args.includes('--parallel') || args.includes('--all');
  const planOnly = args.includes('--plan-only') || args.includes('--dry-run');
  const workersArg = getArg('--workers', '');
  const selectedWorkers = getArg('--selected-workers', args.includes('--yes') ? 'all' : '');
  const sheetName = getArg('--sheet-name', DEFAULT_SHEET_NAME);
  const moduleFilter = getArg('--module', '');
  const confirmedModule = getArg('--confirmed-module', '');
  const resultsFile = resolveDataPath(getArg('--results-file', ''));
  const workerScript = resolveDataPath(getArg('--worker-script', ''));
  const dataFile = resolveDataPath(getArg('--data-file', 'test-data.md'));
  const runId = sanitizeRunId(getArg('--run-id', `sheet-${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}`));
  const runDate = normalizeRunDate(getArg('--run-date', ''));
  const manifestPath = resolveAutomationManifestPath(source, getArg('--manifest', ''));

  const sheetData = readSheetTestcases(source, sheetName);
  const sheetCases = Array.isArray(sheetData.testcases) ? sheetData.testcases : [];
  const loadedManifest = manifestPath ? loadAutomationManifest(manifestPath) : null;
  const allCases = loadedManifest
    ? attachAutomationManifest(sheetCases, loadedManifest.manifest)
    : sheetCases.map((testcase) => ({
      ...testcase,
      execution_contract: parseStructuredExecutionContract(
        testcase.procedure,
        testcase.expected,
      ),
    }));
  if (!allCases.length) throw new Error(`Không tìm thấy testcase trong tab ${sheetData.sheet_name || sheetName}`);

  const allGroups = partitionByFunctionalGroup(allCases);
  const availableGroups = [...allGroups.keys()];
  const requestedGroups = resolveFunctionalGroupNames(allGroups, moduleFilter);
  const requestedCases = casesForGroups(allGroups, requestedGroups);
  const recommendedWorkers = Math.min(
    MAX_CONCURRENT_WORKERS,
    Math.max(1, requestedCases.length),
  );

  if (planOnly) {
    const proposedWorkerCount = workersArg
      ? validateWorkerCount(workersArg)
      : recommendedWorkers;
    const proposedAssignments = buildWorkerAssignments(
      partitionByFunctionalGroup(requestedCases),
      {
        parallel,
        desiredWorkers: proposedWorkerCount,
        runId,
        runDate,
      },
    );
    printModuleScope(availableGroups, moduleFilter, requestedGroups);
    console.log(`\nRecommended workers: ${recommendedWorkers}`);
    printWorkerPlan(proposedAssignments, proposedWorkerCount);
    const planPath = writeExecutionPlan({
      runId,
      runDate,
      source,
      sheetData,
      assignments: proposedAssignments,
      maxConcurrentWorkers: proposedWorkerCount,
      availableGroups,
      requestedModule: moduleFilter,
      resolvedGroups: requestedGroups,
      confirmationRequired: {
        module_scope: true,
        worker_count: true,
        worker_selection: true,
      },
      automationManifest: loadedManifest?.metadata || null,
    });
    console.log(`Plan: ${planPath}`);
    console.log(
      `[plan-only] Hãy xác nhận module [${requestedGroups.join(', ')}], số worker 1-${MAX_CONCURRENT_WORKERS}, rồi chọn worker; chưa write-back kết quả`,
    );
    return;
  }

  const confirmedGroups = await resolveModuleConfirmation(allGroups, requestedGroups, {
    confirmedModule,
  });
  if (!confirmedGroups.length) {
    console.log('Đã hủy execution');
    return;
  }
  const targetCases = casesForGroups(allGroups, confirmedGroups);
  const workerCount = await resolveWorkerCount({
    workers: workersArg,
    recommended: Math.min(MAX_CONCURRENT_WORKERS, Math.max(1, targetCases.length)),
  });
  const actualParallel = parallel || workerCount > 1;

  const missingDataPath = checkAndGenerateMissingDataContract(targetCases, dataFile);
  if (missingDataPath) console.log(`[execute-sheet] Thiếu test data: ${missingDataPath}`);

  const groups = partitionByFunctionalGroup(targetCases);
  const assignments = buildWorkerAssignments(groups, {
    parallel: actualParallel,
    desiredWorkers: workerCount,
    runId,
    runDate,
  });
  printModuleScope(availableGroups, moduleFilter, confirmedGroups);
  console.log(`Confirmed workers: ${workerCount}`);
  printWorkerPlan(assignments, workerCount);
  const planPath = writeExecutionPlan({
    runId,
    runDate,
    source,
    sheetData,
    assignments,
    maxConcurrentWorkers: workerCount,
    availableGroups,
    requestedModule: moduleFilter,
    resolvedGroups: confirmedGroups,
    confirmationRequired: {
      module_scope: false,
      worker_count: false,
      worker_selection: !selectedWorkers,
    },
    automationManifest: loadedManifest?.metadata || null,
  });
  console.log(`Plan: ${planPath}`);

  const selectedAssignments = await resolveWorkerSelection(assignments, { selectedWorkers });
  if (!selectedAssignments.length) {
    console.log('Đã hủy execution');
    return;
  }
  console.log(`Selected workers: ${selectedAssignments.map(({ id }) => id).join(', ')}`);

  const selectedCases = selectedAssignments.flatMap(({ testcases }) => testcases);
  let validatedResults;
  if (resultsFile) {
    validatedResults = validateWorkerResults(loadResultFile(resultsFile), selectedCases);
  } else if (workerScript) {
    if (!fs.existsSync(workerScript)) throw new Error(`Không tìm thấy worker script: ${workerScript}`);
    const runDir = sheetRunMetadataDir(runDate, runId);
    const workerResults = await runWithConcurrency(
      selectedAssignments,
      workerCount,
      (assignment) => runWorkerProcess(workerScript, assignment, runDir),
    );
    validatedResults = workerResults.flat();
  } else {
    throw new Error(
      'Đã chọn worker nhưng chưa có executor; cung cấp --worker-script hoặc --results-file có evidence',
    );
  }

  const response = updateSheetResults(
    source,
    sheetData.sheet_name,
    validatedResults,
    runId,
    runDate,
  );
  console.log(`Write-back hoàn tất: ${response.updated_count} testcase`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[execute-sheet] BLOCKED: ${error.message}`);
    process.exitCode = 2;
  });
}
