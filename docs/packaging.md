# agent-telegram Packaging & Distribution

## Overview

One command installs a working Telegram CLI. Six install channels, five platforms, fully automated releases.

```
brew install avemeva/tap/agent-telegram            macOS
curl -fsSL .../install | bash                      macOS / Linux
npm i -g @avemeva/agent-telegram                   all platforms
bun i -g @avemeva/agent-telegram                   all platforms
irm .../install.ps1 | iex                          Windows PowerShell
curl -fsSL .../install.cmd -o i.cmd && i.cmd       Windows CMD
```

After any of these:

```
agent-telegram --version      # binary runs
agent-telegram doctor         # tdjson found, config found
agent-telegram --daemon &     # TDLib proxy starts
agent-telegram me             # live Telegram data
```

## How a release works

```
developer                                  GitHub Actions
─────────                                  ──────────────

cd apps/cli
bun run release patch
       │
       ▼
  bump version in package.json
  commit + tag v0.1.15
  push ────────────────────────────▶  tag arrives, publish.yml triggers
                                              │
                                     ┌────────┴────────┐
                                     │   BUILD (5x)    │
                                     │                 │
                                     │  macOS ARM      │
                                     │  macOS Intel    │
                                     │  Linux x64      │
                                     │  Linux ARM      │
                                     │  Windows x64    │
                                     │                 │
                                     │  each: compile binary
                                     │  smoke test (version + daemon)
                                     └────────┬────────┘
                                              │
                                     ┌────────┴────────┐
                                     │    PUBLISH      │
                                     │                 │
                                     │  npm (6 pkgs)   │  OIDC trusted publishing
                                     │  GitHub Release │  5 archives + checksums
                                     │  Homebrew tap   │  push formula
                                     │  Skill repo     │  push SKILL.md
                                     └────────┬────────┘
                                              │
                                     ┌────────┴────────┐
                                     │  VERIFY (13x)   │
                                     │                 │
                                     │  fresh install via each channel
                                     │  on each platform
                                     │  --version + doctor + daemon
                                     └─────────────────┘
```

Nothing to do manually after `bun run release patch`. CI builds, publishes to npm + GitHub + Homebrew + skill repo, then verifies every install channel works on every platform.

Can also trigger manually: Actions → "Publish agent-telegram" → Run workflow (with `dry_run` option).

## Where things get installed

```
brew install avemeva/tap/agent-telegram
  /opt/homebrew/Cellar/agent-telegram/<ver>/bin/agent-telegram
  /opt/homebrew/Cellar/agent-telegram/<ver>/lib/agent-telegram/libtdjson.dylib

curl -fsSL .../install | bash
  ~/.local/bin/agent-telegram
  ~/.local/lib/agent-telegram/libtdjson.{dylib,so}

npm i -g / bun i -g @avemeva/agent-telegram
  <global bin>/agent-telegram  (hardlinked from platform package)
  ~/.local/lib/agent-telegram/libtdjson.{dylib,so,dll}

irm .../install.ps1 | iex
  %LOCALAPPDATA%\Programs\agent-telegram\bin\agent-telegram.exe
  %LOCALAPPDATA%\Programs\agent-telegram\lib\tdjson.dll
```

## What gets distributed

Every install channel delivers the same three files:

```
├── bin/agent-telegram                              60MB   compiled binary
├── bin/prebuilds/<platform>-<arch>/<tdl>.node       72KB   native addon
└── lib/libtdjson.{dylib,so,dll}                    30MB   TDLib shared library
```

The binary is self-contained JS compiled with Bun. The two native files are the unique challenge — most CLI tools (opencode, agent-browser) are pure JS with no native deps. We ship two.

## Verify coverage

CI tests every channel × platform combination after each release:

```
                 curl    npm     bun     brew    ps1
darwin-arm64     full    full    full    full     —
darwin-x64       full    full     —       —       —
linux-x64        full    full    full     —       —
linux-arm64      full    full     —       —       —
win32-x64         —     partial   —       —      full

full    = --version + doctor + daemon health check
partial = --version + doctor only
```

## Skill distribution

The agent-telegram skill for Claude Code lives in a separate repo (`avemeva/agent-telegram`). On every release, the publish job copies `.claude/skills/agent-telegram/*` and `README.md` to that repo. Users install with:

```
npx skills add avemeva/agent-telegram
```

The skill includes `references/installation.md` — a detailed install guide the agent can read when the CLI isn't installed.

## npm trusted publishing

No npm tokens stored. All 6 packages use OIDC trusted publishers configured on npmjs.com. CI gets a short-lived token from GitHub's OIDC provider, publishes with `--provenance` (SLSA v1 attestations, Sigstore-signed).

## Secrets

| Secret | Purpose |
|--------|---------|
| `TG_API_ID` + `TG_API_HASH` | Telegram API credentials, baked into binary at build |
| `HOMEBREW_TAP_TOKEN` | PAT for pushing to `avemeva/homebrew-tap` + `avemeva/agent-telegram` |

No npm token — OIDC handles it.

---

## Internals

### Native loading chain

The binary needs two native files to start the daemon. Here's how they're found:

```
agent-telegram --daemon
  └─ require('tdl')
       └─ node-gyp-build
            └─ searches prebuilds/<os>-<arch>/ relative to process.execPath
                 └─ finds tdl.node (or tdl.glibc.node on Linux)
                      └─ dlopen("libtdjson")
                           searches: DYLD_LIBRARY_PATH, LD_LIBRARY_PATH,
                           ~/.local/lib/agent-telegram/, /opt/homebrew/lib/agent-telegram/
```

The native addon filename varies by platform: `tdl.node` (macOS/Windows), `tdl.glibc.node` (linux-x64), `tdl.armv8.glibc.node` (linux-arm64). The build script copies all `*.node` files from tdl's prebuilds directory to handle this.

### npm package structure

```
@avemeva/agent-telegram                      wrapper
├── bin/agent-telegram.js                    Node.js launcher
├── scripts/postinstall.mjs                  hardlinks binary from platform pkg
└── optionalDependencies:
    ├── @avemeva/agent-telegram-darwin-arm64
    ├── @avemeva/agent-telegram-darwin-x64    npm installs only the
    ├── @avemeva/agent-telegram-linux-x64     matching platform
    ├── @avemeva/agent-telegram-linux-arm64
    └── @avemeva/agent-telegram-win32-x64
```

### curl / PowerShell install flow

1. Detect platform and architecture
2. Download matching archive from GitHub Release
3. Download `checksums.txt`, verify SHA256
4. Extract: binary → bin dir, prebuilds → next to binary, tdjson → lib dir
5. Add bin dir to PATH

### Key files

| File | Purpose |
|------|---------|
| `apps/cli/scripts/build.ts` | Bun compile, bundles tdjson, copies tdl.node prebuilds |
| `apps/cli/scripts/publish.ts` | npm publish, platform packages, Homebrew formula generation |
| `apps/cli/scripts/release.ts` | Version bump, git tag, push |
| `apps/cli/scripts/postinstall.mjs` | npm postinstall: hardlinks binary from platform pkg |
| `apps/cli/bin/agent-telegram.js` | npm wrapper: finds and executes platform binary |
| `apps/cli/src/commands/doctor.ts` | Health check (binary, tdjson, config, daemon) |
| `packages/protocol/src/paths.ts` | Platform-specific paths |
| `install` | Bash installer (macOS/Linux) |
| `install.ps1` | PowerShell installer (Windows) |
| `install.cmd` | CMD fallback installer (Windows) |
| `.github/workflows/publish.yml` | CI/CD: build → publish → verify |

### External repos

| Repo | Updated by | Contains |
|------|------------|----------|
| `avemeva/homebrew-tap` | publish job | `Formula/agent-telegram.rb` |
| `avemeva/agent-telegram` | publish job | SKILL.md + references/ + README |

Both use `HOMEBREW_TAP_TOKEN` (`ci-publish` PAT, scoped to both repos, expires Jun 5 2026).
