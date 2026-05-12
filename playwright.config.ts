// Playwright config for HiringFlow.
//
// Scope: smoke tests that need real browser behaviour (mic permissions,
// MediaRecorder, beforeunload). The bulk of test coverage lives in Vitest;
// Playwright is reserved for what can't be unit-tested.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: process.env.HARNESS_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
})
