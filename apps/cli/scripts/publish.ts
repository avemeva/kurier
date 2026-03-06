#!/usr/bin/env bun

/**
 * Publishing pipeline for tg-cli.
 *
 * Publishes 5 platform packages + 1 wrapper package to npm,
 * then generates a Homebrew formula to stdout.
 *
 * Usage:
 *   bun run scripts/publish.ts
 *   bun run scripts/publish.ts --dry-run
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'bun';

const cliDir = path.resolve(import.meta.dir, '..');
process.chdir(cliDir);

const dryRun = process.argv.includes('--dry-run');
const dryRunFlag = dryRun ? '--dry-run' : '';

const pkg = await Bun.file('package.json').json();
const version = pkg.version;

console.log(`Publishing tg-cli v${version}${dryRun ? ' (dry run)' : ''}`);

// --- Verify build artifacts ---

const platforms = [
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'win32', arch: 'x64' },
];

for (const { os, arch } of platforms) {
  const name = `tg-${os}-${arch}`;
  const distDir = `dist/${name}`;
  if (!existsSync(distDir)) {
    console.error(`Missing build artifact: ${distDir}`);
    console.error('Run `bun run build` first.');
    process.exit(1);
  }
  if (!existsSync(`${distDir}/package.json`)) {
    console.error(`Missing package.json in ${distDir}`);
    process.exit(1);
  }
}

// --- Publish platform packages ---

console.log('\nPublishing platform packages...');

const publishTasks = platforms.map(async ({ os, arch }) => {
  const name = `tg-${os}-${arch}`;
  const distDir = `dist/${name}`;

  if (process.platform !== 'win32') {
    await $`chmod -R 755 ${distDir}`;
  }

  await $`npm publish ${distDir} --access public ${dryRunFlag}`.nothrow();
  console.log(`  Published ${name}@${version}`);
});

await Promise.all(publishTasks);

// --- Build and publish wrapper package ---

console.log('\nBuilding wrapper package...');

const wrapperDir = 'dist/tg-cli';
await $`mkdir -p ${wrapperDir}/bin`;
await $`cp bin/tg.js ${wrapperDir}/bin/tg.js`;
await $`cp scripts/postinstall.mjs ${wrapperDir}/postinstall.mjs`;

const optionalDependencies: Record<string, string> = {};
for (const { os, arch } of platforms) {
  optionalDependencies[`tg-${os}-${arch}`] = version;
}

const wrapperPkg = {
  name: 'tg-cli',
  version,
  description: 'AI-powered Telegram CLI',
  bin: { tg: './bin/tg.js' },
  scripts: { postinstall: 'node ./postinstall.mjs' },
  optionalDependencies,
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'https://github.com/nicedayzhu/telegram-ai',
  },
};

await Bun.file(`${wrapperDir}/package.json`).write(JSON.stringify(wrapperPkg, null, 2));

// Copy LICENSE if it exists
const licenseFile = path.resolve('../../LICENSE');
if (existsSync(licenseFile)) {
  await $`cp ${licenseFile} ${wrapperDir}/LICENSE`;
}

console.log('Publishing wrapper package...');
await $`npm publish ${wrapperDir} --access public ${dryRunFlag}`.nothrow();
console.log(`  Published tg-cli@${version}`);

// --- Generate Homebrew formula ---

console.log('\n--- Homebrew Formula ---\n');

async function sha256(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

const archiveFiles: Record<string, string | null> = {};
for (const { os, arch } of platforms) {
  const name = `tg-${os}-${arch}`;
  const ext = os === 'linux' ? 'tar.gz' : 'zip';
  const archivePath = `dist/${name}.${ext}`;
  archiveFiles[`${os}-${arch}`] = existsSync(archivePath) ? archivePath : null;
}

const shas: Record<string, string> = {};
for (const [key, filePath] of Object.entries(archiveFiles)) {
  if (filePath) {
    shas[key] = await sha256(filePath);
  }
}

const ghBase = `https://github.com/nicedayzhu/telegram-ai/releases/download/v${version}`;

const formula = `# typed: false
# frozen_string_literal: true

class TgCli < Formula
  desc "AI-powered Telegram CLI"
  homepage "https://github.com/nicedayzhu/telegram-ai"
  version "${version}"

  on_macos do
    if Hardware::CPU.intel?
      url "${ghBase}/tg-darwin-x64.zip"
      sha256 "${shas['darwin-x64'] ?? 'MISSING'}"

      def install
        bin.install "tg"
      end
    end
    if Hardware::CPU.arm?
      url "${ghBase}/tg-darwin-arm64.zip"
      sha256 "${shas['darwin-arm64'] ?? 'MISSING'}"

      def install
        bin.install "tg"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?
      url "${ghBase}/tg-linux-x64.tar.gz"
      sha256 "${shas['linux-x64'] ?? 'MISSING'}"

      def install
        bin.install "tg"
      end
    end
    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?
      url "${ghBase}/tg-linux-arm64.tar.gz"
      sha256 "${shas['linux-arm64'] ?? 'MISSING'}"

      def install
        bin.install "tg"
      end
    end
  end
end
`;

console.log(formula);
console.log('--- End Formula ---');
console.log('\nDone.');
