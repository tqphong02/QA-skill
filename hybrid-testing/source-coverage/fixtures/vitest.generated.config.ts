import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/payment.generated.test.ts"],
    coverage: {
      provider: "v8",
      include: ["fixtures/payment-service.ts"],
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
});
