# Testdata Folder

> **Mục đích**: Lưu runtime-generated data để debug hoặc handoff giữa các bước có ownership rõ ràng.

> **AI**: Folder này KHÔNG cần file template — chỉ cần `.gitkeep` để git track folder. Runtime sẽ tự sinh files JSON.
>
> Case rows typed/read-only phải đặt trong `test-data/cases/`, không đặt ở folder runtime này.

## Files sinh ra bởi runtime

| File | Tạo bởi | Mô tả |
|---|---|---|
| `users.<namespace>.json` | `TestDataStore('users', namespace)` | User data thuộc một test attempt |
| `mock.<namespace>.json` | `TestDataStore('mock', namespace)` | Mock payload thuộc một test attempt |
| `generated.<namespace>.json` | `TestDataStore('generated', namespace)` | Generated data thuộc một test attempt |

Không để nhiều worker read-modify-write cùng một JSON. Khi chạy parallel, luôn truyền `testData.namespace`.

## Gitignore

Testdata folder có thể chứa test-only data (không phải secrets nhưng cũng không cần commit):

```gitignore
# .gitignore
testdata/*.json
!testdata/.gitkeep
!testdata/README.md
```

Hoặc commit một số file mẫu (vd: `seed-users.json`) nếu team muốn share data:

```gitignore
testdata/*.json
!testdata/.gitkeep
!testdata/README.md
!testdata/seed-*.json  # commit các file seed
```

## Ví dụ sử dụng

```typescript
import { test, expect } from '../../fixtures/data-driven';
import { TestDataStore } from '../../fixtures/test-data';

// Save generated user
test('create and save user', async ({ request, apiToken, testData }) => {
  const userStore = new TestDataStore('users', testData.namespace);
  const user = {
    email: testData.uniqueEmail(),
    firstName: 'Test',
    lastName: 'User',
  };
  userStore.save(user.email, user);

  const res = await request.post('/api/users', { data: user, headers: { Authorization: `Bearer ${apiToken}` } });
  expect(res.status()).toBe(201);
});
```

Không phụ thuộc một test khác để load file này. Nếu một business flow cần create → use, giữ các bước trong cùng test hoặc worker-owned fixture và cleanup theo exact resource ID.

## Seed data (optional)

Nếu muốn share seed data giữa team, tạo file `seed-users.json` (commit vào git):

```json
{
  "admin@test.com": {
    "email": "admin@test.com",
    "password": "Admin@123",
    "role": "admin"
  },
  "user@test.com": {
    "email": "user@test.com",
    "password": "User@123",
    "role": "user"
  }
}
```

→ Load trong test: `userStore.load('admin@test.com')`.
