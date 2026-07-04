# Testdata Folder

> **Mục đích**: Lưu trữ test data (seed users, mock responses, generated payloads) dùng chung giữa các test.

> **AI**: Folder này KHÔNG cần file template — chỉ cần `.gitkeep` để git track folder. Runtime sẽ tự sinh files JSON.

## Files sinh ra bởi runtime

| File | Tạo bởi | Mô tả |
|---|---|---|
| `users.json` | `TestDataStore('users')` | Danh sách user seed cho tests |
| `mock-responses.json` | `TestDataStore('mock')` | Mock response payloads |
| `generated.json` | `TestDataStore('generated')` | Generated data qua `generators` |
| `<custom>.json` | `TestDataStore('<name>')` | Bất kỳ custom data nào |

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
import { TestDataStore, generators } from '../../fixtures/test-data';

const userStore = new TestDataStore('users');

// Save generated user
test('create and save user', async ({ request, apiToken }) => {
  const user = {
    email: generators.uniqueEmail(),
    firstName: 'Test',
    lastName: 'User',
  };
  userStore.save(user.email, user);

  const res = await request.post('/api/users', { data: user, headers: { Authorization: `Bearer ${apiToken}` } });
  expect(res.status()).toBe(201);
});

// Load saved user trong test khác
test('use saved user', async () => {
  const savedUser = userStore.load<{ email: string }>('test-1@example.com');
  expect(savedUser?.firstName).toBe('Test');
});
```

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