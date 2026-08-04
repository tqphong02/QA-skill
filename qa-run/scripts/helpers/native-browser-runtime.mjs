#!/usr/bin/env node
/**
 * CLI client for the native qa-run browser daemon.
 *
 * Commands:
 *   start <run-id> --workers 1-4 [--headed] [--record-video]
 *   health <run-id>
 *   observe <run-id> --worker-id 1 [--page-id page-1]
 *   action <run-id> --worker-id 1 --action-file action.json
 *   recover <run-id> --worker-id 1 --reason "stale page"
 *   execute <run-id> --assignments-file assignments.json
 *   close <run-id>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePoolConfig } from '../../lib/native-browser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON = path.join(__dirname, 'native-browser-daemon.mjs');

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

function dataDirFrom(args) {
  return path.resolve(getArg(args, '--data-dir', process.env.QA_DATA_DIR || process.cwd()));
}

function runIdFrom(args) {
  const positional = args[1] && !String(args[1]).startsWith('-') ? args[1] : '';
  return slug(positional || getArg(args, '--run-id', ''));
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
  if (cdpUrl) childArgs.push('--cdp-url', cdpUrl);
  if (profileDir) childArgs.push('--profile-dir', profileDir);
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

async function start(args) {
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
        console.log(JSON.stringify({ reused: true, state: existing, health }, null, 2));
        return;
      } catch { /* stale state; a new daemon will replace it */ }
    }
  }
  const token = randomToken();
  const pid = spawnDaemon(args, { dataDir, runId, token, workers });
  const state = await waitForReady(filePath);
  const health = await request(state, '/health', null, { method: 'GET' });
  console.log(JSON.stringify({ started: true, pid, state, health }, null, 2));
}

async function command(args) {
  const verb = args[0] || 'help';
  if (verb === 'help' || verb === '--help' || verb === '-h') {
    console.log('native-browser-runtime: start | health | observe | action | recover | execute | close');
    return;
  }
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
