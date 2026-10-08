import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real thing: the built web app served by the Worker under `wrangler dev`,
 * with Durable Objects, SQLite, alarms and WebSockets running locally in workerd. Timers are shortened
 * through Worker vars so a whole game fits in a test run.
 */
const PORT = Number(process.env.E2E_PORT ?? 8788);
export const TURN_MS = 30_000;
export const UNDO_MS = 1_500;
export const PAUSE_MS = 6_000;

export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['iPhone 13'],
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: [
      'pnpm --filter @holdem/web build',
      `cd apps/server && rm -rf .wrangler/e2e && npx wrangler dev --port ${PORT} --ip 127.0.0.1 --persist-to .wrangler/e2e` +
        ` --var UNDO_MS:${UNDO_MS} --var HAND_PAUSE_MS:${PAUSE_MS} --var TURN_TIMER_OVERRIDE_MS:${TURN_MS}`,
    ].join(' && '),
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
