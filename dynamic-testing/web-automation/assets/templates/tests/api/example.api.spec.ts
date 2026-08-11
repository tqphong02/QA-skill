import { test, expect } from '../../fixtures/data-driven';
import { z } from 'zod';
import { allure } from 'allure-playwright';
import { ApiClient } from '../../fixtures/api-client';

// Schema mô tả contract mong đợi của User — validate mọi response dùng schema này.
const UserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string(),
});

/**
 * API test mẫu — tag @api:  npx playwright test --grep @api
 * Đặc điểm: request-level (không browser), validate schema, cleanup theo từng test.
 * Quy ước: dùng APIRequestContext (qua ApiClient), KHÔNG dùng axios.
 */
test.describe('Users API @api', () => {
  test('POST /users tạo user mới (auth)', async ({ authenticatedApi, testData }) => {
    allure.severity('critical');
    allure.feature('Users API');
    allure.story('Create user');

    const payload = {
      email: testData.uniqueEmail(),
      name: testData.uniqueString('qa-user'),
    };
    let createdId: string | number | undefined;

    try {
      await allure.step('POST /users với valid payload', async () => {
        const res = await authenticatedApi.post('/users', payload);
        expect(res.status()).toBe(201);
        const user = ApiClient.validate(UserSchema, await res.json());
        expect(user.email).toBe(payload.email);
        createdId = user.id;
      });
    } finally {
      if (createdId !== undefined) {
        await authenticatedApi.delete(`/users/${createdId}`);
      }
    }
  });

  test('GET /users trả list (auth)', async ({ authenticatedApi }) => {
    allure.severity('normal');
    allure.feature('Users API');
    allure.story('List users');

    await allure.step('GET /users với valid token', async () => {
      const res = await authenticatedApi.get('/users');
      expect(res.status()).toBe(200);
      const list = await res.json() as unknown[];
      expect(Array.isArray(list)).toBe(true);
    });
  });

  test('negative — không token → 401', async ({ request }) => {
    allure.severity('normal');
    allure.feature('Users API');
    allure.story('Unauthorized access');

    await allure.step('GET /users WITHOUT token', async () => {
      const api = new ApiClient(request, process.env.API_BASE_URL ?? 'http://localhost:3000');
      const res = await api.get('/users'); // KHÔNG truyền token
      expect(res.status()).toBe(401);
    });
  });
});
