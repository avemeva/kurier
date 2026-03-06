# agent-telegram CLI Packaging — Status & Verification

## How it works

Two modes: **develop** and **release**.

### Develop (daily)

Push code freely. Nothing triggers.

```bash
# write code, commit, push — no CI runs
git add . && git commit -m "whatever" && git push
```

### Release (when ready to ship)

One command. CI does everything else.

```bash
cd apps/cli && bun run release patch
```

This bumps `package.json` (0.1.0 → 0.1.1), commits, tags `v0.1.1`, pushes. CI triggers on the tag:

```
release.ts                          GitHub Actions
──────────                          ──────────────

reads package.json → 0.1.0
bumps to 0.1.1
writes package.json
git add package.json
git commit "release: agent-telegram v0.1.1"
git tag v0.1.1
git push && git push --tags ──────→ tag v0.1.1 arrives
                                         │
                                    publish.yml triggers (on: push: tags: ['v*'])
                                         │
                                    ┌────┴────┐
                                    │  build   │ 4 runners, ~3-5 min
                                    │ (matrix) │ each: bun install → build → smoke test
                                    │          │ macos-14    → darwin-arm64
                                    │          │ macos-13    → darwin-x64
                                    │          │ ubuntu      → linux-x64
                                    │          │ windows     → win32-x64
                                    └────┬────┘
                                    ┌────┴────┐
                                    │ publish  │ ~2 min
                                    │          │ npm publish (5 platform pkgs + 1 wrapper)
                                    │          │ gh release create (4 archives)
                                    │          │ update homebrew tap formula
                                    └────┬────┘
                                    ┌────┴────┐
                                    │ verify   │ ~2 min
                                    │          │ curl install on macOS + Linux
                                    │          │ npm i -g on macOS + Linux + Windows
                                    │          │ agent-telegram doctor on each
                                    └─────────┘

After ~10 min, users can install:

  curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install | bash
  npm i -g @avemeva/agent-telegram
  brew install avemeva/tap/agent-telegram
```

The release script guards against dirty working tree — commit or stash first.

Can also trigger CI manually: Actions → "Publish agent-telegram" → Run workflow (with dry_run option).

---

## Architecture

```
agent-telegram binary (compiled Bun, bundles tdjson)
├── agent-telegram --daemon           → TDLib HTTP proxy (port 7312)
├── agent-telegram --caption-daemon   → Caption HTTP server (port 7313)
├── agent-telegram doctor             → Installation health check
├── agent-telegram media caption run  → auto-spawns caption daemon
└── agent-telegram me                 → live Telegram query
```

Distribution channels:
```
npm i -g @avemeva/agent-telegram   → wrapper + platform optionalDep → hardlink → binary
brew install avemeva/tap/agent-telegram → archive from GitHub release
curl install | bash       → archive from GitHub release → ~/.local/bin/
bun run release <patch|minor|major>    → bump, tag, push → CI does the rest
```

## Release flow

```
You (local)                         CI (GitHub Actions)
───────────                         ───────────────────

cd apps/cli
bun run release patch
  ├─ bumps package.json (0.1.0 → 0.1.1)
  ├─ commits: "release: agent-telegram v0.1.1"
  ├─ tags: v0.1.1
  └─ pushes commit + tag ──────→ triggers on: push: tags: ['v*']
                                       │
                                 ┌─────┴──────┐
                                 │ build (×4)  │  4 native runners
                                 │ macos-14    │  darwin-arm64
                                 │ macos-13    │  darwin-x64
                                 │ ubuntu      │  linux-x64
                                 │ windows     │  win32-x64
                                 └─────┬──────┘
                                       │ smoke test: --version
                                 ┌─────┴──────┐
                                 │  publish    │
                                 │  npm pkgs   │  5 platform + 1 wrapper
                                 │  gh release │  4 archives
                                 │  brew tap   │  auto-update formula
                                 └─────┬──────┘
                                 ┌─────┴──────┐
                                 │  verify     │
                                 │  curl + npm │  on macOS, Linux, Windows
                                 │  doctor     │  checks binary + tdjson
                                 └─────────────┘
```

Can also trigger manually: Actions → "Publish agent-telegram" → Run workflow (with dry_run option).

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
| `apps/cli/scripts/publish.ts` | Fixed workspace resolution bug (.cwd()), dynamic platform discovery, renamed packages |
| `apps/cli/scripts/postinstall.mjs` | Renamed binary/package references |
| `.github/workflows/publish.yml` | Matrix build (4 runners), tag trigger, auto homebrew tap update, verify job |
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

---

## First CI run results (dry_run, 2026-03-06)

Run ID: `22771383437`. All 4 build jobs failed at smoke test. Build step succeeded on all.

| Runner | Build | Smoke test | Error |
|--------|-------|-----------|-------|
| macos-14 (ARM) | OK | FAIL | `Cannot find package 'onnxruntime-node' from '/$bunfs/root/agent-telegram'` |
| macos-13 (Intel) | — | — | Runner `macos-13` no longer exists (deprecated by GitHub) |
| ubuntu-latest | OK | FAIL | Same onnxruntime-node error |
| windows-latest | OK | FAIL | Same onnxruntime-node error |

**Root cause:** `--external onnxruntime-node` in `build.ts` tells Bun "don't bundle this, require() it at runtime." The compiled binary then crashes on startup trying to find `onnxruntime-node` in a nonexistent `node_modules/`. Locally this works because the binary runs next to the monorepo's `node_modules/`. In CI (and on user machines) it always fails.

---

## What must be done (in order)

Each step gates the next. Don't skip ahead.

### Step 1: Fix the binary crash (onnxruntime-node)

**Problem:** `--external onnxruntime-node` makes every compiled binary crash on startup with `Cannot find package 'onnxruntime-node'`. This is not a test issue — the binary literally doesn't start.

**Fix options:**
- A) Remove `--external onnxruntime-node` from build.ts — let Bun bundle it (native addon won't work, but `@huggingface/transformers` falls back to WASM/WebGPU automatically)
- B) Keep `--external` but lazy-import: make sure nothing in the startup path imports `onnxruntime-node`. Currently the import chain is: `index.ts` → some transitive dep → `@huggingface/transformers` → `onnxruntime-node`. The caption code must be fully lazy (dynamic import only when `--caption-daemon` flag is used).

**Verify:** Build with `--single`, then copy the binary to `/tmp/` (away from node_modules) and run `/tmp/agent-telegram --version`. If it prints `0.1.0`, it works. If it crashes, it doesn't. This is the real test — not running from inside the monorepo.

### Step 2: Fix macos-13 runner

**Problem:** GitHub deprecated `macos-13`. The workflow references it for darwin-x64.

**Fix:** Change to `macos-15` (Intel Macs via Rosetta) or drop darwin-x64 from the matrix for now. Check available runners at https://github.com/actions/runner-images.

**Verify:** CI build job for darwin-x64 starts and completes.

### Step 3: CI dry run — all builds pass smoke test

**Trigger:** `gh workflow run publish.yml --repo avemeva/kurier -f dry_run=true`

**Verify:** All build matrix jobs green. Smoke test (`agent-telegram --version`) passes on every runner. This proves the binary starts on macOS, Linux, and Windows outside the monorepo.

### Step 4: Create secrets

| Secret | Where to create | How to set |
|--------|----------------|------------|
| `NPM_TOKEN` | npmjs.com → Settings → Access Tokens → Automation type | `gh secret set NPM_TOKEN --repo avemeva/kurier` |
| `HOMEBREW_TAP_TOKEN` | GitHub → Settings → Developer settings → Fine-grained PAT → scope to `avemeva/homebrew-tap` → Contents: read/write | `gh secret set HOMEBREW_TAP_TOKEN --repo avemeva/kurier` |

`TG_API_ID` and `TG_API_HASH` are already set.

### Step 5: Full CI run (not dry) — publish works

**Trigger:** `cd apps/cli && bun run release patch` (bumps to 0.1.1, tags, pushes, triggers CI)

**Verify each stage independently:**

| Stage | What to check | How | Pass criteria |
|-------|-------------|-----|---------------|
| Build | All runners compile + smoke test | `gh run view <id>` | All build jobs green |
| npm publish | Packages appear on registry | `npm view @avemeva/agent-telegram` | Returns version 0.1.1 |
| GitHub release | Archives uploaded | `gh release view v0.1.1 --repo avemeva/kurier` | Shows 3-4 `.zip`/`.tar.gz` assets |
| Homebrew tap | Formula updated | `gh api repos/avemeva/homebrew-tap/contents/Formula/agent-telegram.rb` | Contains `version "0.1.1"` |
| Verify: curl | Install script works on fresh runner | CI verify job green | `agent-telegram --version` → 0.1.1 |
| Verify: npm | npm install works on fresh runner | CI verify job green | `agent-telegram --version` → 0.1.1 |

### Step 6: Manual end-to-end on your machine

After CI is fully green, verify yourself:

```bash
# 1. Remove everything
trash ~/.local/bin/agent-telegram
trash ~/.local/lib/agent-telegram

# 2. curl install
curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install | bash -s -- --no-modify-path

# 3. Verify the full chain
agent-telegram --version          # binary runs
agent-telegram doctor             # tdjson found, config ok
agent-telegram --daemon &         # daemon starts
agent-telegram me                 # live Telegram data
agent-telegram media caption run ~/.tg/photos/<any>.jpg  # caption works (if model downloaded)

# 4. npm install (separate test)
trash ~/.local/bin/agent-telegram
npm i -g @avemeva/agent-telegram
agent-telegram --version
agent-telegram doctor
```

If all of the above work, the distribution is proven end-to-end.

---

## Secrets status

| Secret | Status |
|--------|--------|
| `TG_API_ID` | SET |
| `TG_API_HASH` | SET |
| `NPM_TOKEN` | **MISSING** — create at npmjs.com → Settings → Access Tokens → Automation type |
| `HOMEBREW_TAP_TOKEN` | **MISSING** — create GitHub PAT with `Contents: read/write` on `avemeva/homebrew-tap` |

## Reference sources used

| Source | What we adapted |
|--------|----------------|
| `opencode/packages/opencode/script/build.ts` | Bun.build() compile pattern, --single flag |
| `opencode/packages/opencode/bin/opencode` | Node wrapper: platform detection, binary resolution |
| `opencode/packages/opencode/script/postinstall.mjs` | Hardlink pattern, npm shim patching |
| `opencode/packages/opencode/script/publish.ts` | npm publish pipeline, Homebrew formula generation |
| `opencode/install` | Bash install: platform/Rosetta detection, progress bar, PATH modification |
| `opencode/.github/workflows/publish.yml` | CI/CD pattern |
| `agent-browser/bin/agent-browser.js` | Simpler Node wrapper pattern |
| `agent-browser/.github/workflows/release.yml` | Simpler CI: build → publish |
