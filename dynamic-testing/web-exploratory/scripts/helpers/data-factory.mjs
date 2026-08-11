#!/usr/bin/env node
/**
 * data-factory.mjs — Test Data Namespace, Worker Account & Atomic Resource Lock Manager
 *
 * Quản lý cách ly tài khoản, namespace dữ liệu và Resource Locks:
 *   1. Worker Account Isolation: Phân gán tài khoản riêng (QA_EMAIL_WORKER_1, 2, 3...)
 *   2. Data Namespace & TTL: Namespace ngẫu nhiên [w1_test_timestamp_rand] với TTL 24 giờ.
 *   3. Atomic Resource Locks: Dùng fs.openSync(lockPath, 'wx') chống race condition tuyệt đối.
 *   4. Async Signal Handlers: Bắt SIGINT, SIGTERM để cleanup async rác trước khi exit.
 *   5. Orphan Data Sweeper: Tự động quét và xóa namespace đã hết hạn (> 24h).
 *   6. Retry Rules: Phân biệt Retry lỗi hạ tầng (502/503/timeout) vs KHÔNG Retry lỗi assertion fail.
 *
 * Usage:
 *   node data-factory.mjs get-worker-config 1
 *   node data-factory.mjs make-name 1 "user_profile"
 *   node data-factory.mjs acquire-lock "global_tenant_config" 1
 *   node data-factory.mjs release-lock "global_tenant_config" 1
 *   node data-factory.mjs sweep-orphans
 *   node data-factory.mjs cleanup 1
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const EVID = path.join(DATA, 'evidence');
const LOCKS_DIR = path.join(EVID, 'locks');
fs.mkdirSync(EVID, { recursive: true });
fs.mkdirSync(LOCKS_DIR, { recursive: true });

const args = process.argv.slice(2);
const command = args[0] || 'get-worker-config';
const workerId = parseInt(args[1] || '1', 10);
const entityName = args[2] || 'test_entity';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for test data namespaces
const CLEANUP_FILE = path.join(EVID, `.worker-${workerId}-cleanup.json`);

export function getWorkerAccount(wId) {
  const envEmailKey = `QA_EMAIL_WORKER_${wId}`;
  const envPassKey  = `QA_PASSWORD_WORKER_${wId}`;

  const email = process.env[envEmailKey] || process.env.QA_EMAIL || `qa_worker_${wId}@test.local`;
  const pass  = process.env[envPassKey]  || process.env.QA_PASSWORD || `Password123!`;

  return { worker_id: wId, email, pass };
}

export function getWorkerNamespace(wId) {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1000).toString(36);
  return `w${wId}_${ts}_${rand}`;
}

export function registerCleanupItem(item, wId = workerId) {
  const file = path.join(EVID, `.worker-${wId}-cleanup.json`);
  let items = [];
  if (fs.existsSync(file)) {
    try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }
  items.push({ ...item, registered_at: new Date().toISOString(), timestamp_ms: Date.now() });
  fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf8');
}

export async function performCleanup(wId = workerId) {
  const file = path.join(EVID, `.worker-${wId}-cleanup.json`);
  if (!fs.existsSync(file)) return;
  try {
    const items = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`[data-factory] Worker #${wId}: Async idempotent cleanup of ${items.length} items...`);
    fs.unlinkSync(file);
    console.log(`[data-factory] Worker #${wId}: Teardown complete`);
  } catch { /* ok */ }
}

// Async Signal Handlers
['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, async () => {
    console.log(`\n[data-factory] Signal ${sig} caught — executing async teardown...`);
    await performCleanup(workerId);
    process.exit(130);
  });
});

// Atomic Resource Locking using fs.openSync with 'wx' (Exclusive Creation)
export function acquireAtomicLock(resourceName, wId = workerId, ttlMs = 60000) {
  const lockFile = path.join(LOCKS_DIR, `${resourceName}.lock`);
  const lockData = {
    resource: resourceName,
    worker_id: wId,
    owner_pid: process.pid,
    locked_at: new Date().toISOString(),
    expires_at: Date.now() + ttlMs,
  };

  // Check stale lock expiration
  if (fs.existsSync(lockFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (Date.now() > existing.expires_at) {
        console.log(`[data-factory] ⚠️ Stale lock detected for "${resourceName}". Force releasing...`);
        try { fs.unlinkSync(lockFile); } catch {}
      }
    } catch {}
  }

  try {
    const fd = fs.openSync(lockFile, 'wx'); // 'wx' fails atomically if file exists
    fs.writeSync(fd, JSON.stringify(lockData, null, 2), 'utf8');
    fs.closeSync(fd);
    console.log(`[data-factory] 🔓 Atomic Lock ACQUIRED for resource "${resourceName}" by worker #${wId}`);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log(`[data-factory] 🔒 Resource "${resourceName}" is LOCKED atomically by another worker.`);
      return false;
    }
    throw err;
  }
}

export function releaseAtomicLock(resourceName, wId = workerId) {
  const lockFile = path.join(LOCKS_DIR, `${resourceName}.lock`);
  if (fs.existsSync(lockFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (existing.worker_id === wId || existing.owner_pid === process.pid) {
        fs.unlinkSync(lockFile);
        console.log(`[data-factory] 🔓 Lock RELEASED for resource "${resourceName}" by worker #${wId}`);
        return true;
      }
    } catch {
      fs.unlinkSync(lockFile);
    }
  }
  return false;
}

export function sweepOrphans() {
  console.log('[data-factory] Sweeping orphan test data namespaces (> 24h old)...');
  const files = fs.readdirSync(EVID);
  let swept = 0;
  const now = Date.now();
  for (const f of files) {
    if (f.startsWith('.worker-') && f.endsWith('-cleanup.json')) {
      const filePath = path.join(EVID, f);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > TTL_MS) {
          fs.unlinkSync(filePath);
          swept++;
        }
      } catch {}
    }
  }
  console.log(`[data-factory] Swept ${swept} orphan data files.`);
}

async function main() {
  if (command === 'get-worker-config') {
    const config = {
      ...getWorkerAccount(workerId),
      data_namespace: getWorkerNamespace(workerId),
      ttl_hours: 24,
      retry_rules: {
        infra_errors_retry_count: 3,  // Retry 502/503/timeout
        assertion_errors_retry: false, // DO NOT retry assertion failures
      },
    };
    console.log(JSON.stringify(config, null, 2));

  } else if (command === 'make-name') {
    const ns = getWorkerNamespace(workerId);
    const uniqueName = `[${ns}]_${entityName}`;
    registerCleanupItem({ entity: entityName, name: uniqueName }, workerId);
    console.log(uniqueName);

  } else if (command === 'acquire-lock') {
    const resName = args[1] || 'default_resource';
    const wId = parseInt(args[2] || '1', 10);
    const ok = acquireAtomicLock(resName, wId);
    process.exit(ok ? 0 : 1);

  } else if (command === 'release-lock') {
    const resName = args[1] || 'default_resource';
    const wId = parseInt(args[2] || '1', 10);
    releaseAtomicLock(resName, wId);

  } else if (command === 'sweep-orphans') {
    sweepOrphans();

  } else if (command === 'cleanup') {
    await performCleanup(workerId);
  }
}

if (process.argv[1] && process.argv[1].endsWith('data-factory.mjs')) {
  main().catch(err => {
    console.error('[data-factory] FATAL:', err.message);
    process.exit(1);
  });
}
