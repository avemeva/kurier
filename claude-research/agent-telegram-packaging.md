# agent-telegram CLI Packaging

## What are we doing

A person runs one command and gets a working Telegram CLI. No build tools, no dependencies, no second step.

Three install channels:
```
curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install | bash
npm i -g @avemeva/agent-telegram
brew install avemeva/tap/agent-telegram
```

After any of these, this must work:
```
agent-telegram --version      # binary starts
agent-telegram doctor         # tdjson found, config found
agent-telegram --daemon &     # TDLib proxy starts
agent-telegram me             # live Telegram data returns
```

If any step fails, the distribution is broken.

### What "working" actually means

A compiled Bun binary is self-contained — but it has two runtime dependencies:

1. **libtdjson** (30MB native lib) — TDLib C++ library. Without it, the daemon can't start. Must be at `~/.local/lib/agent-telegram/libtdjson.{dylib,so,dll}`.
2. **No `onnxruntime-node` at startup** — caption feature uses `@huggingface/transformers` which optionally imports `onnxruntime-node`. If this import runs at startup, the binary crashes outside the monorepo.

The proof chain:
```
Binary starts outside monorepo     →  onnxruntime-node not imported at startup
Binary finds tdjson                →  libtdjson bundled in archive, placed by installer
Daemon connects to TDLib           →  API credentials baked in at compile time
User gets live data                →  full stack works end-to-end
```

The local test that catches most problems:
```bash
cp dist/agent-telegram-darwin-arm64/bin/agent-telegram /tmp/
/tmp/agent-telegram --version    # crashes? → onnxruntime problem
/tmp/agent-telegram doctor       # tdjson missing? → bundling problem
```

If it works from `/tmp/`, it'll work from a fresh install.

---

## How it works

### Architecture

```
agent-telegram binary (compiled Bun)
├── agent-telegram --daemon           → TDLib HTTP proxy (port 7312, needs libtdjson)
├── agent-telegram --caption-daemon   → Caption HTTP server (port 7313, WASM/WebGPU)
├── agent-telegram doctor             → Installation health check
└── agent-telegram <command>          → HTTP client to daemon

Archive contents (what gets distributed):
├── bin/agent-telegram                → 60MB compiled binary
└── lib/libtdjson.{dylib,so,dll}     → 30MB TDLib native library

Install locations:
├── ~/.local/bin/agent-telegram       → binary
└── ~/.local/lib/agent-telegram/      → libtdjson
```

### Distribution channels

```
npm i -g @avemeva/agent-telegram
  → installs wrapper package (@avemeva/agent-telegram)
  → pulls platform optionalDep (@avemeva/agent-telegram-darwin-arm64)
  → postinstall hardlinks binary from platform pkg to bin/
  → user runs: agent-telegram

brew install avemeva/tap/agent-telegram
  → downloads archive from GitHub release
  → extracts binary to Homebrew prefix
  → user runs: agent-telegram

curl -fsSL .../install | bash
  → detects platform/arch (darwin/linux, arm64/x64, Rosetta check)
  → downloads archive from GitHub release
  → extracts binary to ~/.local/bin/
  → extracts libtdjson to ~/.local/lib/agent-telegram/
  → modifies PATH in shell config
  → user runs: agent-telegram
```

### Develop vs Release

```bash
# Day-to-day: push code freely, nothing triggers
git add . && git commit -m "whatever" && git push

# Release: one command, CI does everything else
cd apps/cli && bun run release patch
```

### Release flow diagram

```
release.ts                          GitHub Actions
──────────                          ──────────────

reads package.json → 0.1.0
bumps to 0.1.1
writes package.json
git commit "release: agent-telegram v0.1.1"
git tag v0.1.1
git push && git push --tags ──────→ tag v0.1.1 arrives
                                         │
                                    publish.yml triggers (on: push: tags: ['v*'])
                                         │
                                    ┌────┴────┐
                                    │  build   │ each runner: bun install → build → smoke test
                                    │ (matrix) │ macos-14    → darwin-arm64
                                    │          │ macos-??    → darwin-x64 (runner TBD)
                                    │          │ ubuntu      → linux-x64
                                    │          │ windows     → win32-x64
                                    └────┬────┘
                                         │ smoke test: agent-telegram --version
                                    ┌────┴────┐
                                    │ publish  │ ~2 min
                                    │          │ npm publish (platform pkgs + wrapper)
                                    │          │ gh release create (archives with bin + lib)
                                    │          │ push updated formula to homebrew tap
                                    └────┬────┘
                                    ┌────┴────┐
                                    │ verify   │ ~2 min
                                    │          │ curl install on macOS + Linux
                                    │          │ npm i -g on macOS + Linux + Windows
                                    │          │ agent-telegram doctor on each
                                    └─────────┘

After ~10 min, all three install channels work:

  curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install | bash
  npm i -g @avemeva/agent-telegram
  brew install avemeva/tap/agent-telegram
```

Can also trigger manually: Actions → "Publish agent-telegram" → Run workflow (with dry_run option).

The release script guards against dirty working tree — commit or stash first.

---

## What's been done

### Files created
| File | Purpose |
|------|---------|
| `apps/cli/bin/agent-telegram.js` | npm wrapper (Node.js, replaces `bin/tg.js`) |
| `apps/cli/scripts/release.ts` | One-command release: bump version, tag, push |
| `apps/cli/src/commands/doctor.ts` | `agent-telegram doctor` — checks binary, tdjson, config, daemon |

### Files modified
| File | What changed |
|------|-------------|
| `install` | Renamed tg → agent-telegram, extracts tdjson to `~/.local/lib/agent-telegram/` |
| `apps/cli/scripts/build.ts` | Removed cross-compilation, bundles tdjson, single-platform only |
| `apps/cli/scripts/publish.ts` | Fixed workspace resolution bug (.cwd()), dynamic platform discovery, @avemeva scope |
| `apps/cli/scripts/postinstall.mjs` | @avemeva scoped package names |
| `.github/workflows/publish.yml` | Matrix build (4 runners), tag trigger, homebrew tap update, verify job |
| `apps/cli/src/index.ts` | CLI name `agent-telegram`, registered doctor command |
| `apps/cli/src/help.ts` | Help text uses `agent-telegram` |
| `apps/cli/src/daemon.ts` | Comment update only |
| `apps/cli/scripts/install-tdjson.ts` | Comment update only |
| `packages/protocol/src/paths.ts` | `~/.local/lib/tg` → `~/.local/lib/agent-telegram` (all platform paths) |
| `apps/cli/package.json` | Added `release` script |

### Files deleted
| File | Replaced by |
|------|------------|
| `apps/cli/bin/tg.js` | `apps/cli/bin/agent-telegram.js` |

### First CI run (dry_run, 2026-03-06)

Run `22771383437`. All builds compiled, all smoke tests crashed:

| Runner | Build | Smoke test | Error |
|--------|-------|-----------|-------|
| macos-14 (ARM) | OK | CRASH | `Cannot find package 'onnxruntime-node' from '/$bunfs/root/agent-telegram'` |
| macos-13 (Intel) | — | — | Runner `macos-13` no longer exists (deprecated by GitHub) |
| ubuntu-latest | OK | CRASH | Same onnxruntime-node error |
| windows-latest | OK | CRASH | Same onnxruntime-node error |

**Root cause:** `--external onnxruntime-node` in `build.ts` tells Bun "don't bundle this, require() it at runtime." The binary crashes on startup trying to find it. Locally it worked because the binary ran next to `node_modules/`.

### First real release attempts (v0.1.2, v0.1.3, 2026-03-06)

v0.1.2 and v0.1.3 both failed at the publish step with `EOTP` — npm required OTP for publishing.

**Root cause:** The npm granular access token `ci-publish` was created **without** "Bypass two-factor authentication (2FA)" checked. This setting cannot be toggled after creation — you must delete the token and create a new one.

**Fix:** Deleted old token, created new `ci-publish` token with "Bypass 2FA" checked during creation. Updated `NPM_TOKEN` secret in GitHub. Re-ran v0.1.3 — all 9 jobs passed (3 builds + publish + 5 verify).

**Lesson:** npm granular tokens' 2FA bypass setting is immutable after creation. Always check it during token creation if the token will be used in CI.

---

## Verification table — what needs to be done

Each row has a specific proof. "PASSED" means verified with real output. Steps are in dependency order.

| # | What | How to verify | Proof | Status |
|---|------|-------------|-------|--------|
| **Step 1: Fix binary crash** | | | | |
| 1.1 | Remove `--external onnxruntime-node` or lazy-import it | Edit `build.ts`, rebuild | Changed to `--external @huggingface/transformers` | DONE |
| 1.2 | Binary starts OUTSIDE monorepo | `cp dist/.../bin/agent-telegram /tmp/ && /tmp/agent-telegram --version` | Prints `0.1.0` | DONE |
| 1.3 | Doctor passes outside monorepo | `/tmp/agent-telegram doctor` | `TDLib ok`, `Config ok`, `All checks passed` | DONE |
| **Step 2: Fix CI runners** | | | | |
| 2.1 | Replace deprecated `macos-13` | Update `publish.yml` matrix | Removed darwin-x64 row, fixed scoped npm name in verify | DONE |
| 2.2 | CI dry run — all smoke tests pass | `gh workflow run publish.yml -f dry_run=true` then `gh run view <id>` | Run 22772090727: darwin-arm64 ✓, linux-x64 ✓, win32-x64 ✓ | DONE |
| **Step 3: Create secrets** | | | | |
| 3.1 | `TG_API_ID` | `gh secret list` | Present | DONE |
| 3.2 | `TG_API_HASH` | `gh secret list` | Present | DONE |
| 3.3 | `NPM_TOKEN` | npmjs.com → Granular Access Token → `ci-publish` | Token created with Bypass 2FA (expires Jun 4 2026), set in GH secrets | DONE |
| 3.4 | `HOMEBREW_TAP_TOKEN` | GitHub → Fine-grained PAT → `avemeva/homebrew-tap` → Contents: R/W | Set via `gh secret set HOMEBREW_TAP_TOKEN` | DONE |
| **Step 4: First real release** | | | | |
| 4.1 | Set NPM_TOKEN secret | `gh secret set NPM_TOKEN` | Updated 2026-03-06T18:39:01Z | DONE |
| 4.2 | Release script works | `cd apps/cli && bun run release patch` | v0.1.2 and v0.1.3 tags pushed, CI triggered | DONE |
| 4.3 | All CI builds green | `gh run view 22774389355` | All 3 build jobs green (darwin-arm64, linux-x64, win32-x64) | DONE |
| 4.4 | npm packages published | `npm view @avemeva/agent-telegram` | `@avemeva/agent-telegram@0.1.3` on registry | DONE |
| 4.5 | GitHub release created | `gh release view v0.1.3` | 3 archives: darwin-arm64.zip, linux-x64.tar.gz, win32-x64.tar.gz | DONE |
| 4.6 | Homebrew tap updated | Check `avemeva/homebrew-tap` repo | Formula v0.1.3, SHAs correct. Fixed: removed empty-sha256 platforms, added `bottle :unneeded`, fixed `def install` placement | DONE (fix in publish.ts pending next release) |
| 4.7 | CI verify: curl on macOS | Verify job in CI | Run 22774389355: Verify (curl on macos-14) ✓ | DONE |
| 4.8 | CI verify: curl on Linux | Verify job in CI | Run 22774389355: Verify (curl on ubuntu-latest) ✓ | DONE |
| 4.9 | CI verify: npm on all platforms | Verify job in CI | Run 22774389355: npm on macos-14 ✓, ubuntu-latest ✓, windows-latest ✓ | DONE |
| **Step 5: Local install verification** | | | | |
| 5.1 | curl install from scratch | Remove binary+lib, run install script, `agent-telegram doctor` | v0.1.3, tdjson 29M at ~/.local/lib/agent-telegram/, doctor all green | DONE |
| 5.2 | npm install from scratch | `npm i -g @avemeva/agent-telegram` then `agent-telegram doctor` | v0.1.3, postinstall copies tdjson to ~/.local/lib/agent-telegram/, doctor all green | DONE |
| 5.3 | brew install | `brew install avemeva/tap/agent-telegram`, `agent-telegram doctor` | Fails: Xcode version check. Root cause: formula missing `bottle :unneeded`. Fix in publish.ts, needs next release to verify | TODO (fix committed, needs release) |
| **COMPLETE** | All channels verified | curl ✓, npm ✓, brew needs next release to verify fix | — | TODO (brew pending) |

---

## Reference sources

### Implementations we adapted from

| Source | File | What we took |
|--------|------|-------------|
| opencode | `packages/opencode/script/build.ts` | Bun.build() compile pattern, `--single` flag for local dev, platform package.json generation with os/cpu fields |
| opencode | `packages/opencode/bin/opencode` | Node.js npm wrapper (~180 lines): platform detection, binary resolution from node_modules, caching via hardlink. We simplified (no AVX2/baseline). |
| opencode | `packages/opencode/script/postinstall.mjs` | Hardlinks binary from platform package to `bin/`, patches npm shims |
| opencode | `packages/opencode/script/publish.ts` | Full publish pipeline: platform packages → wrapper → Homebrew formula. We took npm + brew, skipped Docker/AUR. |
| opencode | `install` (461 lines bash) | Platform/arch detection (Rosetta, AVX2, musl), GitHub releases download with progress bar, PATH modification for zsh/bash/fish/ash. We simplified. |
| opencode | `.github/workflows/publish.yml` | 3-job CI: version → build → publish. **Key difference: opencode cross-compiles from one runner** because it has no native deps. We can't — tdjson is platform-specific. |
| agent-browser | `bin/agent-browser.js` | Simpler wrapper (~55 lines): platform detection + spawn binary. We based our wrapper on this. |
| agent-browser | `scripts/postinstall.js` | Alternative: downloads binary from GitHub releases (not npm optionalDeps) |
| agent-browser | `.github/workflows/release.yml` | Build 5 platform binaries → npm publish + GitHub release |

### Key difference from references

**Neither opencode nor agent-browser ships a native library alongside the binary.** They're pure compiled JS — the binary is the entire distribution. We have tdjson (30MB C++ lib) that must be co-installed. This is the unique challenge. `prebuilt-tdlib` provides per-platform tdjson via npm optionalDeps — each CI runner gets the correct one via `bun install`.

### Files to read for full context

| File | Why |
|------|-----|
| `apps/cli/scripts/build.ts` | Build mechanics, tdjson bundling, `--external onnxruntime-node` (the crash source) |
| `apps/cli/scripts/publish.ts` | npm publish pipeline, dynamic platform discovery, Homebrew formula generation |
| `apps/cli/scripts/release.ts` | Bump + tag + push automation |
| `apps/cli/bin/agent-telegram.js` | npm wrapper: finds platform binary in node_modules |
| `apps/cli/scripts/postinstall.mjs` | npm postinstall: hardlinks binary |
| `apps/cli/src/commands/doctor.ts` | Installation health check |
| `apps/cli/src/caption-daemon.ts` | Caption daemon (Florence-2, HTTP server) — imports @huggingface/transformers |
| `apps/cli/src/caption.ts` | Caption client lifecycle |
| `apps/cli/src/index.ts` | Entry point — `--daemon` and `--caption-daemon` pre-Commander checks |
| `apps/cli/src/daemon.ts` | TDLib daemon — loads tdjson at runtime |
| `packages/protocol/src/paths.ts` | All platform-specific paths (lib dir, app dir, config dir) |
| `install` | Bash curl install script |
| `.github/workflows/publish.yml` | CI/CD workflow |

### Secrets status

| Secret | Status | Where to create |
|--------|--------|----------------|
| `TG_API_ID` | SET | — |
| `TG_API_HASH` | SET | — |
| `NPM_TOKEN` | SET | npm granular token `ci-publish` with Bypass 2FA, expires Jun 4 2026 |
| `HOMEBREW_TAP_TOKEN` | SET | GitHub fine-grained PAT `homebrew-tap-ci`, expires Apr 5 2026 |
