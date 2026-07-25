import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { allure } from 'allure-playwright';
import { ApiClient } from '../../fixtures/api-client';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

// Schema mô tả contract mong đợi của User — validate mọi response dùng schema này.
const UserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string(),
});

/**
 * API test mẫu — tag @api:  npx playwright test --grep @api
 * Đặc điểm: request-level (không browser), validate schema, cleanup trong afterAll.
 * Quy ước: dùng APIRequestContext (qua ApiClient), KHÔNG dùng axios.
 */
test.describe('Users API @api', () => {
  let api: ApiClient;
  let token: string;
  let createdId: string | number | undefined;

  test.beforeAll(async ({ request }) => {
    api = new ApiClient(request, BASE);
    // Login 1 lần, share token cho cả describe
    const res = await api.post('/auth/login', {
      email: process.env['TEST_USER'],
      password: process.env['TEST_PASS'],
    });
    expect(res.status()).toBe(200);
    token = (await res.json() as { accessToken: string }).accessToken;
  });

  test.afterAll(async () => {
    // Cleanup — KHÔNG để data rác
    if (createdId !== undefined) {
      await api.delete(`/users/${createdId}`, token);
    }
  });

  test('POST /users tạo user mới (auth)', async () => {
    allure.severity('critical');
    allure.feature('Users API');
    allure.story('Create user');

    const payload = { email: `qa-${Date.now()}@example.com`, name: 'QA Test' };

    await allure.step('POST /users với valid payload', async () => {
      const res = await api.post('/users', payload, token);
      expect(res.status()).toBe(201);
      const user = ApiClient.validate(UserSchema, await res.json());
      expect(user.email).toBe(payload.email);
      createdId = user.id; // lưu để cleanup
    });
  });

  test('GET /users trả list (auth)', async () => {
    allure.severity('normal');
    allure.feature('Users API');
    allure.story('List users');

    await allure.step('GET /users với valid token', async () => {
      const res = await api.get('/users', token);
      expect(res.status()).toBe(200);
      const list = await res.json() as unknown[];
      expect(Array.isArray(list)).toBe(true);
    });
  });

  test('negative — không token → 401', async () => {
    allure.severity('normal');
    allure.feature('Users API');
    allure.story('Unauthorized access');

    await allure.step('GET /users WITHOUT token', async () => {
      const res = await api.get('/users'); // KHÔNG truyền token
      expect(res.status()).toBe(401);
    });
  });
});
