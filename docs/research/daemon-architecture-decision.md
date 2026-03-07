# Daemon Architecture Decision

Date: 2026-03-07

## Context

agent-telegram has a daemon that bridges TDLib (C++) to HTTP clients. Currently the daemon is triggered by a hidden `--daemon` flag checked before Commander parses arguments. Future clients: CLI, Electrobun desktop app, web app — all connecting to the same local daemon.

## Constraints gathered

- Desktop app will **bundle its own copy** of the binary, but agent-telegram is also installable standalone (brew/npm/curl)
- Web app connects to **local daemon only** (no remote)
- **One daemon per Telegram account**
- libtdjson is **always pinned** to the binary version — ships together
- **No backwards compatibility concerns** — nobody using it in production yet

## Research: how others do it

| Tool | Architecture | How daemon starts |
|------|-------------|-------------------|
| **Docker** | Separate binaries, separate repos (`docker` + `dockerd`) | System service (systemd/launchd). CLI never spawns it |
| **Ollama** | Single binary | `ollama serve` subcommand. Other commands are HTTP clients. Auto-spawns if needed |
| **Tailscale** | Separate binaries, same repo (`tailscale` + `tailscaled`) | Supports combined binary via busybox pattern (argv[0] determines behavior) |
| **agent-browser** | Rust CLI + Node.js daemon (separate binaries, different languages) | CLI spawns `node daemon.js` with `AGENT_BROWSER_DAEMON=1` env var. Requires Node.js runtime |

## Decision: single binary, `serve` subcommand (Ollama pattern)

### Why not separate binaries

Both CLI and daemon are Bun/TS from the same codebase. Two binaries would double build/distribution complexity for no real gain. Desktop app just bundles the same binary.

### Why `serve` subcommand, not env var

Env var is what agent-browser does because they have two different runtimes (Rust + Node). We don't have that constraint. A subcommand is discoverable, shows in `--help`, natural for launchd/systemd service files.

### Why not no flag at all

The binary needs *some* way to know "run as daemon this time" when `ensureDaemon()` spawns it. A subcommand is the cleanest signal.

### Why not agent-browser's architecture

agent-browser requires Node.js at runtime — Rust CLI spawns `node daemon.js`. Our Bun-compiled binary is fully self-contained (no runtime deps). That's an advantage we keep.

## What changes

```
# before (hidden flag, not in --help)
agent-telegram --daemon

# after (proper Commander subcommand)
agent-telegram serve
```

- `index.ts` — replace `--daemon` pre-Commander check with `serve` subcommand
- `daemon.ts` — `spawnDaemon()` spawns `agent-telegram serve` instead of `agent-telegram --daemon`
- `commands/daemon.ts` — remove `daemon start`, `daemon stop`, `daemon status` subcommands. `serve` replaces `daemon start`. Stopping is just killing the process. Status is covered by `doctor`.
- All clients (CLI, desktop app, web app) spawn `agent-telegram serve` or connect to already-running daemon

## Distribution: what ships per platform

```
bin/agent-telegram              <- single Bun-compiled binary (CLI + daemon)
lib/libtdjson.dylib             <- TDLib C++ library (pinned version, ~30MB)
prebuilds/<platform>/tdl.node   <- tdl native addon (currently missing, causes daemon crash)
```

## Current blocker: tdl native addon not bundled

The daemon crashes from distributed binaries because `tdl` uses `node-gyp-build` to find a native `.node` addon. The build process (`build.ts`) doesn't copy `node_modules/tdl/prebuilds/<platform>/` into the archive. `node-gyp-build` falls back to looking next to `process.execPath` — also not there.

Fix: `build.ts` must copy the platform-specific `tdl/prebuilds/` into the dist archive.

## Homebrew findings

- **Formula approach works** — `brew install avemeva/tap/agent-telegram` installs and runs correctly
- Requires Xcode 26 on macOS Tahoe (standard requirement, not a bug)
- Previous failures were due to: (1) Xcode 16.4 being too old, (2) quarantine xattr cached from earlier cask install
- **Cask not needed** — formula handles CLI binaries correctly, no quarantine issues on fresh install
- Action: remove cask from tap, keep formula only

## Acceptance criteria for next release

```bash
# All three channels
brew install avemeva/tap/agent-telegram
npm i -g @avemeva/agent-telegram
curl -fsSL .../install | bash

# Each must pass all of these
agent-telegram --version          # prints version
agent-telegram doctor             # all checks pass
agent-telegram serve &            # daemon starts without crash
agent-telegram me                 # returns live Telegram data
kill %1
```

## CI verification gaps to fix

1. Smoke test only runs `--version` — must also test `serve` + health check
2. Verify job doesn't test brew install at all
3. Verify job doesn't test `bun install`
4. Verify job doesn't test daemon start
