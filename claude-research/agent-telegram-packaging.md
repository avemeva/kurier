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

## Verification table

| # | What to verify | How to check | Possible failure | Status |
|---|---------------|-------------|-----------------|--------|
| **Local build** | | | | |
| 1 | Binary compiles | `cd apps/cli && bun run scripts/build.ts --single` | Bun version, missing credentials | PASSED |
| 2 | tdjson bundled in dist | `ls apps/cli/dist/agent-telegram-darwin-arm64/lib/` | prebuilt-tdlib not installed | PASSED |
| 3 | Archive has bin + lib | `unzip -l apps/cli/dist/agent-telegram-darwin-arm64.zip` | Archive cwd wrong | PASSED |
| 4 | `--version` works | `agent-telegram --version` | Entry point broken | PASSED |
| 5 | `doctor` works | `agent-telegram doctor` | tdjson path wrong | PASSED |
| 6 | Live Telegram | `agent-telegram me` | Daemon can't find tdjson | PASSED |
| **npm distribution** | | | | |
| 7 | Platform pkg correct | `bun run scripts/publish.ts --dry-run` → 3 files (binary + tdjson + package.json) | Workspace resolution bug | PASSED |
| 8 | Wrapper pkg correct | Same → 3 files (agent-telegram.js + postinstall.mjs + package.json) | Wrong bin path | PASSED |
| 9 | postinstall hardlinks | Simulate `node postinstall.mjs` in fake node_modules | Can't resolve platform pkg | NOT TESTED post-rename |
| 10 | `npm i -g @avemeva/agent-telegram` | CI verify job or verdaccio | Name taken, NPM_TOKEN missing, postinstall fails | NEEDS CI |
| **curl install** | | | | |
| 11 | Script downloads + extracts | `bash install --version X.Y.Z --no-modify-path` | 404 (archive name mismatch) | NEEDS NEW RELEASE |
| 12 | Script places tdjson | Check `~/.local/lib/agent-telegram/libtdjson.dylib` | lib/ not in archive | NEEDS NEW RELEASE |
| 13 | PATH modification | Run without `--no-modify-path` | Permission error, duplicates | NOT TESTED |
| **brew install** | | | | |
| 14 | Formula recognized | `brew info avemeva/tap/agent-telegram` | Syntax error | PASSED |
| 15 | `brew install` works | `brew install avemeva/tap/agent-telegram` | SHA mismatch, 404 | BLOCKED (Xcode version on beta macOS) |
| **CI pipeline** | | | | |
| 16 | Tag triggers workflow | `git tag v0.2.0 && git push --tags` | Trigger syntax, tag pattern | NEEDS REAL RUN |
| 17 | macOS ARM build | CI: `macos-14` | prebuilt-tdlib missing, Bun compile | NEEDS REAL RUN |
| 18 | macOS Intel build | CI: `macos-13` | Intel Bun compile issues | NEEDS REAL RUN |
| 19 | Linux x64 build | CI: `ubuntu-latest` | glibc tdjson, tar creation | NEEDS REAL RUN |
| 20 | Windows build | CI: `windows-latest` | .exe extension, path separators, tdjson.dll | NEEDS REAL RUN |
| 21 | Smoke test on each runner | `agent-telegram --version` in CI | Binary not executable, missing dynamic libs | NEEDS REAL RUN |
| 22 | npm publish | Publish job | NPM_TOKEN missing, name conflict | NEEDS REAL RUN |
| 23 | GitHub release created | Publish job | Token permissions, tag exists | NEEDS REAL RUN |
| 24 | Homebrew tap auto-updated | Publish job pushes to `avemeva/homebrew-tap` | GITHUB_TOKEN can't push to other repo | LIKELY FAILS — needs PAT |
| 25 | Verify: curl on macOS | Verify job | Archive URL mismatch | NEEDS REAL RUN |
| 26 | Verify: curl on Linux | Verify job | tar.gz extraction, tdjson.so path | NEEDS REAL RUN |
| 27 | Verify: npm on all platforms | Verify job | optionalDeps resolution, postinstall | NEEDS REAL RUN |
| **Release script** | | | | |
| 28 | `bun run release patch` | Run locally (will actually release!) | Git push fails, hook blocks | NOT TESTED |
| **Code quality** | | | | |
| 29 | Typecheck | `bun --filter '*' typecheck` | paths.ts rename broke imports | PASSED |
| 30 | Tests | `bun --filter '*' test` | — | PASSED (277 pass) |
| 31 | Lint | `biome check .` | — | PASSED |

---

## Known risks before first real release

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 24 | **Homebrew tap push will fail** — `GITHUB_TOKEN` can't push to a different repo (`avemeva/homebrew-tap`). Needs a PAT with `repo` scope or a deploy key. | HIGH | Create PAT secret `HOMEBREW_TAP_TOKEN`, use it instead of `GITHUB_TOKEN` |
| 20 | **Windows binary name** — Bun compile outputs `agent-telegram` not `agent-telegram.exe`. Smoke test and npm wrapper may not find it. | MEDIUM | Test in CI, may need `outfile` suffix for win32 |
| 10 | **npm package name** — `agent-telegram` may already be taken on npm | MEDIUM | Check `npm view agent-telegram` before publishing |
| 22 | **Missing secrets** — `TG_API_ID`, `TG_API_HASH`, `NPM_TOKEN` not configured on repo | BLOCKER | Add secrets before triggering |

## Steps to first release

1. **Check npm name** — `npm view agent-telegram` (should return 404)
2. **Fix #24** — create GitHub PAT for homebrew tap push, add as `HOMEBREW_TAP_TOKEN` secret
3. **Add secrets** — `TG_API_ID`, `TG_API_HASH`, `NPM_TOKEN` to repo settings
4. **Commit all changes** — single commit with everything from this session
5. **Push to main** — no release yet
6. **Dry run** — trigger workflow manually with `dry_run: true` (tests build on all 4 runners)
7. **Fix any CI failures** — especially Windows (#20) and npm publish (#22)
8. **Real release** — `cd apps/cli && bun run release patch` (creates v0.1.1)
9. **Monitor CI** — watch build → publish → verify complete
10. **Manual verify** — curl install and `npm i -g` on your machine

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
