import path from 'path';
import fs from 'fs';

/**
 * Test Data Builder Template — GenericBuilder dùng Partial<T>.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project
 *   2. Dùng GenericBuilder<RESOURCE> cho mỗi resource type
 *   3. Mỗi step override field muốn, các field khác giữ default
 *
 * Ví dụ:
 *   const user = new GenericBuilderRESOURCE_MODEL({
 *     email: 'default@test.com',
 *     firstName: 'Test',
 *     lastName: 'User',
 *   })
 *     .with('email', 'specific@test.com')  // ← PartialRESOURCE_MODEL: chỉ override 1 field
 *     .build();
 *
 * Tại sao dùng Partial<T>?
 *   - Test data builder pattern chuẩn
 *   - Method `with(key, value)` chỉ nhận field có trong T (type-safe)
 *   - Default values giữ nguyên cho field không override
 */

// ─────────────────────────────────────────────────────────────
// GenericBuilder<T> — dùng Partial<T> cho fluent API
// ─────────────────────────────────────────────────────────────
export class GenericBuilder<T extends object> {
  private data: T;

  constructor(defaults: T) {
    this.data = { ...defaults };
  }

  /** Override 1 field — type-safe vì key phải là keyof T */
  with<K extends keyof T>(key: K, value: T[K]): this {
    this.data = { ...this.data, [key]: value };
    return this;
  }

  /** Override nhiều field cùng lúc — Partial<T> cho phép optional */
  withMany(partial: Partial<T>): this {
    this.data = { ...this.data, ...partial };
    return this;
  }

  /** Reset về defaults */
  reset(): this {
    this.data = { ...new GenericBuilder<T>(this.data).build() };
    return this;
  }

  /** Trả về object built */
  build(): T {
    // Deep clone để mutation sau không ảnh hưởng
    return JSON.parse(JSON.stringify(this.data)) as T;
  }

  /** Trả về Partial<T> — cho method nhận optional */
  buildPartial(): Partial<T> {
    return this.build();
  }
}

// ─────────────────────────────────────────────────────────────
// TestDataStore — persist data giữa các test runs (optional)
// ─────────────────────────────────────────────────────────────
const TESTDATA_DIR = path.resolve(__dirname, '../testdata');

export class TestDataStore {
  private readonly filePath: string;

  constructor(name: string) {
    if (!fs.existsSync(TESTDATA_DIR)) {
      fs.mkdirSync(TESTDATA_DIR, { recursive: true });
    }
    this.filePath = path.join(TESTDATA_DIR, `${name}.json`);
  }

  /** Save data để share giữa các test hoặc debug sau khi fail */
  save<T>(key: string, data: T): void {
    let all: Record<string, unknown> = {};
    if (fs.existsSync(this.filePath)) {
      all = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    }
    all[key] = data;
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  /** Load data đã save */
  load<T>(key: string): T | undefined {
    if (!fs.existsSync(this.filePath)) return undefined;
    const all = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    return all[key] as T;
  }

  /** Xóa 1 key */
  clear(key: string): void {
    if (!fs.existsSync(this.filePath)) return;
    const all = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    delete all[key];
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
  }

  /** Xóa tất cả data của store này */
  clearAll(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CleanupTracker — track resources cần xóa sau test
// ─────────────────────────────────────────────────────────────
export class CleanupTracker {
  private readonly resources: Array<{
    id: string;
    endpoint: string;
    apiBaseUrl: string;
    token: string;
  }> = [];

  /** Track 1 resource để cleanup sau */
  track(id: string, endpoint: string, apiBaseUrl: string, token: string): void {
    this.resources.push({ id, endpoint, apiBaseUrl, token });
  }

  /** Xóa hết resources đã track */
  async cleanupAll(deleteFn: (id: string, endpoint: string, token: string) => Promise<void>): Promise<void> {
    for (const r of this.resources) {
      try {
        await deleteFn(r.id, r.endpoint, r.token);
      } catch (e) {
        // Log nhưng không fail — best-effort cleanup
        console.warn(`Failed to cleanup ${r.endpoint}/${r.id}:`, e);
      }
    }
    this.resources.length = 0;
  }

  /** Số resources đang track */
  size(): number {
    return this.resources.length;
  }
}

// ─────────────────────────────────────────────────────────────
// Common generators — unique values cho test data
// ─────────────────────────────────────────────────────────────
export const generators = {
  /** Email unique theo timestamp */
  uniqueEmail(domain = 'example.com'): string {
    return `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
  },

  /** String unique */
  uniqueString(prefix = 'qa'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  },

  /** UUID */
  uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /** Random integer trong [min, max] */
  randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /** String với độ dài chính xác */
  stringOfLength(length: number, char = 'a'): string {
    return char.repeat(length);
  },
};

// ─────────────────────────────────────────────────────────────
// Ví dụ — GenericBuilder cho User
// ─────────────────────────────────────────────────────────────
//
// interface User {
//   email: string;
//   password: string;
//   firstName: string;
//   lastName: string;
//   phone?: string;
// }
//
// const userBuilder = new GenericBuilderRESOURCE_MODEL({
//   email: generators.uniqueEmail(),
//   password: 'P@ss123',
//   firstName: 'Test',
//   lastName: 'User',
// });
//
// const user1 = userBuilder.build();
// const user2 = userBuilder.with('email', 'specific@test.com').build();
// const user3 = userBuilder.withMany({ firstName: 'Override', phone: '0900000000' }).build();
//
// → Tất cả field đều type-safe, IntelliSense đầy đủ.