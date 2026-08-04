#!/usr/bin/env node
/**
 * CLI client for the native qa-run browser daemon.
 *
 * Commands:
 *   quick-start <run-id> --url <url> --objective <task> [--allowed-domain <origin>]
 *   start <run-id> --workers 1-4 [--headed] [--record-video]
 *   health <run-id>
 *   observe <run-id> --worker-id 1 [--page-id page-1]
 *   action <run-id> --worker-id 1 --action-file action.json
 *   batch <run-id> --worker-id 1 --actions-file actions.json
 *   recover <run-id> --worker-id 1 --reason "stale page"
 *   execute <run-id> --assignments-file assignments.json
 *   close <run-id>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePoolConfig } from '../../lib/native-browser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.join(__dirname, 'native-browser-daemon.mjs');
const RUN_MANIFEST = path.join(__dirname, 'run-manifest.mjs');

function getArg(args, flag, fallback = '') {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function hasArg(args, flag) {
  return args.includes(flag);
}

function slug(value, fallback = 'run') {
  const result = String(value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return result || fallback;
}

function boundedInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function dataDirFrom(args) {
  return path.resolve(getArg(args, '--data-dir', process.env.QA_DATA_DIR || process.cwd()));
}

function runIdFrom(args) {
  const positional = args[1] && !String(args[1]).startsWith('-') ? args[1] : '';
  const raw = positional || getArg(args, '--run-id', '');
  return raw ? slug(raw, '') : '';
}

function stateFile(dataDir, runId) {
  return path.join(dataDir, 'evidence', 'native-browser', slug(runId), 'daemon.json');
}

function readJson(filePath, label = 'JSON') {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('file missing or too large');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`${label} is invalid or unavailable: ${filePath} (${error.message})`);
    wrapped.code = 'INVALID_INPUT_FILE';
    throw wrapped;
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReady(filePath, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (fs.existsSync(filePath)) {
      const state = readJson(filePath, 'native daemon state');
      if (state.status === 'READY' && state.port && state.token) return state;
      if (state.status === 'FAILED') throw new Error(state.error || 'native browser daemon failed to start');
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for native browser daemon: ${filePath}`);
}

async function request(state, pathname, payload, { method = 'POST', timeoutMs = 30000 } = {}) {
  if (!state?.port || !state?.token) throw new Error('native browser daemon state is not ready');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}${pathname}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-qa-native-token': state.token,
      },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.error || `native daemon request failed (${response.status})`);
      error.code = result.code || `HTTP_${response.status}`;
      error.details = result;
      throw error;
    }
    return result.result ?? result;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureState(dataDir, runId) {
  const filePath = stateFile(dataDir, runId);
  if (!fs.existsSync(filePath)) throw new Error(`native browser run is not started: ${runId}`);
  const state = readJson(filePath, 'native daemon state');
  if (state.status !== 'READY') throw new Error(`native browser daemon is ${state.status}: ${state.error || runId}`);
  return state;
}

function spawnDaemon(args, { dataDir, runId, token, workers }) {
  fs.mkdirSync(path.dirname(stateFile(dataDir, runId)), { recursive: true });
  const logPath = path.join(path.dirname(stateFile(dataDir, runId)), 'daemon.log');
  const log = fs.openSync(logPath, 'a');
  const childArgs = [
    DAEMON,
    '--daemon',
    '--run-id', runId,
    '--workers', String(workers),
    '--data-dir', dataDir,
    '--port', '0',
  ];
  if (hasArg(args, '--headed')) childArgs.push('--headed');
  if (hasArg(args, '--record-video')) childArgs.push('--record-video');
  const cdpUrl = getArg(args, '--cdp-url', '');
  const profileDir = getArg(args, '--profile-dir', '');
  const allowedDomain = getArg(args, '--allowed-domain', '');
  if (cdpUrl) childArgs.push('--cdp-url', cdpUrl);
  if (profileDir) childArgs.push('--profile-dir', profileDir);
  if (allowedDomain) childArgs.push('--allowed-origin', allowedDomain);
  const child = spawn(process.execPath, childArgs, {
    cwd: dataDir,
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      QA_DATA_DIR: dataDir,
      QA_NATIVE_DAEMON_TOKEN: token,
    },
  });
  child.unref();
  fs.closeSync(log);
  return child.pid;
}

async function start(args, { silent = false } = {}) {
  const dataDir = dataDirFrom(args);
  const runId = runIdFrom(args);
  if (!runId) throw new Error('start requires <run-id>');
  const workers = Number.parseInt(getArg(args, '--workers', '1'), 10);
  validatePoolConfig({ workers, cdpUrl: getArg(args, '--cdp-url', ''), profileDir: getArg(args, '--profile-dir', '') });
  const filePath = stateFile(dataDir, runId);
  if (fs.existsSync(filePath)) {
    const existing = readJson(filePath, 'native daemon state');
    if (existing.status === 'READY') {
      try {
        const health = await request(existing, '/health', null, { method: 'GET', timeoutMs: 3000 });
        const result = { reused: true, state: existing, health };
        if (!silent) console.log(JSON.stringify(result, null, 2));
        return result;
      } catch { /* stale state; a new daemon will replace it */ }
    }
  }
  const token = randomToken();
  const pid = spawnDaemon(args, { dataDir, runId, token, workers });
  const state = await waitForReady(filePath);
  const health = await request(state, '/health', null, { method: 'GET' });
  const result = { started: true, pid, state, health };
  if (!silent) console.log(JSON.stringify(result, null, 2));
  return result;
}

function validateQuickTaskInput(args) {
  const rawUrl = getArg(args, '--url', '');
  const objective = String(getArg(args, '--objective', '') || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!rawUrl) throw new Error('quick-start requires --url');
  if (!objective) throw new Error('quick-start requires --objective');
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error(`quick-start URL is invalid: ${rawUrl}`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('quick-start URL must use http/https and must not contain embedded credentials');
  }
  const boundaryRaw = getArg(args, '--allowed-domain', url.origin);
  let boundary;
  try {
    boundary = boundaryRaw.includes('://') ? new URL(boundaryRaw).origin : new URL(`${url.protocol}//${boundaryRaw}`).origin;
  } catch {
    throw new Error(`allowed domain is invalid: ${boundaryRaw}`);
  }
  if (url.origin !== boundary) {
    throw new Error(`starting URL is outside the allowed domain: ${url.origin} != ${boundary}`);
  }
  return { url: url.href, objective, allowedOrigin: boundary };
}

function fastTaskFile(dataDir, runId) {
  return path.join(dataDir, 'evidence', 'native-browser', slug(runId), 'fast-task.json');
}

function ensureFastManifest(dataDir, runId, url) {
  const manifestPath = path.join(dataDir, 'evidence', `manifest-${slug(runId)}.json`);
  if (fs.existsSync(manifestPath)) return manifestPath;
  const child = spawnSync(process.execPath, [
    RUN_MANIFEST,
    'start',
    '--run-id', slug(runId),
    '--mode', 'EXPLORATORY_BROWSER_QA',
    '--profile', 'FAST',
    '--browser-driver', 'playwright-runtime',
    '--browser-observer', 'playwright-runtime',
    '--network-observer', 'playwright-runtime',
    '--workers', '1',
  ], {
    cwd: dataDir,
    encoding: 'utf8',
    env: { ...process.env, QA_DATA_DIR: dataDir, QA_BASE_URL: url },
  });
  if (child.status !== 0) {
    const detail = String(child.stderr || child.stdout || 'manifest initialization failed').trim().slice(0, 1200);
    throw new Error(`quick-start manifest failed: ${detail}`);
  }
  return manifestPath;
}

async function quickStart(args) {
  const dataDir = dataDirFrom(args);
  const requestedRunId = runIdFrom(args);
  const runId = requestedRunId || `fast-${Date.now()}`;
  const task = validateQuickTaskInput(args);
  const manifestPath = ensureFastManifest(dataDir, runId, task.url);
  let state;
  try {
    await start(['start', runId, ...args.slice(requestedRunId ? 2 : 1)], { silent: true });
    state = await ensureState(dataDir, runId);
    const navigation = await request(state, '/action', {
      worker_id: 1,
      action: {
        type: 'navigate',
        url: task.url,
        target_url: task.url,
        action: 'Open the exact fast-task URL',
        intent: task.objective,
        expected_signal: 'The requested page is visible and ready for task planning',
        capture_media: false,
      },
    });
    const observation = await request(state, '/observe', { worker_id: 1, max_items: 100 });
    const contract = {
      schema_version: 1,
      artifact: 'fast-browser-agent-task',
      run_id: runId,
      status: 'RUNNING',
      execution_profile: 'FAST',
      objective: task.objective,
      starting_url: task.url,
      allowed_origin: task.allowedOrigin,
      max_actions: boundedInt(getArg(args, '--max-actions', '8'), 8, { min: 1, max: 20 }),
      max_seconds: boundedInt(getArg(args, '--max-seconds', '120'), 120, { min: 10, max: 900 }),
      started_at: new Date().toISOString(),
      manifest_path: manifestPath,
      session_id: observation.session_id,
      page_id: observation.page_id,
      observation_revision: observation.revision,
      result: null,
    };
    const filePath = fastTaskFile(dataDir, runId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
    try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
    console.log(JSON.stringify({
      run_id: runId,
      task_file: filePath,
      manifest_file: manifestPath,
      objective: task.objective,
      allowed_origin: task.allowedOrigin,
      budget: { max_actions: contract.max_actions, max_seconds: contract.max_seconds },
      navigation,
      observation,
      next: 'Evaluate the live state, choose one action or a read-only batch, then observe the returned state delta',
    }, null, 2));
  } catch (error) {
    try { if (state) await request(state, '/close', {}, { timeoutMs: 5000 }); } catch { /* best effort */ }
    spawnSync(process.execPath, [
      RUN_MANIFEST, 'finish', runId, '--verdict', 'UNTEST',
      '--total-cases', '1', '--passed', '0', '--failed', '0', '--untested', '1',
    ], { cwd: dataDir, encoding: 'utf8', env: { ...process.env, QA_DATA_DIR: dataDir } });
    throw error;
  }
}

async function quickFinish(args) {
  const dataDir = dataDirFrom(args);
  const runId = runIdFrom(args);
  if (!runId) throw new Error('quick-finish requires <run-id>');
  const verdict = String(getArg(args, '--verdict', '') || '').trim().toUpperCase();
  if (!['PASS', 'FAILED', 'N/A', 'UNTEST'].includes(verdict)) {
    throw new Error('quick-finish requires --verdict PASS|FAILED|N/A|UNTEST');
  }
  const reason = String(getArg(args, '--reason', '') || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (verdict !== 'PASS' && !reason) throw new Error(`${verdict} quick task requires --reason`);
  const filePath = fastTaskFile(dataDir, runId);
  const contract = readJson(filePath, 'fast browser task');
  const manifest = spawnSync(process.execPath, [
    RUN_MANIFEST, 'finish', runId, '--verdict', verdict,
    '--total-cases', '1',
    '--passed', verdict === 'PASS' ? '1' : '0',
    '--failed', verdict === 'FAILED' ? '1' : '0',
    '--untested', verdict === 'UNTEST' ? '1' : '0',
  ], { cwd: dataDir, encoding: 'utf8', env: { ...process.env, QA_DATA_DIR: dataDir } });
  if (manifest.status !== 0) throw new Error(String(manifest.stderr || manifest.stdout || 'manifest finalize failed').trim());
  contract.status = verdict;
  contract.reason = reason || null;
  contract.finished_at = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  let closed = null;
  try {
    const state = await ensureState(dataDir, runId);
    closed = await request(state, '/close', {}, { timeoutMs: 30000 });
  } catch (error) {
    closed = { closed: false, reason: String(error?.message || error).slice(0, 500) };
  }
  console.log(JSON.stringify({ run_id: runId, verdict, reason: reason || null, task_file: filePath, closed }, null, 2));
}

async function command(args) {
  const verb = args[0] || 'help';
  if (verb === 'help' || verb === '--help' || verb === '-h') {
    console.log('native-browser-runtime: quick-start | quick-finish | start | health | observe | action | batch | recover | execute | close');
    return;
  }
  if (verb === 'quick-start') return quickStart(args);
  if (verb === 'quick-finish') return quickFinish(args);
  if (verb === 'start') return start(args);
  const dataDir = dataDirFrom(args);
  const runId = runIdFrom(args);
  const state = await ensureState(dataDir, runId);
  const workerId = Number.parseInt(getArg(args, '--worker-id', '1'), 10);
  if (verb === 'health') {
    console.log(JSON.stringify(await request(state, '/health', null, { method: 'GET' }), null, 2));
    return;
  }
  if (verb === 'observe') {
    console.log(JSON.stringify(await request(state, '/observe', {
      worker_id: workerId,
      page_id: getArg(args, '--page-id', ''),
      max_items: Number.parseInt(getArg(args, '--max-items', '80'), 10),
    }), null, 2));
    return;
  }
  if (verb === 'action') {
    const actionFile = getArg(args, '--action-file', '');
    const action = actionFile ? readJson(path.resolve(dataDir, actionFile), 'native action') : JSON.parse(getArg(args, '--action-json', '{}'));
    console.log(JSON.stringify(await request(state, '/action', {
      worker_id: workerId,
      page_id: getArg(args, '--page-id', ''),
      action,
    }), null, 2));
    return;
  }
  if (verb === 'batch') {
    const actionsFile = getArg(args, '--actions-file', '');
    const input = actionsFile ? readJson(path.resolve(dataDir, actionsFile), 'native action batch') : JSON.parse(getArg(args, '--actions-json', '[]'));
    const actions = Array.isArray(input) ? input : input.actions;
    console.log(JSON.stringify(await request(state, '/batch', {
      worker_id: workerId,
      actions,
    }, { timeoutMs: 120000 }), null, 2));
    return;
  }
  if (verb === 'recover') {
    console.log(JSON.stringify(await request(state, '/recover', {
      worker_id: workerId,
      page_id: getArg(args, '--page-id', ''),
      reason: getArg(args, '--reason', 'bounded recovery'),
      strategy: getArg(args, '--strategy', 'bounded'),
    }), null, 2));
    return;
  }
  if (verb === 'execute') {
    const assignmentsFile = getArg(args, '--assignments-file', '');
    if (!assignmentsFile) throw new Error('execute requires --assignments-file');
    const assignments = readJson(path.resolve(dataDir, assignmentsFile), 'native assignments');
    const normalized = Array.isArray(assignments) ? assignments : assignments.assignments;
    if (!Array.isArray(normalized)) throw new Error('assignments JSON must be an array or { assignments: [] }');
    console.log(JSON.stringify(await request(state, '/execute', { assignments: normalized }, { timeoutMs: 120000 }), null, 2));
    return;
  }
  if (verb === 'close' || verb === 'stop') {
    console.log(JSON.stringify(await request(state, '/close', {}, { timeoutMs: 30000 }), null, 2));
    return;
  }
  throw new Error(`unknown native browser runtime command: ${verb}`);
}

command(process.argv.slice(2)).catch(error => {
  console.error(`[native-browser-runtime] ${error.code || 'BLOCKED'}: ${error.message}`);
  process.exitCode = 2;
});
