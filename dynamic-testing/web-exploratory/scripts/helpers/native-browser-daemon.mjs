#!/usr/bin/env node
/**
 * Loopback daemon for the native dynamic-web-exploratory browser runtime.
 *
 * The daemon keeps one isolated Playwright session per worker alive between
 * observe/action/recover commands. It binds only to 127.0.0.1 and requires an
 * ephemeral token written to a mode-0600 run-state file. It never exposes
 * cookies, storage state or application credentials through the API.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeBrowserPool, validatePoolConfig } from '../../lib/native-browser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

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

function positiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/([?&][^=\s]+)=([^&#\s]+)/g, '$1=<redacted>')
    .slice(0, 1200);
}

function parseBody(request, { maxBytes = 2_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        reject(Object.assign(new Error('request body is too large'), { code: 'REQUEST_TOO_LARGE' }));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) return resolve({});
      try { return resolve(JSON.parse(body)); } catch {
        return reject(Object.assign(new Error('request body must be valid JSON'), { code: 'INVALID_JSON' }));
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, statusCode, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function statePath(dataDir, runId) {
  return path.join(dataDir, 'evidence', 'native-browser', slug(runId), 'daemon.json');
}

function writeState(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try { fs.chmodSync(filePath, 0o600); } catch { /* Windows/readonly filesystems */ }
}

async function main() {
  const args = process.argv.slice(2);
  if (!hasArg(args, '--daemon')) {
    console.error('native-browser-daemon is an internal process; use native-browser-runtime.mjs');
    process.exitCode = 2;
    return;
  }
  const dataDir = path.resolve(getArg(args, '--data-dir', process.env.QA_DATA_DIR || process.cwd()));
  const runId = slug(getArg(args, '--run-id', ''));
  if (!runId) throw new Error('--run-id is required');
  const workers = positiveInt(getArg(args, '--workers', '1'));
  validatePoolConfig({ workers });
  const token = String(process.env.QA_NATIVE_DAEMON_TOKEN || '').trim();
  if (token.length < 24) throw new Error('QA_NATIVE_DAEMON_TOKEN must be an ephemeral token of at least 24 characters');
  const filePath = statePath(dataDir, runId);
  const startedAt = new Date().toISOString();
  let pool;
  let server;
  let closing = false;
  let state = {
    schema_version: 1,
    status: 'STARTING',
    run_id: runId,
    workers,
    host: '127.0.0.1',
    port: null,
    pid: process.pid,
    started_at: startedAt,
    updated_at: startedAt,
    token,
    data_dir: dataDir,
    runtime: 'playwright-native',
    browser_use_dependency: false,
  };
  writeState(filePath, state);

  const close = async (reason = 'shutdown') => {
    if (closing) return;
    closing = true;
    // Browser/context shutdown can occasionally wait forever on a stale
    // Playwright child process. Keep daemon shutdown bounded so a completed QA
    // run cannot leave an invisible Node/browser process alive indefinitely
    try {
      await Promise.race([
        Promise.resolve().then(() => pool?.close()).catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ]);
    } catch { /* preserve shutdown */ }
    try { server?.close(); } catch { /* already closed */ }
    state = {
      ...state,
      status: 'CLOSED',
      reason,
      updated_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      token,
    };
    writeState(filePath, state);
    // Keep this short timer referenced so process exit is guaranteed even if a
    // browser transport left another active handle behind
    setTimeout(() => process.exit(0), 20);
  };
  process.once('SIGTERM', () => { close('SIGTERM'); });
  process.once('SIGINT', () => { close('SIGINT'); });

  pool = await createNativeBrowserPool({
    runId,
    poolId: runId,
    dataDir,
    workers,
    headless: !hasArg(args, '--headed'),
    cdpUrl: getArg(args, '--cdp-url', process.env.QA_CDP_URL || ''),
    profileDir: getArg(args, '--profile-dir', process.env.QA_BROWSER_PROFILE_DIR || ''),
    recordVideo: hasArg(args, '--record-video'),
    allowedOrigins: getArg(args, '--allowed-origin', ''),
  });

  server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const suppliedToken = String(request.headers['x-qa-native-token'] || '');
    if (suppliedToken !== token) {
      writeJson(response, 401, { ok: false, code: 'UNAUTHORIZED' });
      return;
    }
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        writeJson(response, 200, { ok: true, runtime: 'playwright-native', ...pool.health() });
        return;
      }
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
        return;
      }
      const payload = await parseBody(request);
      const workerId = positiveInt(payload.worker_id, 1);
      const worker = pool.getWorker(workerId);
      let result;
      if (requestUrl.pathname === '/observe') {
        result = await worker.observe({
          pageId: payload.page_id,
          maxItems: payload.max_items,
          maxChars: payload.max_chars,
          detail: payload.detail || 'compact',
        });
      } else if (requestUrl.pathname === '/action') {
        result = await worker.performAction({ ...payload.action, page_id: payload.page_id || payload.action?.page_id });
      } else if (requestUrl.pathname === '/batch') {
        result = await worker.performReadOnlyBatch(payload.actions || []);
      } else if (requestUrl.pathname === '/recover') {
        result = await worker.recover({ pageId: payload.page_id, reason: payload.reason, strategy: payload.strategy });
      } else if (requestUrl.pathname === '/execute') {
        result = await pool.runAssignments(payload.assignments || []);
      } else if (requestUrl.pathname === '/close') {
        result = { closed: true, run_id: runId };
        writeJson(response, 200, { ok: true, result });
        await close('client_close');
        return;
      } else {
        writeJson(response, 404, { ok: false, code: 'NOT_FOUND' });
        return;
      }
      writeJson(response, 200, { ok: true, result });
    } catch (error) {
      writeJson(response, 409, {
        ok: false,
        code: error.code || 'NATIVE_RUNTIME_ERROR',
        error: safeError(error),
        attempts: error.attempts || undefined,
        safety: error.safety || undefined,
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(positiveInt(getArg(args, '--port', '0'), 0), '127.0.0.1', resolve);
  });
  const address = server.address();
  state = {
    ...state,
    status: 'READY',
    port: typeof address === 'object' && address ? address.port : null,
    updated_at: new Date().toISOString(),
    health_url: `http://127.0.0.1:${address.port}/health`,
  };
  writeState(filePath, state);
  // Keep this process alive through the HTTP server. The state file is the
  // client-facing discovery mechanism; no port is exposed outside loopback.
}

main().catch(error => {
  const args = process.argv.slice(2);
  const dataDir = path.resolve(getArg(args, '--data-dir', process.env.QA_DATA_DIR || process.cwd()));
  const runId = slug(getArg(args, '--run-id', 'native-run'));
  const filePath = statePath(dataDir, runId);
  try {
    writeState(filePath, {
      schema_version: 1,
      status: 'FAILED',
      run_id: runId,
      pid: process.pid,
      updated_at: new Date().toISOString(),
      error: safeError(error),
      runtime: 'playwright-native',
      browser_use_dependency: false,
    });
  } catch { /* no state path available */ }
  console.error(`[native-browser-daemon] ${safeError(error)}`);
  process.exitCode = 1;
});
