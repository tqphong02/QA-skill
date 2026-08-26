'use strict';

module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: [
    'node_modules/',
    'reports/',
    'evidence/',
    'sessions/',
    'runtime-data/',
    'test-results/',
    'playwright-report/',
    'ci-artifacts/',
  ],
  rules: {
    'no-debugger': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
};
