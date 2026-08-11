export type LoginValidationCase = Readonly<{
  id: string;
  emailDomain: string;
  password: string;
  expectedError: RegExp;
}>;

/**
 * Case data is read-only and versioned.
 * Runtime identities such as email addresses come from the `testData` fixture.
 */
export const loginValidationCases = [
  {
    id: 'LOGIN_DDT_001',
    emailDomain: 'unknown.invalid.example',
    password: 'invalid-password',
    expectedError: /invalid|incorrect|wrong|sai/i,
  },
  {
    id: 'LOGIN_DDT_002',
    emailDomain: 'alternate.invalid.example',
    password: 'incorrect-secret',
    expectedError: /invalid|incorrect|wrong|sai/i,
  },
] as const satisfies readonly LoginValidationCase[];
