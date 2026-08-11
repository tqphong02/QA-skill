import { expect, test } from '@playwright/test';
import { z } from 'zod';

const baseURL = process.env.API_BASE_URL;
const HealthSchema = z.object({ status: z.string() });

test.describe('API contract @api @contract', () => {
  test.skip(!baseURL, 'Set API_BASE_URL');

  test('GET /api/health matches the confirmed contract', async ({ request }) => {
    const response = await request.get(`${baseURL}/api/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const parsed = HealthSchema.safeParse(await response.json());
    expect(parsed.error?.issues ?? []).toEqual([]);
  });
});
