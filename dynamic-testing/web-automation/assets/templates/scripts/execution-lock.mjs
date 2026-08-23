import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function ownerIsActive(owner) {
  if (!owner || owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid < 1) {
    return true;
  }
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function readOwner(lockPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function lockPathFor(projectRoot) {
  const resolved = path.resolve(projectRoot);
  const identity = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return path.join(os.tmpdir(), 'qa-playwright-execution-locks', `${digest}.lock`);
}

/**
 * Owns the fixed Playwright/Allure output paths for one project directory.
 * Playwright workers stay parallel inside the owner process; a second runner
 * must use another project root or wait until this lock is released.
 */
export function acquireExecutionLock(projectRoot, {
  runId = process.env.QA_RUN_ID ?? process.env.RUN_ID ?? `local-${process.pid}`,
  operation = 'playwright',
} = {}) {
  const lockPath = lockPathFor(projectRoot);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor;
    try {
      descriptor = fs.openSync(lockPath, 'wx');
      const token = randomUUID();
      const owner = {
        schema_version: 1,
        token,
        pid: process.pid,
        host: os.hostname(),
        run_id: String(runId),
        operation: String(operation),
        started_at: new Date().toISOString(),
      };
      fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, 'utf8');
      let released = false;
      return {
        path: lockPath,
        release() {
          if (released) return;
          released = true;
          try {
            fs.closeSync(descriptor);
          } finally {
            const current = readOwner(lockPath);
            if (current?.token === token) fs.rmSync(lockPath, { force: true });
          }
        },
      };
    } catch (error) {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* best effort */ }
        fs.rmSync(lockPath, { force: true });
      }
      if (error?.code !== 'EEXIST') throw error;

      const owner = readOwner(lockPath);
      if (owner && owner.host === os.hostname() && !ownerIsActive(owner)) {
        try {
          fs.rmSync(lockPath, { force: true });
          continue;
        } catch {
          // Another process may have replaced the stale lock; fail closed below.
        }
      }
      throw new Error(
        'BLOCKED: another Playwright execution owns this project output directory; '
        + 'keep parallelism inside one invocation or use an isolated project workspace',
      );
    }
  }

  throw new Error('BLOCKED: could not acquire the Playwright project execution lock');
}
