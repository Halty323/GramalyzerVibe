import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.ts', workers: 1,
  use: {baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', launchOptions: {executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox']}, screenshot: 'only-on-failure'},
  webServer: {command: 'npm run dev', url: 'http://127.0.0.1:5173/api/health', reuseExistingServer: !process.env.CI, timeout: 120000},
});
