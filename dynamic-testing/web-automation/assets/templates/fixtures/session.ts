import path from 'path';
import fs from 'fs';

/**
 * Session Manager Template — quản lý session lifecycle cho tests.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project
 *   2. Dùng SessionManager để share state giữa các test
 *   3. Mỗi session có name → file riêng trong sessions/
 *
 * Use cases:
 *   - Lưu auth token share giữa UI và API test trong cùng run
 *   - Persist state across multiple test runs (vd: load user đã tạo hôm qua)
 *   - Debug khi fail: xem sessions/<NAME>.json biết test chạy đến đâu
 */

const SESSIONS_DIR = path.resolve(__dirname, '../sessions');

export type Session = Record<string, unknown>;

export class SessionManager {
  private readonly filePath: string;

  constructor(name: string) {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    this.filePath = path.join(SESSIONS_DIR, `${name}.json`);
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

/** Auth session — share giữa UI và API tests */
export const authSession = new SessionManager('auth');

/** Last run session — lưu data test gần nhất (debug) */
export const lastRunSession = new SessionManager('last-run');

/** Resource sessions — mỗi resource 1 session riêng */
export function resourceSession(resource: string): SessionManager {
  return new SessionManager(`resource-${resource}`);
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
    const filePath = path.join(SESSIONS_DIR, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > maxAgeMs) {
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