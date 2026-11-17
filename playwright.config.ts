import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', viewport: { width: 1500, height: 950 } },
  webServer: {
    command: 'npm run web:build && npm run web:preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
