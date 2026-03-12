import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { defineConfig } from '@playwright/test';

function detectBaseURL(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;

  // Find the repo root (works from any subdirectory)
  const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  const gitPath = join(repoRoot, '.git');
  const isWorktree = existsSync(gitPath) && !statSync(gitPath).isDirectory();
  const name = isWorktree ? basename(repoRoot) : 'tg';
  const hostname = `${name}.localhost`;

  // Read the portless route table to connect directly to Vite (avoids proxy issues)
  try {
    const routesPath = join(homedir(), '.portless', 'routes.json');
    const routes: { hostname: string; port: number }[] = JSON.parse(
      readFileSync(routesPath, 'utf-8'),
    );
    const route = routes.find((r) => r.hostname === hostname);
    if (route) return `http://127.0.0.1:${route.port}`;
  } catch {
    // fall through to proxy URL
  }

  return `http://${hostname}:1355`;
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
      use: { baseURL: detectBaseURL(), browserName: 'chromium', headless: true },
    },
  ],
});
