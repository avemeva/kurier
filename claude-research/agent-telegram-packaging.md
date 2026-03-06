# agent-telegram CLI Packaging

## Goal

A person runs one command and gets a working Telegram CLI. No build tools, no dependencies, no second step. The binary has everything it needs: the compiled app, the TDLib native library, and baked-in API credentials.

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

## What "working" actually means

A compiled Bun binary is a self-contained executable — but it has two runtime dependencies that must ship alongside it:

1. **libtdjson** (30MB native lib) — the TDLib C++ library. Without it, the daemon can't start. It must be at `~/.local/lib/agent-telegram/libtdjson.{dylib,so,dll}`.
2. **No `onnxruntime-node`** — the caption feature uses `@huggingface/transformers` which optionally imports `onnxruntime-node` (a native Node addon). If this import runs at startup, the binary crashes outside the monorepo. The caption code path must be fully lazy.

The proof chain:
```
Binary starts outside monorepo     →  onnxruntime-node not imported at startup
Binary finds tdjson                →  libtdjson bundled in archive, placed by installer
Daemon connects to TDLib           →  API credentials baked in at compile time
User gets live data                →  full stack works end-to-end
```

The local test that catches most problems:
```bash
cp dist/agent-telegram-darwin-arm64/bin/agent-telegram /tmp/agent-telegram-test
/tmp/agent-telegram-test --version    # crashes? onnxruntime problem
/tmp/agent-telegram-test doctor       # tdjson missing? bundling problem
```

If it works from `/tmp/`, it'll work from a fresh install. If it only works from inside the monorepo, it's broken.

## Reference implementations

These projects solve the same distribution problem. Key patterns we adapted:

### opencode (`/Users/andrey/Projects/opencode/`)

| File | What we learned |
|------|----------------|
| `packages/opencode/script/build.ts` | Bun.build() with compile target for 11 platform variants. Uses `--single` flag for local dev. Generates platform package.json with os/cpu fields. **Key: no native deps in the bundle** — opencode has no equivalent of tdjson/onnxruntime. |
| `packages/opencode/bin/opencode` | Node.js npm wrapper (~180 lines). Platform detection, binary resolution from node_modules, caching via hardlink. AVX2/baseline fallback (we skipped this). |
| `packages/opencode/script/postinstall.mjs` | Hardlinks binary from platform package to `bin/.opencode`, patches npm shims. We followed this pattern exactly. |
| `packages/opencode/script/publish.ts` | Full pipeline: platform packages → wrapper → Docker → AUR → Homebrew formula. We took npm + Homebrew, skipped Docker/AUR. |
| `install` (461 lines bash) | Platform/arch detection (Rosetta, AVX2, musl), GitHub releases download, progress bar, PATH modification for zsh/bash/fish/ash. We simplified (no AVX2, no musl, no Docker detection). |
| `.github/workflows/publish.yml` | 3-job pipeline: version → build → publish. **Key difference: opencode cross-compiles from one runner** because it has no native deps. We can't — tdjson is platform-specific. |

### agent-browser (`/Users/andrey/Projects/agent-browser/`)

| File | What we learned |
|------|----------------|
| `bin/agent-browser.js` | Simpler wrapper (~55 lines). Platform detection + spawn binary. We based our wrapper on this. |
| `scripts/postinstall.js` | Downloads binary from GitHub releases (not from npm optionalDeps). Alternative approach we considered but didn't use. |
| `.github/workflows/release.yml` | Builds 5 platform binaries, publishes to npm + GitHub release. Simpler than opencode. |

### Key difference from references

**Neither opencode nor agent-browser ships a native library alongside the binary.** They're pure compiled JS — the binary is the entire distribution. We have tdjson (30MB C++ lib) that must be co-installed. This is the unique challenge and the source of most complexity.

## Architecture

```
agent-telegram binary (compiled Bun)
├── agent-telegram --daemon           → TDLib HTTP proxy (port 7312, needs libtdjson)
├── agent-telegram --caption-daemon   → Caption HTTP server (port 7313, needs WASM/WebGPU)
├── agent-telegram doctor             → Installation health check
└── agent-telegram <command>          → HTTP client to daemon

Archive contents:
├── bin/agent-telegram                → 60MB compiled binary
└── lib/libtdjson.{dylib,so,dll}     → 30MB TDLib native library

Install locations:
├── ~/.local/bin/agent-telegram       → binary
└── ~/.local/lib/agent-telegram/      → libtdjson
```

## How it works

Two modes: **develop** and **release**.

### Develop (daily)

```bash
git add . && git commit -m "whatever" && git push    # nothing triggers
```

### Release

```bash
cd apps/cli && bun run release patch                  # one command, CI does the rest
```

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
                                    ┌────┴────┐
                                    │ publish  │ npm publish (platform pkgs + wrapper)
                                    │          │ gh release create (archives)
                                    │          │ update homebrew tap formula
                                    └────┬────┘
                                    ┌────┴────┐
                                    │ verify   │ curl install on macOS + Linux
                                    │          │ npm i -g on macOS + Linux + Windows
                                    │          │ agent-telegram doctor on each
                                    └─────────┘
```

Can also trigger manually: Actions → "Publish agent-telegram" → Run workflow (with dry_run option).

## Current state

### What's built
- Build script (`build.ts`) — compiles for current platform, bundles tdjson, creates archive
- Publish script (`publish.ts`) — publishes to npm with dynamic platform discovery
- Install script (`install`) — curl installer, extracts binary + tdjson
- npm wrapper (`bin/agent-telegram.js`) + postinstall hardlink
- CI workflow (`publish.yml`) — matrix build, publish, verify jobs
- Release script (`release.ts`) — bump, tag, push
- Doctor command — checks binary, tdjson, config, daemon
- Homebrew tap at `avemeva/homebrew-tap`

### What's broken (first CI run, 2026-03-06)

Run `22771383437` — all builds compiled but all smoke tests crashed:

```
error: Cannot find package 'onnxruntime-node' from '/$bunfs/root/agent-telegram'
```

| Runner | Build | Smoke test | Issue |
|--------|-------|-----------|-------|
| macos-14 (ARM) | OK | CRASH | onnxruntime-node import at startup |
| macos-13 (Intel) | — | — | Runner deprecated by GitHub |
| ubuntu-latest | OK | CRASH | Same onnxruntime-node |
| windows-latest | OK | CRASH | Same onnxruntime-node |

**Why it worked locally:** The binary ran next to the monorepo's `node_modules/` which contains `onnxruntime-node`. In CI (and on user machines), there's no `node_modules/`, so it crashes.

**Why we didn't catch it:** We always tested from within the project directory. The `/tmp/` isolation test was identified but not consistently applied.

### What's not yet tested

- No install channel has been tested end-to-end on a real release (curl, npm, brew)
- No cross-platform binary has been verified to actually run
- Windows binary name (.exe) not verified
- Homebrew formula install not verified (local Xcode version blocks it)

---

## Steps to working distribution (in order)

Each step gates the next. The proof for each step is specific and binary — it either works or it doesn't.

### Step 1: Fix onnxruntime-node crash

**Problem:** `--external onnxruntime-node` in `build.ts` makes the binary crash at startup.

**Options:**
- A) Remove `--external` — let Bun bundle/tree-shake it. `@huggingface/transformers` falls back to WASM/WebGPU when native onnxruntime isn't available.
- B) Keep `--external` but ensure nothing in the startup path imports it. Caption code must be fully lazy (dynamic import only on `--caption-daemon`).

**Proof:**
```bash
bun run scripts/build.ts --single
cp dist/agent-telegram-darwin-arm64/bin/agent-telegram /tmp/
/tmp/agent-telegram --version     # must print 0.1.0, not crash
```

### Step 2: Fix macos-13 runner

**Problem:** `macos-13` deprecated. Need a runner for darwin-x64.

**Options:** `macos-15` (runs x64 via Rosetta on ARM), or drop darwin-x64 for now.

**Proof:** CI job starts and doesn't immediately fail with "configuration not supported."

### Step 3: CI dry run — all smoke tests pass

**Trigger:** `gh workflow run publish.yml --repo avemeva/kurier -f dry_run=true`

**Proof:** Every build job green. `agent-telegram --version` succeeds on all runners. This proves the binary starts on macOS, Linux, and Windows — outside the monorepo, on a clean machine.

### Step 4: Create missing secrets

| Secret | Status | Where to create |
|--------|--------|----------------|
| `TG_API_ID` | SET | — |
| `TG_API_HASH` | SET | — |
| `NPM_TOKEN` | **MISSING** | npmjs.com → Settings → Access Tokens → Automation type |
| `HOMEBREW_TAP_TOKEN` | **MISSING** | GitHub → Settings → Fine-grained PAT → `avemeva/homebrew-tap` → Contents: read/write |

### Step 5: First real release

**Trigger:** `cd apps/cli && bun run release patch`

**Proof — check each independently:**

| What | How to check | Pass criteria |
|------|-------------|---------------|
| CI all green | `gh run view <id>` | All 3 jobs (build, publish, verify) green |
| npm packages exist | `npm view @avemeva/agent-telegram` | Shows version 0.1.1 |
| GitHub release exists | `gh release view v0.1.1` | Has 3-4 archive assets |
| Homebrew tap updated | Check `avemeva/homebrew-tap` Formula | Contains `version "0.1.1"` and correct SHAs |
| Verify jobs pass | CI verify job logs | `agent-telegram doctor` passes on fresh macOS + Linux + Windows |

### Step 6: Manual end-to-end

After CI green, verify on your own machine. This is the final proof.

```bash
# Clean slate
trash ~/.local/bin/agent-telegram ~/.local/lib/agent-telegram

# curl install
curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install | bash -s -- --no-modify-path

# The four checks that prove everything works:
agent-telegram --version          # binary starts (no onnxruntime crash)
agent-telegram doctor             # tdjson found, config found
agent-telegram --daemon &         # TDLib proxy starts (tdjson loads)
agent-telegram me                 # live data (full stack works)

# Repeat for npm
trash ~/.local/bin/agent-telegram ~/.local/lib/agent-telegram
npm i -g @avemeva/agent-telegram
agent-telegram --version
agent-telegram doctor
```

---

## Files

### New files (this session)
| File | Purpose |
|------|---------|
| `apps/cli/bin/agent-telegram.js` | npm wrapper (Node.js, replaces `bin/tg.js`) |
| `apps/cli/scripts/release.ts` | One-command release: bump version, tag, push |
| `apps/cli/src/commands/doctor.ts` | `agent-telegram doctor` — checks binary, tdjson, config, daemon |

### Modified files
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

### Deleted files
| File | Replaced by |
|------|------------|
| `apps/cli/bin/tg.js` | `apps/cli/bin/agent-telegram.js` |
