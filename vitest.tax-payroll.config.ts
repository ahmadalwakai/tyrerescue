import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Financial calculations, protected API contracts and real isolated iOS flows.
// PostgreSQL suites are run separately by test:payroll-db to bound WASM memory.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'lib/__tests__/tax-*.test.ts',
      'lib/__tests__/payroll-*.test.ts',
      'lib/__tests__/employee-tax-setup-validation.test.ts',
      'lib/__tests__/monthly-tax-void-client.test.ts',
    ],
  },
});
