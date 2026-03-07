# agent-telegram CLI Packaging

## Goal

A person runs one command and gets a working Telegram CLI. No build tools, no dependencies, no second step.

```bash
brew install avemeva/tap/agent-telegram        # macOS
curl -fsSL .../install | bash                  # macOS/Linux
npm i -g @avemeva/agent-telegram               # all platforms
bun i -g @avemeva/agent-telegram               # all platforms
irm .../install.ps1 | iex                      # Windows PowerShell
curl -fsSL .../install.cmd -o i.cmd && i.cmd   # Windows CMD
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

### Step 7: Fix daemon on Linux — DONE

**Root cause:** `tdl` ships prebuilds with platform-specific filenames: `tdl.node` (macOS/Windows), `tdl.glibc.node` (linux-x64), `tdl.armv8.glibc.node` (linux-arm64). Build script hardcoded `tdl.node`, so `copyFileSync` silently failed on Linux — the prebuilds directory was created but empty. `node-gyp-build` found nothing and fell back to the baked CI path.

**Fix (v0.1.12):** Changed `build.ts` to copy all `*.node` files from the prebuilds directory instead of hardcoding the filename. Also fixed the CI prebuild check in `publish.yml` to use `*.node` glob.

**Verified:** CI run 22787845543 — all 18 jobs passed, including all Linux verify jobs (curl, npm, bun on ubuntu-latest + ubuntu-24.04-arm).

| # | What | Status |
|---|------|--------|
| 7.4 | Root cause: prebuild filename mismatch (tdl.node vs tdl.glibc.node) | DONE |
| 7.5 | Fix: copy all *.node files from prebuilds dir | DONE (v0.1.12) |
| 7.6 | CI verify: all Linux jobs pass | DONE — run 22787845543 |

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

### Step 9: npm trusted publishers — DONE

Trusted publishers configured via npmjs.com web UI (avemeva/kurier, publish.yml workflow).

| # | What | Status |
|---|------|--------|
| 9.1a | Configure trusted publisher: `@avemeva/agent-telegram` | DONE |
| 9.1b | Configure trusted publisher: `@avemeva/agent-telegram-darwin-arm64` | DONE |
| 9.1c | Configure trusted publisher: `@avemeva/agent-telegram-darwin-x64` | DONE |
| 9.1d | Configure trusted publisher: `@avemeva/agent-telegram-linux-x64` | DONE |
| 9.1e | Configure trusted publisher: `@avemeva/agent-telegram-linux-arm64` | DONE |
| 9.1f | Configure trusted publisher: `@avemeva/agent-telegram-win32-x64` | DONE |
| 9.2 | `publish.yml` has `id-token: write` + `--provenance` | DONE (v0.1.7) |
| 9.3 | Remove `NPM_TOKEN` secret from GitHub | DONE |

### Step 10: Missing platforms — DONE

| # | What | Runner | Status |
|---|------|--------|--------|
| 10.1 | darwin-x64 build | macos-15-intel | DONE (v0.1.7) |
| 10.2 | linux-arm64 build | ubuntu-24.04-arm | DONE (v0.1.7) |

### Step 11: Cleanup — DONE

| # | What | Status |
|---|------|--------|
| 11.1 | Remove cask from homebrew tap | DONE — commit b90bf7a |

### Step 12: Windows install scripts — TODO

**Original plan:** winget. **Problem:** winget requires manual PRs to `microsoft/winget-pkgs` for every release — not automatable, not sustainable.

**New plan:** Follow Claude Code's approach — PowerShell and CMD install scripts that download from GitHub Releases directly. No package manager dependency.

**Reference implementations fetched and analyzed:**
- `claude.ai/install.sh` → GCS bucket, manifest.json checksums, `claude install` subcommand
- `claude.ai/install.ps1` → PowerShell, same pattern for Windows
- `claude.ai/install.cmd` → CMD fallback, delegates to PowerShell when possible

**Key difference:** Claude Code has a `claude install` subcommand that handles placement. We don't — our install scripts must handle placement directly because the binary needs companion files (prebuilds, tdjson) already in place to function.

**Windows install locations:**
```
%LOCALAPPDATA%\Programs\agent-telegram\
  bin\agent-telegram.exe                        → binary
  bin\prebuilds\win32-x64\tdl.node              → native addon (next to binary for node-gyp-build)
  lib\tdjson.dll                                → TDLib shared library
```

**Checksum verification:** Generate `checksums.txt` during CI (sha256sum of all archives), upload as release asset. Scripts verify against it. Standard pattern (goreleaser, Deno, Bun).

| # | What | Status |
|---|------|--------|
| 12.1 | ~~winget manifest~~ | ABANDONED — manual PRs not sustainable |
| 12.2 | ~~winget-pkgs PR~~ | ABANDONED — close PR #346119 |
| 12.3 | Generate `checksums.txt` in publish job | DONE |
| 12.4 | Add SHA256 verification to bash `install` script | DONE |
| 12.5 | Create `install.ps1` (PowerShell, primary Windows installer) | DONE |
| 12.6 | Create `install.cmd` (CMD fallback, delegates to PS1 when possible) | DONE |
| 12.7 | Verify `paths.ts` returns correct Windows paths for `%LOCALAPPDATA%` | DONE (already correct) |
| 12.8 | Add Windows ps1 to CI verify matrix | DONE |

**Acceptance criteria (Windows ps1/cmd):**

| # | What | How to verify | Status |
|---|------|---------------|--------|
| W1 | `irm .../install.ps1 \| iex` completes | CI windows-latest | TODO |
| W2 | `agent-telegram --version` returns version | CI verify | TODO |
| W3 | `agent-telegram doctor` all checks pass | CI verify | TODO |
| W4 | `agent-telegram --daemon` starts + health check | CI verify | TODO |
| W5 | `agent-telegram me` returns live data | Manual (needs auth) | TODO |

**Hosting:** `https://raw.githubusercontent.com/avemeva/kurier/main/install.ps1` (always latest, not pinned to release tag — matches Claude Code's pattern).

### Step 13: License — DONE

| # | What | Status |
|---|------|--------|
| 13.1 | Add `LICENSE` file to repo root (GPL v3) | DONE |
| 13.2 | Add `license: "GPL-3.0"` to root `package.json` | DONE |
| 13.3 | Add `license: "GPL-3.0"` to `apps/cli/package.json` | DONE |
| 13.4 | Update npm wrapper package license in `publish.ts` | DONE |

### Step 14: Verify trusted publishing — TODO

First release without `NPM_TOKEN`. Must confirm OIDC auth works end-to-end.

| # | What | Status |
|---|------|--------|
| 14.1 | Trigger a release (patch bump) | TODO |
| 14.2 | Confirm npm publish succeeds via OIDC (no token) | TODO |
| 14.3 | Confirm provenance attestation appears on npmjs.com | TODO |
| 14.4 | Confirm all verify jobs pass | TODO |

**Rollback plan:** If OIDC publish fails, recreate an `NPM_TOKEN` granular token with Bypass 2FA, add as secret, restore `NODE_AUTH_TOKEN` env var in workflow.

### Step 15: Skill distribution + README — IN PROGRESS

**How it works:** Skill lives in a dedicated repo (`avemeva/agent-telegram`). The publish job copies SKILL.md from the monorepo to the skill repo on every release — same pattern as Homebrew tap. This guarantees skill ↔ CLI version match.

**Source of truth:** `.claude/skills/agent-telegram/SKILL.md` in kurier (already exists, 17KB).

**Distribution repo:** `avemeva/agent-telegram` — users install with:
```bash
claude install-skill avemeva/agent-telegram
```

**Publish flow (same as homebrew tap):**
1. `publish.yml` clones `avemeva/agent-telegram`
2. Copies `.claude/skills/agent-telegram/SKILL.md` (+ reports/ + README.md) to repo
3. Commits "Update skill to v${VERSION}", pushes
4. Uses `HOMEBREW_TAP_TOKEN` — will fail if PAT scope doesn't include `avemeva/agent-telegram`

| # | What | Status |
|---|------|--------|
| 15.1 | Create `avemeva/agent-telegram` repo on GitHub | DONE |
| 15.2 | Add skill push step to `publish.yml` (mirror homebrew tap pattern) | DONE |
| 15.3 | Create/reuse fine-grained PAT for skill repo push | REUSING HOMEBREW_TAP_TOKEN — may need new PAT if scope is too narrow |
| 15.4 | Update `apps/cli/README.md` with all install methods (brew, curl, npm, bun, ps1, cmd) | DONE |
| 15.5 | Add "Best suited for Claude Code" section to README | DONE |
| 15.6 | Add `claude install-skill avemeva/agent-telegram` to README | DONE |
| 15.7 | Verify skill install works end-to-end | TODO — pending release |

### FUTURE: GitHub org

Create a `kurier` GitHub org to own repos:
- `kurier/kurier` (monorepo, replaces `avemeva/kurier`)
- `kurier/agent-telegram` (skill repo)
- `kurier/homebrew-tap` (replaces `avemeva/homebrew-tap`)
- npm scope: `@kurier/agent-telegram` (replaces `@avemeva/agent-telegram`)

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

| | curl/bash | npm | bun | brew | ps1 | cmd |
|---|---|---|---|---|---|---|
| darwin-arm64 | full | full | full | full | — | — |
| darwin-x64 | full | full | — | — | — | — |
| linux-x64 | full | full | full | — | — | — |
| linux-arm64 | full | full | — | — | — | — |
| win32-x64 | — | partial | — | — | TODO | TODO |

---

## Secrets

| Secret | Status | Notes |
|--------|--------|-------|
| `TG_API_ID` | SET | Telegram API credentials |
| `TG_API_HASH` | SET | Telegram API credentials |
| `NPM_TOKEN` | REMOVED | Replaced by trusted publishers (OIDC). All 6 packages configured. |
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
| Claude Code (`claude.ai/install.{sh,ps1,cmd}`) | PowerShell/CMD install scripts pattern, checksums.txt, always-latest bootstrap from main branch |
| skills.sh | Skill distribution format: SKILL.md with YAML frontmatter, references/ dir for detailed docs |
| tdesktop (`/Users/andrey/Projects/tdesktop`) | GPL v3 license (standard for Telegram ecosystem) |

### Lessons learned

1. **npm granular tokens' 2FA bypass is immutable** — must be set during creation
2. **Homebrew formula (not cask) is correct for CLI tools** — no quarantine, no code signing needed
3. **macOS Tahoe requires Xcode 26 for Homebrew formula installs from taps** — not a bug
4. **`bun build --compile` can't bundle .node native addons** — they must be shipped as separate files
5. **Smoke tests must test the daemon, not just --version** — the tdl.node crash went undetected for 4 releases
6. **Cached Homebrew downloads carry xattrs** — if you previously installed a cask, the cached zip has quarantine. Clear cache before testing formula.
7. **`node-gyp-build` searches `path.dirname(process.execPath)`** — ship `prebuilds/<platform>-<arch>/tdl.node` next to the binary and it just works
8. **Hoisted deps in monorepos** — `tdl` lives at root `node_modules/`, not `apps/cli/node_modules/`. Paths in build scripts must account for this (`../../node_modules/tdl/`)
9. **winget requires manual PRs** — every release needs a PR to `microsoft/winget-pkgs`. Not automatable. Direct install scripts (PowerShell/CMD) are better — see Claude Code's approach (`claude.ai/install.ps1`, `claude.ai/install.cmd`)
