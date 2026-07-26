#!/usr/bin/env node
/**
 * execute-sheet.mjs — evidence-gated Sheet testcase worker orchestrator
 *
 * This script reads testcases, groups them by functional area, proposes worker
 * assignments, requires an explicit worker selection, and writes back only
 * validated execution results that contain the required evidence
 *
 * Planning:
 *   node execute-sheet.mjs --sheet-url <URL> --parallel --workers 4 --plan-only
 *
 * Execute with an external Node worker:
 *   node execute-sheet.mjs --sheet-url <URL> --parallel --workers 4 \
 *     --selected-workers all --worker-script ./run-sheet-worker.mjs
 *
 * Import evidence-backed results collected by browser/agent workers:
 *   node execute-sheet.mjs --sheet-url <URL> --parallel --workers 4 \
 *     --selected-workers all --results-file ./worker-results.json
 */

import { spawn, spawnSync } from 'node:child_process';
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

const args = process.argv.slice(2);
const getArg = (flag, fallback = undefined) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : fallback;
};

const DATA = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const SKILL_DIR = path.resolve(process.env.QA_RUN_SKILL_DIR || path.join(__dirname, '../..'));
const EVIDENCE_DIR = path.join(DATA, 'evidence');
const localPythonScript = path.join(__dirname, 'drive_sheet_execute.py');
const sharedPythonScript = path.join(path.resolve(SKILL_DIR, '..', 'google-drive-qa', 'scripts'), 'drive_sheet_execute.py');
const DRIVE_PYTHON_SCRIPT = fs.existsSync(localPythonScript) ? localPythonScript : sharedPythonScript;

function sanitizeRunId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `sheet-${Date.now()}`;
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

function getExportedKeysFile() {
  return path.join(EVIDENCE_DIR, '.exported-keys.json');
}

function readExportedKeys() {
  const filePath = getExportedKeysFile();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markUpdatesAsExported(keys) {
  const merged = [...new Set([...readExportedKeys(), ...keys])].slice(-5000);
  fs.writeFileSync(getExportedKeysFile(), JSON.stringify(merged, null, 2), 'utf8');
}

function updateSheetResults(source, sheetName, updates, runId) {
  const existingKeys = new Set(readExportedKeys());
  const pending = updates.filter((update) => {
    const key = `${runId}:row-${update.row_number}:sheet`;
    return !existingKeys.has(key);
  });

  if (!pending.length) {
    console.log('[execute-sheet] Không có kết quả mới cần write-back');
    return { updated_count: 0, errors: [] };
  }

  const runDir = path.join(EVIDENCE_DIR, 'runs', runId);
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

export function buildWorkerAssignments(
  moduleGroups,
  { parallel = true, maxGroupsPerAssignment = MAX_GROUPS_PER_ASSIGNMENT, runId = 'run' } = {},
) {
  const entries = [...moduleGroups.entries()];
  if (!entries.length) return [];
  const groupLimit = parallel ? maxGroupsPerAssignment : entries.length;
  const assignments = [];

  for (let index = 0; index < entries.length; index += groupLimit) {
    const chunk = entries.slice(index, index + groupLimit);
    const id = assignments.length + 1;
    assignments.push({
      id,
      functional_groups: chunk.map(([group]) => group),
      testcase_count: chunk.reduce((total, [, cases]) => total + cases.length, 0),
      data_scope: `w${id}_${sanitizeRunId(runId)}`,
      testcases: chunk.flatMap(([, cases]) => cases),
    });
  }
  return assignments;
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

function resultKey(value) {
  if (value?.row_number !== undefined && value?.row_number !== null) {
    return `row:${Number(value.row_number)}`;
  }
  return `id:${String(value?.testcase_id || '').trim()}`;
}

export function validateWorkerResults(rawResults, assignedTestcases, { requireComplete = true } = {}) {
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
    if (['Pass', 'Fail'].includes(raw.result) && !evidence.length) {
      throw new Error(`Thiếu evidence cho ${raw.result}: ${testcase.testcase_id || rowKey}`);
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
  source,
  sheetData,
  assignments,
  maxConcurrentWorkers,
}) {
  const runDir = path.join(EVIDENCE_DIR, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const planPath = path.join(runDir, 'sheet-worker-plan.json');
  const plan = {
    schema_version: 1,
    run_id: runId,
    source,
    sheet_name: sheetData.sheet_name,
    header_row: sheetData.header_row,
    max_concurrent_workers: maxConcurrentWorkers,
    max_functional_groups_per_assignment: MAX_GROUPS_PER_ASSIGNMENT,
    assignments,
  };
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  return planPath;
}

function printWorkerPlan(assignments, maxConcurrentWorkers) {
  console.log('\nPROPOSED FUNCTIONAL WORKER PLAN');
  console.log(`Concurrency limit: ${maxConcurrentWorkers}`);
  for (const assignment of assignments) {
    console.log(
      `  [Worker ${assignment.id}] Groups: [${assignment.functional_groups.join(', ')}] | Cases: ${assignment.testcase_count} | Data scope: ${assignment.data_scope}`,
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
  const workerCount = validateWorkerCount(getArg('--workers', parallel ? '4' : '1'));
  const selectedWorkers = getArg('--selected-workers', args.includes('--yes') ? 'all' : '');
  const sheetName = getArg('--sheet-name', DEFAULT_SHEET_NAME);
  const moduleFilter = getArg('--module', '');
  const resultsFile = resolveDataPath(getArg('--results-file', ''));
  const workerScript = resolveDataPath(getArg('--worker-script', ''));
  const dataFile = resolveDataPath(getArg('--data-file', 'test-data.md'));
  const runId = sanitizeRunId(getArg('--run-id', `sheet-${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}`));

  const sheetData = readSheetTestcases(source, sheetName);
  const allCases = Array.isArray(sheetData.testcases) ? sheetData.testcases : [];
  if (!allCases.length) throw new Error(`Không tìm thấy testcase trong tab ${sheetData.sheet_name || sheetName}`);

  let targetCases = allCases;
  if (moduleFilter) {
    const needle = moduleFilter.toLowerCase();
    targetCases = allCases.filter(
      (testcase) => functionalGroupOf(testcase).toLowerCase().includes(needle),
    );
    if (!targetCases.length) throw new Error(`Không tìm thấy functional group: ${moduleFilter}`);
  }

  const missingDataPath = checkAndGenerateMissingDataContract(targetCases, dataFile);
  if (missingDataPath) console.log(`[execute-sheet] Thiếu test data: ${missingDataPath}`);

  const groups = partitionByFunctionalGroup(targetCases);
  const assignments = buildWorkerAssignments(groups, { parallel, runId });
  printWorkerPlan(assignments, workerCount);
  const planPath = writeExecutionPlan({
    runId,
    source,
    sheetData,
    assignments,
    maxConcurrentWorkers: workerCount,
  });
  console.log(`Plan: ${planPath}`);

  if (planOnly) {
    console.log('[plan-only] Chưa chạy worker và chưa write-back kết quả');
    return;
  }

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
    const runDir = path.join(EVIDENCE_DIR, 'runs', runId);
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

  const response = updateSheetResults(source, sheetData.sheet_name, validatedResults, runId);
  console.log(`Write-back hoàn tất: ${response.updated_count} testcase`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`[execute-sheet] BLOCKED: ${error.message}`);
    process.exitCode = 2;
  });
}
