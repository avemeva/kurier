/**
 * Build the CLI binary with hardcoded API credentials.
 *
 * Reads credentials from the same sources as loadCredentials() and
 * embeds them into the compiled binary via Bun's --define flag.
 * This eliminates the need for .env files or tg auth setup.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// --- Resolve credentials (same search order as loadCredentials) ---

function findCredentials(): { apiId: number; apiHash: string } {
  // Environment variables
  const envId = process.env.TG_API_ID ?? process.env.VITE_TG_API_ID;
  const envHash = process.env.TG_API_HASH ?? process.env.VITE_TG_API_HASH;
  if (envId && envHash) {
    const apiId = Number(envId);
    if (apiId && envHash) return { apiId, apiHash: envHash };
  }

  // Config/env files
  const candidates = [
    path.join(homedir(), '.config', 'tg', 'credentials'),
    path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app', '.env'),
    path.resolve(import.meta.dir, '../../../.env'), // monorepo root
  ];

  for (const filePath of candidates) {
    try {
      const text = readFileSync(filePath, 'utf-8');
      const vars: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const m = line.match(/^(\w+)=(.*)$/);
        if (m?.[1] && m[2] !== undefined) vars[m[1]] = m[2];
      }
      const apiId = Number(vars.TG_API_ID ?? vars.VITE_TG_API_ID);
      const apiHash = vars.TG_API_HASH ?? vars.VITE_TG_API_HASH ?? '';
      if (apiId && apiHash) return { apiId, apiHash };
    } catch {
      // Try next
    }
  }

  throw new Error(
    'Cannot build: API credentials not found.\n' +
      'Set TG_API_ID and TG_API_HASH environment variables, or create .env in the monorepo root.',
  );
}

// --- Build ---

const { apiId, apiHash } = findCredentials();
const outfile = path.join(homedir(), '.local', 'bin', 'tg');

console.log(`Embedding API ID: ${apiId}`);

const result = Bun.spawnSync(
  [
    'bun',
    'build',
    'src/index.ts',
    '--compile',
    '--outfile',
    outfile,
    '--define',
    `process.env.TG_BUILTIN_API_ID="${apiId}"`,
    '--define',
    `process.env.TG_BUILTIN_API_HASH="${apiHash}"`,
  ],
  {
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: path.resolve(import.meta.dir, '..'),
  },
);

if (result.exitCode !== 0) {
  process.exit(result.exitCode ?? 1);
}

console.log(`Built: ${outfile}`);
