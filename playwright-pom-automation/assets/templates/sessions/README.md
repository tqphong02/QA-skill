# Sessions Folder

> **Mục đích**: Lưu trữ session state (auth tokens, cookies, user context) giữa các test runs.

> **AI**: Folder này KHÔNG cần file template — chỉ cần `.gitkeep` để git track folder. Runtime sẽ tự sinh files JSON.

## Files sinh ra bởi runtime

| File | Tạo bởi | Mô tả |
|---|---|---|
| `auth.json` | `fixtures/auth.ts` → `setupStorageState()` | Storage state sau khi login (cookies + localStorage) |
| `auth-storage.json` | `fixtures/auth.ts` | Playwright storageState format |
| `last-run.json` | `fixtures/session.ts` → `lastRunSession` | Snapshot của test run gần nhất (debug) |
| `resource-<name>.json` | `fixtures/session.ts` → `resourceSession()` | Per-resource session data |

## Gitignore

Sessions folder PHẢI được gitignore (chứa secrets):

```gitignore
# .gitignore
sessions/*.json
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