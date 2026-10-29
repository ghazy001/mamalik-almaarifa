import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
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
      command: 'pnpm start --port 3100',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 60000,
      env: { GAME_SERVER_URL: 'http://127.0.0.1:2571' },
    },
    {
      command:
        'pnpm --filter @mamalik/game-server exec node --import tsx tests/e2e-server.ts',
      cwd: '../..',
      url: 'http://127.0.0.1:2571/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        GAME_SERVER_PORT: '2571',
        GAME_SERVER_HOST: '127.0.0.1',
        COLYSEUS_LATENCY: '80',
      },
    },
  ],
});
