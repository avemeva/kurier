/**
 * Build the CLI binary with hardcoded API credentials.
 *
 * Uses `bun build --compile` for cross-platform compilation.
 * Embeds API credentials via --define at compile time.
 *
 * Flags:
 *   --single   Build only for current platform, install to ~/.local/bin/tg
 *   --release  Create distributable archives after building
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { $ } from 'bun';

const cliDir = path.resolve(import.meta.dir, '..');
process.chdir(cliDir);

const pkg = await Bun.file('package.json').json();

// --- Flags ---

const singleFlag = process.argv.includes('--single');
const releaseFlag = process.argv.includes('--release');

// --- Resolve credentials (same search order as loadCredentials) ---

function findCredentials(): { apiId: number; apiHash: string } {
  const envId = process.env.TG_API_ID ?? process.env.VITE_TG_API_ID;
  const envHash = process.env.TG_API_HASH ?? process.env.VITE_TG_API_HASH;
  if (envId && envHash) {
    const apiId = Number(envId);
    if (apiId && envHash) return { apiId, apiHash: envHash };
  }

  const candidates = [
    path.join(homedir(), '.config', 'tg', 'credentials'),
    path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app', '.env'),
    path.resolve('../../.env'), // monorepo root
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

// --- Targets ---

const allTargets: { os: string; arch: 'arm64' | 'x64' }[] = [
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'win32', arch: 'x64' },
];

const targets = singleFlag
  ? allTargets.filter((t) => t.os === process.platform && t.arch === process.arch)
  : allTargets;

if (targets.length === 0) {
  throw new Error(`No matching target for ${process.platform}-${process.arch}`);
}

// --- Build ---

const { apiId, apiHash } = findCredentials();
console.log(`Building v${pkg.version} for ${targets.length} target(s) (API ID: ${apiId})`);

await $`rm -rf dist`;

const binaries: Record<string, string> = {};

for (const target of targets) {
  const name = `tg-${target.os}-${target.arch}`;
  const bunTarget = `bun-${target.os}-${target.arch}`;
  const outfile = `dist/${name}/bin/tg`;
  console.log(`Building ${name}...`);

  await $`mkdir -p dist/${name}/bin`;

  const result = Bun.spawnSync(
    [
      'bun',
      'build',
      'src/index.ts',
      '--compile',
      '--target',
      bunTarget,
      '--external',
      'onnxruntime-node',
      '--outfile',
      outfile,
      '--define',
      `process.env.TG_BUILTIN_API_ID="${apiId}"`,
      '--define',
      `process.env.TG_BUILTIN_API_HASH="${apiHash}"`,
    ],
    { stdio: ['inherit', 'inherit', 'inherit'] },
  );

  if (result.exitCode !== 0) {
    console.error(`Build failed for ${name}`);
    process.exit(result.exitCode ?? 1);
  }

  // Platform package.json for npm publishing
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify({ name, version: pkg.version, os: [target.os], cpu: [target.arch] }, null, 2),
  );

  binaries[name] = pkg.version;
  console.log(`Built ${name}`);
}

// --- Single mode: install locally ---

if (singleFlag && targets.length > 0) {
  const target = targets[0];
  const name = `tg-${target.os}-${target.arch}`;
  const builtBinary = path.resolve(`dist/${name}/bin/tg`);
  const installPath = path.join(homedir(), '.local', 'bin', 'tg');

  mkdirSync(path.dirname(installPath), { recursive: true });
  copyFileSync(builtBinary, installPath);
  console.log(`Installed: ${installPath}`);

  // Create ~/.tg symlink -> media_cache
  if (process.platform !== 'win32') {
    const { getAppDir } = await import('@tg/protocol/paths');
    const mediaCacheDir = path.join(getAppDir(), 'media_cache');
    const symlink = path.join(homedir(), '.tg');

    mkdirSync(mediaCacheDir, { recursive: true });

    try {
      if (existsSync(symlink)) {
        const current = readlinkSync(symlink);
        if (current !== mediaCacheDir) {
          unlinkSync(symlink);
          symlinkSync(mediaCacheDir, symlink);
          console.log(`Updated symlink: ${symlink} -> ${mediaCacheDir}`);
        }
      } else {
        symlinkSync(mediaCacheDir, symlink);
        console.log(`Created symlink: ${symlink} -> ${mediaCacheDir}`);
      }
    } catch (err) {
      console.warn(`Could not create symlink ${symlink}: ${err}`);
    }
  }
}

// --- Release mode: create archives ---

if (releaseFlag) {
  for (const name of Object.keys(binaries)) {
    const binDir = path.resolve(`dist/${name}/bin`);
    if (name.includes('linux')) {
      await $`tar -czf ../../${name}.tar.gz *`.cwd(binDir);
    } else {
      await $`zip -r ../../${name}.zip *`.cwd(binDir);
    }
    console.log(`Archived ${name}`);
  }
}

console.log(`Done: ${Object.keys(binaries).join(', ')}`);

export { binaries };
