# Sessions Folder

> **Mục đích**: Lưu trữ session state (auth tokens, cookies, user context) giữa các test runs.

> **AI**: Folder này KHÔNG cần file template — chỉ cần `.gitkeep` để git track folder. Runtime sẽ tự sinh files JSON.

## Files sinh ra bởi runtime

| File | Tạo bởi | Mô tả |
|---|---|---|
| `auth-<run>-<project>-pN-wN.json` | `fixtures/auth.ts` | Storage state riêng cho một worker |
| `auth.<scope>.json` | `fixtures/session.ts` → `authSession` | Token/context trong cùng run + worker |
| `last-run.<scope>.json` | `fixtures/session.ts` → `lastRunSession` | Snapshot debug của worker |
| `resource-<name>.<scope>.json` | `fixtures/session.ts` → `resourceSession()` | Per-resource data của worker |

`<scope>` mặc định gồm run ID, project key, `TEST_PARALLEL_INDEX` và
`TEST_WORKER_INDEX` (hoặc PID ngoài Playwright). Vì vậy hai worker không cùng
read-modify-write một JSON file. Session này không dùng để truyền state giữa
workers; data cần chia sẻ phải đi qua backend có locking/ownership rõ ràng.

## Gitignore

Sessions folder PHẢI được gitignore (chứa secrets):

```gitignore
# .gitignore
sessions/*
!sessions/.gitkeep
!sessions/README.md
```

## Auto cleanup

Sessions cũ (>7 ngày) sẽ tự xóa qua `cleanupOldSessions(7)` ở `fixtures/session.ts`. Có thể trigger trong `globalSetup`:

```typescript
// playwright.config.ts
import { cleanupOldSessions } from './fixtures/session';

export default defineConfig({
  globalSetup: async () => {
    cleanupOldSessions(7);
  },
});
```

## Ví dụ sử dụng

```typescript
import { authSession, resourceSession } from '../../fixtures/session';

// Lưu auth token sau khi login
test('login then save session', async ({ request }) => {
  const token = await loginUser(request);
  authSession.set('accessToken', token);
  authSession.set('userId', 'user-123');
});

// Đọc auth token trong test khác (cùng run)
test('use saved token', async ({ request }) => {
  const token = authSession.get<string>('accessToken');
  expect(token).toBeDefined();
});

// Resource-specific session
const userSession = resourceSession('user');
userSession.set('lastCreatedId', 'abc-123');
```

Chỉ truyền namespace tường minh trong một coordinator process đã chứng minh
ownership; không dùng một namespace cố định cho các Playwright worker chạy song
song.
