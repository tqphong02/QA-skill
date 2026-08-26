import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { z } from 'zod';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ApiRequestRecord = Readonly<{
  method: ApiMethod;
  path: string;
  url: string;
}>;

export type ApiQueryValue = string | number | boolean;
export type ApiFetchOptions = Readonly<{
  headers?: Record<string, string>;
  query?: Record<string, ApiQueryValue>;
  body?: unknown;
}>;

/**
 * ApiClient — wrapper quanh Playwright APIRequestContext.
 * Dùng THAY axios (trừ khi project đã phụ thuộc axios).
 *
 * Việc của spec: gọi method → expect(res.status()) + ApiClient.validate(schema, body).
 */
export class ApiClient {
  private latestRequest: ApiRequestRecord | null = null;

  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
    private readonly defaultToken?: string,
  ) {}

  private requestUrl(requestPath: string): string {
    if (!requestPath.startsWith('/')) {
      throw new Error(`API path must start with /: ${requestPath}`);
    }
    return `${this.baseUrl.replace(/\/+$/, '')}${requestPath}`;
  }

  private record(method: ApiMethod, requestPath: string): string {
    const url = this.requestUrl(requestPath);
    this.latestRequest = Object.freeze({ method, path: requestPath, url });
    return url;
  }

  /** Safe request metadata for the canonical Allure owner; headers/body are excluded. */
  lastRequest(): ApiRequestRecord | null {
    return this.latestRequest;
  }

  private headers(token = this.defaultToken, extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  private fetchWithToken(
    method: ApiMethod,
    requestPath: string,
    options: ApiFetchOptions,
    token = this.defaultToken,
  ): Promise<APIResponse> {
    return this.request.fetch(this.record(method, requestPath), {
      method,
      headers: this.headers(token, options.headers),
      ...(options.query ? { params: options.query } : {}),
      ...(options.body !== undefined ? { data: options.body } : {}),
    });
  }

  /** Canonical low-level entrypoint used by generated module API clients. */
  fetch(method: ApiMethod, requestPath: string, options: ApiFetchOptions = {}): Promise<APIResponse> {
    return this.fetchWithToken(method, requestPath, options);
  }

  get(requestPath: string, token?: string): Promise<APIResponse> {
    return this.fetchWithToken('GET', requestPath, {}, token);
  }

  post(requestPath: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.fetchWithToken('POST', requestPath, { body }, token);
  }

  put(requestPath: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.fetchWithToken('PUT', requestPath, { body }, token);
  }

  patch(requestPath: string, body: unknown, token?: string): Promise<APIResponse> {
    return this.fetchWithToken('PATCH', requestPath, { body }, token);
  }

  delete(requestPath: string, token?: string): Promise<APIResponse> {
    return this.fetchWithToken('DELETE', requestPath, {}, token);
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
