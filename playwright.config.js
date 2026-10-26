// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Set to 1 to avoid port conflicts
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    baseURL: 'http://127.0.0.1:8001',
    bypassCSP: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run serve:test',
    url: 'http://127.0.0.1:8001',
    reuseExistingServer: !process.env.CI,
  },
});
