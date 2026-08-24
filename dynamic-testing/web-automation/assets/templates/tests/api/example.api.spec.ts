import { z } from 'zod';
import { test, expect } from '../../fixtures/pom';
import { ApiClient } from '../../fixtures/api-client';

const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const UserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string(),
});

const UserListSchema = z.array(UserSchema);

const ApiErrorSchema = z.object({
  message: z.string(),
});

test.describe('Users API @api', () => {
  test('TC-API-USERS-CREATE-001 | POST /users | createUser @api', async ({
    authenticatedApi,
    testData,
  }) => {
    test.info().annotations.push(
      { type: 'api-operation', description: '[TC-API-USERS-CREATE-001:API] POST /users createUser' },
      { type: 'contract', description: '[TC-API-USERS-CREATE-001:ROLE] admin' },
      { type: 'contract', description: '[TC-API-USERS-CREATE-001:CLEANUP] DELETE /users/{id} same_test' },
    );
    const payload = ApiClient.validate(CreateUserRequestSchema, {
      email: testData.uniqueEmail(),
      name: testData.uniqueString('qa-user'),
    });
    let createdId: string | number | undefined;

    try {
      const response = await authenticatedApi.post('/users', payload);
      expect(response.status()).toBe(201);
      const user = ApiClient.validate(UserSchema, await response.json());
      expect(user.email).toBe(payload.email);
      createdId = user.id;
    } finally {
      if (createdId !== undefined) {
        await authenticatedApi.delete(`/users/${createdId}`);
      }
    }
  });

  test('TC-API-USERS-LIST-001 | GET /users | listUsers @api', async ({ authenticatedApi }) => {
    test.info().annotations.push(
      { type: 'api-operation', description: '[TC-API-USERS-LIST-001:API] GET /users listUsers' },
      { type: 'contract', description: '[TC-API-USERS-LIST-001:ROLE] admin' },
    );
    const response = await authenticatedApi.get('/users');
    expect(response.status()).toBe(200);
    const users = ApiClient.validate(UserListSchema, await response.json());
    expect(Array.isArray(users)).toBe(true);
  });

  test('TC-API-USERS-UNAUTHORIZED-001 | GET /users | listUsersUnauthorized @api', async ({ api }) => {
    test.info().annotations.push(
      {
        type: 'api-operation',
        description: '[TC-API-USERS-UNAUTHORIZED-001:API] GET /users listUsersUnauthorized',
      },
      { type: 'contract', description: '[TC-API-USERS-UNAUTHORIZED-001:ROLE] unauthenticated' },
    );
    const response = await api.get('/users');
    expect(response.status()).toBe(401);
    const error = ApiClient.validate(ApiErrorSchema, await response.json());
    expect(error.message).toBeTruthy();
  });
});
