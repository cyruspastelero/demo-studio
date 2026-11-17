import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { validatorsPlugin } from './shared/validators-plugin.mjs';

export default defineConfig({
  plugins: [react(), validatorsPlugin()],
  build: { outDir: 'out', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { fs: { allow: ['..'] } },
});
