import { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';

/**
 * ApiClient — wrapper quanh Playwright APIRequestContext.
 * Dùng THAY axios (trừ khi project đã phụ thuộc axios).
 *
 * Việc của spec: gọi method → expect(res.status()) + ApiClient.validate(schema, body).
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
  ) {}

  private headers(token?: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  get(path: string, token?: string): Promise<APIResponse> {
    return this.request.get(`${this.baseUrl}${path}`, { headers: this.headers(token) });
  }

  post(path: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.request.post(`${this.baseUrl}${path}`, { headers: this.headers(token), data: body });
  }

  put(path: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.request.put(`${this.baseUrl}${path}`, { headers: this.headers(token), data: body });
  }

  patch(path: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.request.patch(`${this.baseUrl}${path}`, { headers: this.headers(token), data: body });
  }

  delete(path: string, token?: string): Promise<APIResponse> {
    return this.request.delete(`${this.baseUrl}${path}`, { headers: this.headers(token) });
  }

  /**
   * Validate response body theo zod schema — fail fast khi contract drift.
   *   const user = ApiClient.validate(UserSchema, await res.json());
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Schema validation failed:\n${parsed.error.toString()}`);
    }
    return parsed.data;
  }
}
