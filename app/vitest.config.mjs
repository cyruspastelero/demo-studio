import { defineConfig } from 'vitest/config';
import { validatorsPlugin } from './shared/validators-plugin.mjs';

export default defineConfig({
  plugins: [validatorsPlugin()],
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.mjs', 'shared/**/*.test.mjs'], environment: 'node' },
});
