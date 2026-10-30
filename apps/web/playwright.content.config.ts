import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests-content',
  outputDir: './test-results-content',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'off' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 740, height: 360 },
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: [
    {
      command:
        'pnpm --filter @mamalik/game-server exec node --import tsx tests/content-web-server.ts',
      cwd: '../..',
      url: 'http://127.0.0.1:2574/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'pnpm start --port 3101',
      url: 'http://127.0.0.1:3101/signin',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        WEB_AUTH_ENABLED: 'true',
        WEB_AUTH_ORIGIN: 'http://127.0.0.1:3101',
        SUPABASE_URL: 'http://127.0.0.1:49001',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only_123456789',
        CONTENT_ADMIN_URL: 'http://127.0.0.1:2574',
      },
    },
  ],
});
