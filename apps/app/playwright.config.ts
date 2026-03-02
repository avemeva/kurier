import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig } from '@playwright/test';

function detectBaseURL(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const isWorktree = existsSync('.git') && !statSync('.git').isDirectory();
  if (isWorktree) {
    const name = basename(process.cwd());
    return `http://${name}.localhost:1355`;
  }
  return 'http://tg.localhost:1355';
}

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  projects: [
    {
      name: 'app',
      testMatch: 'e2e/app.test.ts',
      use: { baseURL: detectBaseURL(), browserName: 'chromium', headless: true },
    },
    {
      name: 'perf',
      testMatch: 'perf/load.test.ts',
      use: { baseURL: detectBaseURL(), browserName: 'chromium', headless: true },
    },
    {
      name: 'dev',
      testMatch: 'e2e/dev-page.test.ts',
      use: { baseURL: 'http://localhost:5173', browserName: 'chromium', headless: true },
    },
  ],
});
