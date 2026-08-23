import path from 'path';
import fs from 'fs';

/**
 * Session Manager Template — quản lý session lifecycle cho tests.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project
 *   2. Dùng SessionManager để share state trong cùng Playwright worker
 *   3. Mỗi session có name + run/worker namespace → file riêng trong sessions/
 *
 * Use cases:
 *   - Lưu auth token share giữa các bước trong cùng worker
 *   - Persist state across multiple test runs (vd: load user đã tạo hôm qua)
 *   - Debug khi fail: xem sessions/<NAME>.json biết test chạy đến đâu
 */

const SESSIONS_DIR = path.resolve(__dirname, '../sessions');

export type Session = Record<string, unknown>;

function safeFileSegment(value: string, maxLength = 120): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'default';
}

/** Stable inside one worker process and isolated from other runs/workers. */
export function defaultSessionNamespace(): string {
  const runId = process.env.QA_RUN_ID ?? process.env.RUN_ID ?? `local-${process.pid}`;
  const project = process.env.QA_PROJECT_KEY ?? 'default';
  const parallelIndex = process.env.TEST_PARALLEL_INDEX ?? `pid-${process.pid}`;
  const workerIndex = process.env.TEST_WORKER_INDEX;
  return [
    safeFileSegment(runId),
    safeFileSegment(project),
    `p${safeFileSegment(parallelIndex)}`,
    workerIndex === undefined ? null : `w${safeFileSegment(workerIndex)}`,
  ].filter((value): value is string => Boolean(value)).join('-');
}

export class SessionManager {
  private readonly filePath: string;

  constructor(name: string, namespace = defaultSessionNamespace()) {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    this.filePath = path.join(
      SESSIONS_DIR,
      `${safeFileSegment(name)}.${safeFileSegment(namespace)}.json`,
    );
  }

  /** Load session từ file (return undefined nếu chưa có) */
  load(): Session | undefined {
    if (!fs.existsSync(this.filePath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return undefined;
    }
  }

  /** Save session vào file */
  save(session: Session): void {
    fs.writeFileSync(this.filePath, JSON.stringify(session, null, 2));
  }

  /** Merge thêm keys vào session hiện tại */
  update(partial: Session): Session {
    const current = this.load() ?? {};
    const merged = { ...current, ...partial };
    this.save(merged);
    return merged;
  }

  /** Get 1 key */
  get<T>(key: string): T | undefined {
    return this.load()?.[key] as T | undefined;
  }

  /** Set 1 key */
  set<T>(key: string, value: T): void {
    this.update({ [key]: value });
  }

  /** Xóa 1 key */
  unset(key: string): void {
    const current = this.load() ?? {};
    delete current[key];
    this.save(current);
  }

  /** Xóa toàn bộ session */
  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }

  /** Check session có tồn tại không */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /** Đường dẫn file session */
  get path(): string {
    return this.filePath;
  }
}

// ─────────────────────────────────────────────────────────────
// Common sessions — pattern cho project
// ─────────────────────────────────────────────────────────────

/** Auth session — scoped to the current run and Playwright worker */
export const authSession = new SessionManager('auth');

/** Last run session — worker-local debug snapshot */
export const lastRunSession = new SessionManager('last-run');

/** Resource sessions — isolated by default; pass a namespace only for intentional sharing */
export function resourceSession(resource: string, namespace?: string): SessionManager {
  return new SessionManager(`resource-${resource}`, namespace);
}

// ─────────────────────────────────────────────────────────────
// Auto-cleanup — xóa session cũ (> N ngày)
// ─────────────────────────────────────────────────────────────
export function cleanupOldSessions(maxAgeDays = 7): number {
  if (!fs.existsSync(SESSIONS_DIR)) return 0;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const file of fs.readdirSync(SESSIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(SESSIONS_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      removed++;
    }
  }
  return removed;
}

// ─────────────────────────────────────────────────────────────
// Ví dụ sử dụng
// ─────────────────────────────────────────────────────────────
//
// // Lưu auth token
// authSession.set('token', 'eyJhbG...');
// authSession.set('userId', 'user-123');
//
// // Đọc auth token trong test khác
// const token = authSession.get<string>('token');
//
// // Lưu data của resource test
// const userSession = resourceSession('user');
// userSession.set('lastCreatedId', 'user-abc');
//
// // Debug: xem session sau khi test fail
// console.log('Auth session path:', authSession.path);
//
// // Cleanup session cũ
// const removed = cleanupOldSessions(7);
// console.log(`Removed ${removed} old sessions`);
