import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works under the GitHub Pages project path /game-v5-impl-web/.
  base: './',
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5176, strictPort: true },
  build: { outDir: 'dist', target: 'es2023' },
});
