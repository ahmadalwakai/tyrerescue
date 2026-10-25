import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config';

// Real in-memory PostgreSQL, synthetic records only. Run serially to bound WASM
// memory. Normal unit runs exclude these; `npm run test:payroll-db` includes them.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['lib/__tests__/payroll-*-db.test.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
