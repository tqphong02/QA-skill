# TypeScript Patterns cho Playwright Test Automation

> Companion to `SKILL.md`. Read this khi cần dùng utility types trong test code.
> KHÔNG chỉ `readonly` — TypeScript có nhiều utility types, mỗi cái phù hợp context khác nhau.

## TOC
1. Tại sao TypeScript quan trọng cho test code
2. `readonly` — immutable properties
3. `ReadonlyArray<T>` — immutable collections
4. `Partial<T>` — optional fields (test data builders)
5. `Required<T>` — bỏ optional
6. `Pick<T, K>` — chỉ lấy field cần thiết
7. `Omit<T, K>` — bỏ field không cần
8. `Record<K, V>` — map lookup tables
9. `ReturnType<T>` / `Parameters<T>` — derive từ function
10. `Awaited<T>` — unwrap Promise
11. `NonNullable<T>` — loại null/undefined
12. `Extract<T, U>` / `Exclude<T, U>` — union type filtering
13. Discriminated unions — type-safe test data
14. Anti-patterns

---

## 1. Tại sao TypeScript quan trọng cho test code?

| Lợi ích | Ví dụ |
|---|---|
| **Catch bug sớm** ở compile time | `submitButton.click("hello")` → lỗi ngay |
| **Autocomplete** trong IDE | Gõ `loginPage.` → IDE list methods |
| **Refactor an toàn** | Đổi tên method → tất cả caller báo lỗi |
| **Documentation tự động** | Type là doc — biết method nhận gì, trả gì |
| **Giảm `any`** → không silent bug | Strict mode ép khai báo rõ ràng |

**Nguyên tắc**: viết test cũng là viết code production — type safety quan trọng không kém.

---

## 2. `readonly` — immutable properties

**Dùng khi**: property không bao giờ reassign sau khi khởi tạo (locators, page reference).

```typescript
export class LoginPage extends BasePage {
  private readonly locs: Readonly<LoginLocators>;

  constructor(page: Page) {
    super(page);
    this.locs = buildLoginLocators(page); // init 1 lần
  }

  // ❌ Nếu không readonly, có thể reassign từ ngoài (trong class)
  // this.locs = buildLoginLocators(newPage); // bug!
}
```

**Strict mode bắt buộc**: `strictPropertyInitialization: true` trong tsconfig.json.

---

## 3. `ReadonlyArray<T>` — immutable collections

**Dùng khi**: danh sách element, locators fallback, expected errors,...

```typescript
// Fallback chain — không ai được push/pop
const fallbackLocators: ReadonlyArray<Locator> = [
  page.getByTestId('login-submit'),
  page.locator('#login-btn'),
  page.getByText('Đăng nhập', { exact: true }),
];

// Expected error codes — danh sách fix cứng
const EXPECTED_ERROR_CODES: ReadonlyArray<string> = [
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'EMAIL_NOT_VERIFIED',
];

// ❌ EXPECTED_ERROR_CODES.push('NEW_CODE'); // TS error
```

---

## 4. `Partial<T>` — optional fields (test data builders)

**Dùng khi**: builder pattern cho test data — mỗi step override 1 field.

```typescript
interface UserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

// Builder — mỗi method nhận Partial, chỉ cần override field muốn đổi
class UserBuilder {
  private data: UserData = {
    email: 'default@test.com',
    password: 'P@ss123',
    firstName: 'Default',
    lastName: 'User',
    phone: '0900000000',
  };

  withEmail(email: string): this {
    this.data = { ...this.data, email }; // Partial<UserData> inferred
    return this;
  }

  withPassword(p: string): this {
    this.data = { ...this.data, password: p };
    return this;
  }

  build(): UserData {
    return this.data;
  }
}

// Dùng:
const user = new UserBuilder()
  .withEmail('specific@test.com')
  .build();
// → email = 'specific@test.com', các field khác = default
```

---

## 5. `Required<T>` — bỏ optional

**Dùng khi**: bạn có type với field optional, nhưng context này bắt buộc phải có.

```typescript
interface ApiResponse {
  data?: UserData;
  error?: { code: string; message: string };
  status: number;
}

// Trong success path, data bắt buộc có
function processSuccess(res: ApiResponse): UserData {
  const data: Required<ApiResponse>['data'] = res.data;
  if (!data) throw new Error('Expected data in success response');
  return data;
}
```

---

## 6. `Pick<T, K>` — chỉ lấy field cần thiết

**Dùng khi**: method chỉ cần 1-2 field từ object lớn → API rõ ràng hơn.

```typescript
interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  role: 'admin' | 'user';
}

// ❌ Pick cả object → caller phải biết field nào dùng, field nào bỏ
async function login(user: User): Promise<void> { ... }

// ✅ Pick chỉ field cần → API self-documenting
async function login(creds: Pick<User, 'email' | 'password'>): Promise<void> {
  // chỉ cần 2 field
}

// Caller:
login({ email: 'a@b.com', password: 'pwd' }); // OK
login({ email: 'a@b.com' }); // ❌ TS error — thiếu password
```

**Common patterns trong test code**:
```typescript
type Credentials = Pick<User, 'email' | 'password'>;
type PublicProfile = Pick<User, 'id' | 'firstName' | 'lastName' | 'role'>;
type CreateUserPayload = Pick<User, 'email' | 'firstName' | 'lastName' | 'phone'>;
```

---

## 7. `Omit<T, K>` — bỏ field không cần

**Dùng khi**: cần type gần giống T nhưng bỏ field nhạy cảm (password) hoặc auto-generated (id).

```typescript
// User có password — không muốn log ra
type SafeUser = Omit<User, 'password'>;

// User input tạo mới — id, createdAt do server gen
type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;

// Update user — tất cả field optional trừ id
type UpdateUserInput = Partial<Omit<User, 'id'>>;
```

---

## 8. `Record<K, V>` — map lookup tables

**Dùng khi**: cần map key → value (priority mapping, role permission, error code → message).

```typescript
// Map priority → số để sort
const PRIORITY_WEIGHT: Record<'High' | 'Medium' | 'Low', number> = {
  High: 1,
  Medium: 2,
  Low: 3,
};

// Map role → permissions
const ROLE_PERMISSIONS: Record<UserRole, ReadonlyArray<Permission>> = {
  admin: ['read', 'write', 'delete'],
  user: ['read'],
  guest: [],
};

// Map error code → expected UI message (i18n)
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa',
  EMAIL_NOT_VERIFIED: 'Vui lòng xác minh email',
};
```

---

## 9. `ReturnType<T>` / `Parameters<T>` — derive từ function

**Dùng khi**: muốn lấy type trả về / parameter của function mà không cần khai báo lại.

```typescript
// Derive LoginLocators từ factory — đã có ở login.selectors.ts
export const buildLoginLocators = (page: Page) => ({ ... });
export type LoginLocators = ReturnType<typeof buildLoginLocators>;

// Derive parameter type — khi function signature thay đổi, type tự update
export const loginAction = async (page: Page, email: string, pwd: string) => { ... };
type LoginActionParams = Parameters<typeof loginAction>;
// → [Page, string, string]
```

---

## 10. `Awaited<T>` — unwrap Promise

**Dùng khi**: type function trả Promise, muốn lấy kiểu dữ liệu bên trong.

```typescript
async function fetchUser(): Promise<User> { ... }

type FetchedUser = Awaited<ReturnType<typeof fetchUser>>; // = User

// Hữu ích cho fixture return type
const test = base.extend<{
  authenticatedPage: Awaited<ReturnType<typeof loginAs>>;
}>({ ... });
```

---

## 11. `NonNullable<T>` — loại null/undefined

**Dùng khi**: đã check null/undefined, muốn type narrowing.

```typescript
function getError(message: string | null | undefined): string {
  // Sau khi check, TS tự narrow — không cần NonNullable
  if (!message) throw new Error('No message');
  return message; // type: string
}

// Nhưng khi combine với utility khác:
type RequiredError = NonNullable<ApiResponse['error']>;
// → { code: string; message: string }
```

---

## 12. `Extract<T, U>` / `Exclude<T, U>` — union type filtering

**Dùng khi**: lọc union type.

```typescript
type Status = 'pending' | 'success' | 'error' | 'cancelled';
type ActiveStatus = Extract<Status, 'pending' | 'success'>;
// → 'pending' | 'success'

type InactiveStatus = Exclude<Status, 'pending' | 'success'>;
// → 'error' | 'cancelled'

// Test: chỉ test 2 status active
const testCases: ReadonlyArray<{ status: ActiveStatus }> = [
  { status: 'pending' },
  { status: 'success' },
];
```

---

## 13. Discriminated unions — type-safe test data

**Dùng khi**: test data có nhiều variant với field khác nhau — TS narrowing giúp type-safe.

```typescript
interface LoginHappyData {
  type: 'happy';
  email: string;
  password: string;
  expectedUrl: RegExp;
}

interface LoginNegativeData {
  type: 'negative';
  email: string;
  password: string;
  expectedError: RegExp;
}

interface LoginValidationData {
  type: 'validation';
  email: string;
  password: string;
  submitDisabled: boolean;
}

type LoginTestData = LoginHappyData | LoginNegativeData | LoginValidationData;

// TS narrowing theo discriminator `type`
function runLoginTest(data: LoginTestData) {
  // ... dùng data.expectedUrl chỉ work khi type === 'happy'
}
```

---

## 14. Anti-patterns

| Anti-pattern | Vấn đề | Fix |
|---|---|---|
| Dùng `any` cho test data | Silent bug, IDE không gợi ý | Define interface đầy đủ |
| Không dùng `Pick`/`Omit` | Method nhận cả object, caller không biết field nào dùng | Pick/Omit cho API rõ ràng |
| `as` cast lung tung | Mất type safety | Đúng type ngay từ đầu |
| `Record<string, any>` | Không khác gì `any` | `Record<UnionKey, TypedValue>` |
| Optional chaining `?.` khắp nơi | Che giấu bug | Đúng type với `Required<T>` / `NonNullable<T>` |
| `// @ts-ignore` | Tắt TS cho cả dòng | Fix root cause |
| Không readonly locator | Có thể reassign → bug khó trace | `private readonly locs` |

---

## 15. Quick reference — khi nào dùng gì

| Tình huống | Type dùng |
|---|---|
| Locator không reassign | `private readonly locs` + `Readonly<LoginLocators>` |
| Danh sách element không mutate | `ReadonlyArray<T>` |
| Builder test data, mỗi step override | `Partial<T>` |
| Lấy 1-2 field từ object lớn | `Pick<T, K>` |
| Bỏ field nhạy cảm (password) | `Omit<T, 'password'>` |
| Map key → value | `Record<K, V>` |
| Derive type từ function | `ReturnType<typeof fn>` / `Parameters<typeof fn>` |
| Unwrap Promise | `Awaited<T>` |
| Lọc union type | `Extract<T, U>` / `Exclude<T, U>` |
| Test data nhiều variant | Discriminated unions với `type` field |

---

## 16. tsconfig.json ngắn gọn cho test code

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

Full template: xem `assets/templates/tsconfig.json` ở skill root.