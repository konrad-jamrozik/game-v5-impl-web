import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5176',
    viewport: { width: 1500, height: 950 },
    // Without a GPU, the browser draws the WebGL globe in software, and every frame of it then takes about a third of a
    // second, which slows every action of a test to seconds. No browser test is about the globe, so WebGL is turned
    // off and the globe shows that it needs WebGL 2 instead.
    launchOptions: { args: ['--disable-3d-apis'] },
  },
  webServer: {
    command: 'npm run web:build && npm run web:preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
