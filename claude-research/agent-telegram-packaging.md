# agent-telegram CLI Packaging

## Goal

A person runs one command and gets a working Telegram CLI. No build tools, no dependencies, no second step.

```bash
brew install avemeva/tap/agent-telegram        # macOS/Linux
curl -fsSL .../install | bash                  # macOS/Linux
npm i -g @avemeva/agent-telegram               # all platforms
bun i -g @avemeva/agent-telegram               # all platforms
winget install agent-telegram                  # Windows
```

After any of these:

```bash
agent-telegram --version      # binary starts
agent-telegram doctor         # tdjson found, config found
agent-telegram --daemon &     # TDLib proxy starts
agent-telegram me             # live Telegram data returns
```

If any step fails, the distribution is broken.

---

## Architecture

```
agent-telegram binary (compiled Bun)
├── agent-telegram --daemon           → TDLib HTTP proxy (port 7312, needs libtdjson + tdl.node)
├── agent-telegram --caption-daemon   → Caption HTTP server (port 7313, WASM/WebGPU)
├── agent-telegram doctor             → Installation health check
└── agent-telegram <command>          → HTTP client to daemon
```

### Native dependencies (unique challenge vs opencode/agent-browser)

Neither opencode nor agent-browser ships native libraries — they're pure compiled JS. We have TWO:

| Component | Size | What | Shipped? |
|-----------|------|------|----------|
| `libtdjson.{dylib,so,dll}` | 30MB | TDLib C++ shared library | Yes — in `lib/` |
| `tdl.node` | ~72KB | Native Node.js addon, loads tdjson via dlopen | Yes — in `bin/prebuilds/<platform>-<arch>/` |

Loading chain: `node-gyp-build` → finds `tdl.node` → `tdl.node` does `dlopen(libtdjson)`.

### Archive contents (what gets distributed)

```
├── bin/agent-telegram                → 60MB compiled binary
├── bin/prebuilds/<platform>-<arch>/tdl.node  → ~72KB native addon
└── lib/libtdjson.{dylib,so,dll}     → 30MB TDLib native library
```

### Install locations by channel

```
brew install avemeva/tap/agent-telegram
  → /opt/homebrew/Cellar/agent-telegram/<ver>/bin/agent-telegram
  → /opt/homebrew/Cellar/agent-telegram/<ver>/lib/agent-telegram/libtdjson.dylib
  → formula downloads zip from GitHub Release, runs bin.install + lib.install

curl -fsSL .../install | bash
  → ~/.local/bin/agent-telegram
  → ~/.local/lib/agent-telegram/libtdjson.{dylib,so}
  → detects platform/arch, downloads from GitHub Release, modifies PATH

npm i -g @avemeva/agent-telegram
  → wrapper package pulls platform optionalDep (@avemeva/agent-telegram-darwin-arm64, etc.)
  → postinstall hardlinks binary from platform pkg to bin/
  → tdjson copied to ~/.local/lib/agent-telegram/

bun i -g @avemeva/agent-telegram
  → same as npm (uses same package/postinstall)
```

---

## Release flow

```bash
# Day-to-day: push code freely, nothing triggers
git add . && git commit -m "whatever" && git push

# Release: one command, CI does everything else
cd apps/cli && bun run release patch
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
                                    │          │ macos-??    → darwin-x64 (TODO)
                                    │          │ ubuntu      → linux-x64
                                    │          │ ubuntu-arm  → linux-arm64 (TODO)
                                    │          │ windows     → win32-x64
                                    └────┬────┘
                                         │ smoke test: --version + --daemon health check
                                    ┌────┴────┐
                                    │ publish  │ ~2 min
                                    │          │ npm publish (platform pkgs + wrapper)
                                    │          │ gh release create (archives)
                                    │          │ push formula to homebrew tap
                                    └────┬────┘
                                    ┌────┴────┐
                                    │ verify   │ ~2 min
                                    │          │ brew/curl/npm/bun install per platform
                                    │          │ --version + doctor + --daemon health check
                                    └─────────┘
```

Can also trigger manually: Actions → "Publish agent-telegram" → Run workflow (with dry_run option).

---

## What's been done

### Files created/modified

| File | Purpose |
|------|---------|
| `apps/cli/bin/agent-telegram.js` | npm wrapper (Node.js, replaces old `bin/tg.js`) |
| `apps/cli/scripts/release.ts` | One-command release: bump version, tag, push |
| `apps/cli/scripts/build.ts` | Bun compile, bundles tdjson, `--external @huggingface/transformers` |
| `apps/cli/scripts/publish.ts` | npm publish pipeline, dynamic platform discovery, Homebrew formula generation |
| `apps/cli/scripts/postinstall.mjs` | npm postinstall: hardlinks binary from platform pkg |
| `apps/cli/src/commands/doctor.ts` | `agent-telegram doctor` — checks binary, tdjson, config, daemon |
| `apps/cli/src/index.ts` | CLI name `agent-telegram`, registered doctor command |
| `packages/protocol/src/paths.ts` | `~/.local/lib/tg` → `~/.local/lib/agent-telegram` (all platform paths) |
| `install` | Bash curl install script (renamed tg → agent-telegram) |
| `.github/workflows/publish.yml` | Matrix build, tag trigger, homebrew tap update, verify job |

### Issues resolved

**1. onnxruntime-node crash (v0.1.0)**
`--external onnxruntime-node` told Bun "require() at runtime" → binary crashes outside monorepo.
Fix: changed to `--external @huggingface/transformers` (lazy-loaded, not needed at startup).

**2. npm OTP failure (v0.1.2, v0.1.3)**
Granular token created without "Bypass 2FA" → `EOTP` error in CI.
Fix: recreated token with Bypass 2FA checked. Immutable after creation — must recreate.

**3. Homebrew formula iterations (v0.1.4, v0.1.5)**
- Duplicate formula generation (workflow heredoc vs publish.ts) → single source of truth in publish.ts
- Empty sha256 for unbuilt platforms → only include platforms with archives
- Homebrew 5.x "Xcode too outdated" → requires Xcode 26 on macOS Tahoe (not a bug, real requirement)
- Cask tried as workaround → quarantine xattr blocks unsigned binary
- Formula works fine once Xcode 26 installed — no code signing needed

### Completed verification

| # | What | Proof | Status |
|---|------|-------|--------|
| CI builds | darwin-arm64, linux-x64, win32-x64 | Run 22774389355: all green | DONE |
| npm publish | `@avemeva/agent-telegram@0.1.5` on registry | `npm view` confirms | DONE |
| GitHub release | 3 archives (darwin-arm64.zip, linux-x64.tar.gz, win32-x64.tar.gz) | `gh release view v0.1.5` | DONE |
| Homebrew tap | Formula v0.1.5, correct platforms | `avemeva/homebrew-tap` repo | DONE |
| CI verify: curl | macOS + Linux | Both pass --version + doctor | DONE |
| CI verify: npm | macOS + Linux + Windows | All pass --version + doctor | DONE |
| Local: curl install | Clean slate, doctor all green | v0.1.5 | DONE |
| Local: npm install | Clean slate, doctor all green | v0.1.5 | DONE |
| Local: brew install | Clean slate, doctor all green | v0.1.5, formula (not cask), no code signing needed | DONE |

**All 3 install channels work for --version + doctor. Daemon crashes (see TODO).**

---

## TODO

### Step 7: Fix daemon on Linux (BLOCKING)

**Status as of v0.1.11:** Daemon works on macOS (all channels), fails on ALL Linux verify jobs.

**What works (v0.1.11 CI run 22786956864):**
- All 5 builds pass (including daemon smoke test on all non-Windows)
- macOS verify: curl, npm, bun, brew — ALL PASS
- Windows verify: npm — PASS

**What fails:**
- Linux verify: curl, npm, bun on ubuntu-latest AND ubuntu-24.04-arm — ALL FAIL
- Error: `No native build was found for platform=linux arch=x64 runtime=node ...`
- `loaded from: /home/runner/work/kurier/kurier/node_modules/tdl` (baked CI path)

**Confirmed facts:**
- Prebuilds ARE installed by curl script (log: `Installed tdl.node prebuilds to /home/runner/.local/bin/prebuilds`)
- Build smoke test passes (prebuilds found because baked path EXISTS on build runner — same machine)
- macOS verify passes (prebuilds found via `process.execPath` fallback in node-gyp-build)
- Linux verify fails (prebuilds NOT found via `process.execPath` fallback)

**Root cause hypothesis:**
`node-gyp-build` falls back to `path.dirname(process.execPath)` to search for prebuilds. This works on macOS but fails on Linux. [assumption] Possible Bun compiled binary behavior difference — `process.execPath` may resolve differently on Linux (e.g. via `/proc/self/exe` to a different resolved path), or `fs.readdirSync` may behave differently in the Bun virtual filesystem context.

**Investigation approach:**
- Debug locally with Docker: `docker run --rm -v $(pwd)/apps/cli/dist:/dist ubuntu:24.04 /dist/agent-telegram-linux-x64/bin/agent-telegram --daemon`
- Check `process.execPath` value on Linux compiled binary
- Check if `fs.readdirSync(path.dirname(process.execPath) + '/prebuilds')` works

**Fix options:**
1. **Debug process.execPath on Linux** — understand why the fallback search fails
2. **Bypass node-gyp-build entirely** — preload the addon from a known path before tdl imports it
3. **Replace `tdl` with `bun:ffi`** — dlopen tdjson directly, no native addon needed at all (cleanest but largest change)
4. **Set env var** — `process.env.TDL_PREBUILD = path.dirname(process.execPath)` before tdl is loaded (only works if the baked package.json is readable from bundled filesystem)

| # | What | Status |
|---|------|--------|
| 7.4 | Understand why node-gyp-build process.execPath fallback fails on Linux | TODO |
| 7.5 | Fix Linux daemon to find tdl.node | TODO |
| 7.6 | CI verify: all Linux jobs pass | TODO |

### Step 6.5: Local clean brew install verification — DONE

Full clean-slate verification on the developer's machine (v0.1.11):

| # | What | How to verify | Status |
|---|------|-------------|--------|
| 6.5.1 | Uninstall existing brew formula | `brew uninstall agent-telegram` | DONE |
| 6.5.2 | Remove brew cache | Cleared cached downloads | DONE |
| 6.5.3 | Remove any leftover tdjson/tdl.node | Verified no leftovers | DONE |
| 6.5.4 | Fresh `brew install avemeva/tap/agent-telegram` | v0.1.11 installed, 6 files, 91.4MB | DONE |
| 6.5.5 | `agent-telegram --version` | Returns `0.1.11` | DONE |
| 6.5.6 | `agent-telegram doctor` | All checks passed (binary, tdjson, config, daemon) | DONE |
| 6.5.7 | `agent-telegram --daemon` starts + health check | `{"ok":true,"uptime":0,"pid":29408}` | DONE |
| 6.5.8 | `agent-telegram me` returns live data | `getMe` returned user JSON (avemeva, id: 91754006) | DONE |

### Step 8: Harden CI smoke tests — DONE

| # | What | Status |
|---|------|--------|
| 8.1 | Build job: daemon smoke test | DONE — all 4 non-Windows builds test daemon health |
| 8.2 | Verify job: daemon test | DONE — "Verify daemon" step (skipped on Windows) |
| 8.3 | Bun install channel | DONE — macos-14, ubuntu-latest |
| 8.4 | Brew install channel | DONE — macos-14 |

### Step 9: npm trusted publishers — PARTIALLY DONE

| # | What | Status |
|---|------|--------|
| 9.1 | Configure trusted publisher on npmjs.com | TODO — requires browser/web UI |
| 9.2 | `publish.yml` has `id-token: write` + `--provenance` | DONE (v0.1.7) |
| 9.3 | Remove `NPM_TOKEN` secret from GitHub | TODO — after 9.1 verified working |

### Step 10: Missing platforms — DONE

| # | What | Runner | Status |
|---|------|--------|--------|
| 10.1 | darwin-x64 build | macos-15-intel | DONE (v0.1.7) |
| 10.2 | linux-arm64 build | ubuntu-24.04-arm | DONE (v0.1.7) |

### Step 11: Cleanup — DONE

| # | What | Status |
|---|------|--------|
| 11.1 | Remove cask from homebrew tap | DONE — commit b90bf7a |

### Step 12: winget — PARTIALLY DONE

| # | What | Status |
|---|------|--------|
| 12.1 | Create winget manifest | DONE — generated by `publish.ts` (v0.1.7) |
| 12.2 | Submit to winget-pkgs repo | TODO — requires PR to `microsoft/winget-pkgs` |
| 12.3 | Add winget to CI verify matrix (windows) | TODO — after 12.2 accepted |

---

## Target matrix

### Build matrix (CI must produce a binary)

| Platform | Runner | Status |
|----------|--------|--------|
| darwin-arm64 | macos-14 | DONE |
| darwin-x64 | macos-15-intel | DONE |
| linux-x64 | ubuntu-latest | DONE |
| linux-arm64 | ubuntu-24.04-arm | DONE |
| win32-x64 | windows-latest | DONE |

### Verify matrix (CI must test install + daemon)

`full` = --version + doctor + daemon starts + health check responds.
`partial` = --version + doctor only (no daemon test).
`broken` = install works, daemon crashes (tdl.node not found).

| | curl | npm | bun | brew | winget |
|---|---|---|---|---|---|
| darwin-arm64 | full | full | full | full | — |
| darwin-x64 | full | full | — | — | — |
| linux-x64 | broken | broken | broken | — | — |
| linux-arm64 | broken | broken | — | — | — |
| win32-x64 | — | partial | — | — | TODO |

---

## Secrets

| Secret | Status | Notes |
|--------|--------|-------|
| `TG_API_ID` | SET | Telegram API credentials |
| `TG_API_HASH` | SET | Telegram API credentials |
| `NPM_TOKEN` | SET | Granular token `ci-publish`, Bypass 2FA, expires Jun 4 2026. TODO: replace with trusted publishers |
| `HOMEBREW_TAP_TOKEN` | SET | Fine-grained PAT `homebrew-tap-ci`, expires Apr 5 2026 |

---

## Context for future agents

### Instructions for agents

- Do not ask questions — figure it out yourself or use the chrome-extension MCP tools for manual browser tasks (npm settings, GitHub settings, etc.)
- Do not stop until all TODOs are done
- Output COMPLETE when ALL steps are finished

### Key files to read

| File | Why |
|------|-----|
| `apps/cli/scripts/build.ts` | Build mechanics, tdjson bundling, externals. **This is where tdl.node needs to be added.** |
| `apps/cli/scripts/publish.ts` | npm publish pipeline, platform discovery, Homebrew formula generation |
| `apps/cli/scripts/release.ts` | Bump + tag + push automation |
| `apps/cli/bin/agent-telegram.js` | npm wrapper: finds platform binary in node_modules |
| `apps/cli/scripts/postinstall.mjs` | npm postinstall: hardlinks binary |
| `apps/cli/src/commands/doctor.ts` | Installation health check |
| `apps/cli/src/index.ts` | Entry point — `--daemon` and `--caption-daemon` pre-Commander checks |
| `apps/cli/src/daemon.ts` | TDLib daemon — where tdl is used |
| `packages/protocol/src/paths.ts` | All platform-specific paths (lib dir, app dir, config dir) |
| `packages/protocol/src/proxy/index.ts` | Where `tdl.configure()` is called (triggers addon load) |
| `install` | Bash curl install script |
| `.github/workflows/publish.yml` | CI/CD workflow |

### Native addon chain (critical for Step 7)

```
node_modules/tdl/dist/addon.js          → calls node-gyp-build(packageDir)
node_modules/node-gyp-build/index.js    → searches prebuilds/<platform>-<arch>/ relative to:
                                            1. packageDir (baked CI path — broken)
                                            2. path.dirname(process.execPath) (next to binary — works if we put it there)
node_modules/tdl/prebuilds/
  darwin-arm64/tdl.node                  → the file that needs to be shipped
  linux-x64/tdl.node
  win32-x64/tdl.node
```

### Reference implementations

| Source | What we took |
|--------|-------------|
| opencode (`/Users/andrey/Projects/opencode`) | Bun.build() compile, npm wrapper, postinstall hardlink, publish pipeline, Homebrew formula (conditional url/sha256 per platform) |
| agent-browser (`/Users/andrey/Projects/agent-browser`) | Simpler npm wrapper, in homebrew-core (not a tap) |

### Lessons learned

1. **npm granular tokens' 2FA bypass is immutable** — must be set during creation
2. **Homebrew formula (not cask) is correct for CLI tools** — no quarantine, no code signing needed
3. **macOS Tahoe requires Xcode 26 for Homebrew formula installs from taps** — not a bug
4. **`bun build --compile` can't bundle .node native addons** — they must be shipped as separate files
5. **Smoke tests must test the daemon, not just --version** — the tdl.node crash went undetected for 4 releases
6. **Cached Homebrew downloads carry xattrs** — if you previously installed a cask, the cached zip has quarantine. Clear cache before testing formula.
7. **`node-gyp-build` searches `path.dirname(process.execPath)`** — ship `prebuilds/<platform>-<arch>/tdl.node` next to the binary and it just works
8. **Hoisted deps in monorepos** — `tdl` lives at root `node_modules/`, not `apps/cli/node_modules/`. Paths in build scripts must account for this (`../../node_modules/tdl/`)
