import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { validatorsPlugin } from './shared/validators-plugin.mjs';

// `vite build --mode static` makes the server-less live demo for GitHub Pages (see
// scripts/snapshot-static-demo.mjs): relative paths so it works under any subpath.
export default defineConfig(({ mode }) => ({
  base: mode === 'static' ? './' : '/',
  plugins: [react(), validatorsPlugin()],
  build: { outDir: mode === 'static' ? 'out-static' : 'out', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { fs: { allow: ['..'] } },
}));
