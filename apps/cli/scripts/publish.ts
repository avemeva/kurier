#!/usr/bin/env bun

/**
 * Publishing pipeline for agent-telegram.
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

const pkg = await Bun.file('package.json').json();
const version = pkg.version;

console.log(`Publishing agent-telegram v${version}${dryRun ? ' (dry run)' : ''}`);

// --- Discover build artifacts ---

import { readdirSync } from 'node:fs';

const platformPattern = /^agent-telegram-(darwin|linux|win32)-(arm64|x64)$/;
const platforms: { os: string; arch: string }[] = [];

for (const entry of readdirSync('dist')) {
  const m = entry.match(platformPattern);
  if (m?.[1] && m[2] && existsSync(`dist/${entry}/package.json`)) {
    platforms.push({ os: m[1], arch: m[2] });
  }
}

if (platforms.length === 0) {
  console.error('No build artifacts found in dist/. Run builds first.');
  process.exit(1);
}

console.log(
  `Found ${platforms.length} platform(s): ${platforms.map((p) => `${p.os}-${p.arch}`).join(', ')}`,
);

// --- Publish platform packages ---

console.log('\nPublishing platform packages...');

const publishTasks = platforms.map(async ({ os, arch }) => {
  const name = `agent-telegram-${os}-${arch}`;
  const distDir = path.resolve(`dist/${name}`);

  if (process.platform !== 'win32') {
    await $`chmod -R 755 ${distDir}`;
  }

  const args = ['npm', 'publish', '--access', 'public'];
  if (dryRun) args.push('--dry-run');
  const result = await $`${args}`.cwd(distDir).nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`Failed to publish ${name}@${version} (exit code ${result.exitCode})`);
  }
  console.log(`  Published ${name}@${version}`);
});

await Promise.all(publishTasks);

// --- Build and publish wrapper package ---

console.log('\nBuilding wrapper package...');

const wrapperDir = 'dist/agent-telegram';
await $`mkdir -p ${wrapperDir}/bin`;
await $`cp bin/agent-telegram.js ${wrapperDir}/bin/agent-telegram.js`;
await $`cp scripts/postinstall.mjs ${wrapperDir}/postinstall.mjs`;

const optionalDependencies: Record<string, string> = {};
for (const { os, arch } of platforms) {
  optionalDependencies[`@avemeva/agent-telegram-${os}-${arch}`] = version;
}

const wrapperPkg = {
  name: '@avemeva/agent-telegram',
  version,
  description: 'AI-powered Telegram CLI',
  bin: { 'agent-telegram': './bin/agent-telegram.js' },
  scripts: { postinstall: 'node ./postinstall.mjs' },
  optionalDependencies,
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'https://github.com/avemeva/kurier',
  },
};

await Bun.file(`${wrapperDir}/package.json`).write(JSON.stringify(wrapperPkg, null, 2));

// Copy LICENSE if it exists
const licenseFile = path.resolve('../../LICENSE');
if (existsSync(licenseFile)) {
  await $`cp ${licenseFile} ${wrapperDir}/LICENSE`;
}

console.log('Publishing wrapper package...');
const wrapperArgs = ['npm', 'publish', '--access', 'public'];
if (dryRun) wrapperArgs.push('--dry-run');
const wrapperResult = await $`${wrapperArgs}`.cwd(path.resolve(wrapperDir)).nothrow();
if (wrapperResult.exitCode !== 0) {
  throw new Error(
    `Failed to publish @avemeva/agent-telegram@${version} (exit code ${wrapperResult.exitCode})`,
  );
}
console.log(`  Published @avemeva/agent-telegram@${version}`);

// --- Generate Homebrew formula ---

console.log('\n--- Homebrew Formula ---\n');

async function sha256(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

const archiveFiles: Record<string, string | null> = {};
for (const { os, arch } of platforms) {
  const name = `agent-telegram-${os}-${arch}`;
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

const ghBase = `https://github.com/avemeva/kurier/releases/download/v${version}`;

const formula = `# typed: false
# frozen_string_literal: true

class AgentTelegram < Formula
  desc "AI-powered Telegram CLI"
  homepage "https://github.com/avemeva/kurier"
  version "${version}"

  on_macos do
    if Hardware::CPU.intel?
      url "${ghBase}/agent-telegram-darwin-x64.zip"
      sha256 "${shas['darwin-x64'] ?? 'MISSING'}"

      def install
        bin.install "agent-telegram"
      end
    end
    if Hardware::CPU.arm?
      url "${ghBase}/agent-telegram-darwin-arm64.zip"
      sha256 "${shas['darwin-arm64'] ?? 'MISSING'}"

      def install
        bin.install "agent-telegram"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?
      url "${ghBase}/agent-telegram-linux-x64.tar.gz"
      sha256 "${shas['linux-x64'] ?? 'MISSING'}"

      def install
        bin.install "agent-telegram"
      end
    end
    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?
      url "${ghBase}/agent-telegram-linux-arm64.tar.gz"
      sha256 "${shas['linux-arm64'] ?? 'MISSING'}"

      def install
        bin.install "agent-telegram"
      end
    end
  end
end
`;

console.log(formula);
console.log('--- End Formula ---');
console.log('\nDone.');
