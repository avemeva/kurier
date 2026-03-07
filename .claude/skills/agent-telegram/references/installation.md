# Installing agent-telegram

## Quick Install

Pick the method that matches your platform:

| Platform | Recommended | Command |
|----------|-------------|---------|
| macOS (Apple Silicon) | Homebrew | `brew install avemeva/tap/agent-telegram` |
| macOS (Intel) | curl | `curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install \| bash` |
| Linux (x64/arm64) | curl | `curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install \| bash` |
| Windows | PowerShell | `irm https://raw.githubusercontent.com/avemeva/kurier/main/install.ps1 \| iex` |
| Any platform | npm | `npm i -g @avemeva/agent-telegram` |
| Any platform | Bun | `bun i -g @avemeva/agent-telegram` |

### Windows CMD fallback

If PowerShell is unavailable:

```cmd
curl -fsSL https://raw.githubusercontent.com/avemeva/kurier/main/install.cmd -o install.cmd && install.cmd
```

## Verify Installation

Run these two commands after installing:

```bash
agent-telegram --version    # Should print version number (e.g. 0.1.14)
agent-telegram doctor       # Should show all checks passed
```

### What doctor checks

| Check | What it verifies | If it fails |
|-------|-----------------|-------------|
| Binary | The `agent-telegram` binary is running | Reinstall using one of the methods above |
| TDLib | `libtdjson` shared library is found | See "TDLib not found" below |
| Config | Telegram API credentials exist | See "Authentication" below |
| Daemon | Background daemon is running | Not a failure — daemon starts automatically on first command |

## Authentication

agent-telegram connects to your **real Telegram account**. You must authenticate before first use:

```bash
# Step 1: Start auth flow with your phone number
agent-telegram auth phone +1234567890

# Step 2: Enter the code Telegram sends you
agent-telegram auth code 12345

# Step 3: If you have 2FA enabled
agent-telegram auth password <your-2fa-password>

# Step 4: Verify connection
agent-telegram me
```

The `agent-telegram me` command should return your Telegram user info as JSON.

## How It Works

A background daemon manages the TDLib connection. It auto-starts on the first command and shuts down after 10 minutes of inactivity. You don't need to manage it manually.

```
agent-telegram <command>
       |
       v
   daemon (auto-starts if not running)
       |
       v
   TDLib (C++ library, loaded via libtdjson)
       |
       v
   Telegram servers
```

## Troubleshooting

### TDLib not found

Doctor reports `TDLib FAIL`. The native library `libtdjson` is missing from the expected location.

**Expected locations by install method:**

| Method | Location |
|--------|----------|
| Homebrew | `/opt/homebrew/lib/agent-telegram/libtdjson.dylib` |
| curl (macOS) | `~/.local/lib/agent-telegram/libtdjson.dylib` |
| curl (Linux) | `~/.local/lib/agent-telegram/libtdjson.so` |
| npm/bun | `~/.local/lib/agent-telegram/libtdjson.{dylib,so,dll}` |
| PowerShell (Windows) | `%LOCALAPPDATA%\Programs\agent-telegram\lib\tdjson.dll` |

**Fix:** Reinstall using one of the install methods above. The installers bundle tdjson automatically.

### Config / credentials not found

Doctor reports `Config FAIL`. agent-telegram needs Telegram API credentials.

**Where credentials are looked up (in order):**
1. Environment variables `TG_API_ID` and `TG_API_HASH`
2. Credentials file (created during first run)
3. App data directory `.env` file
4. Built-in credentials (compiled into the binary)

The compiled binary includes built-in credentials, so this check should pass automatically. If it fails, you may be running a development build. Set `TG_API_ID` and `TG_API_HASH` as environment variables.

### Daemon won't start

```bash
agent-telegram daemon status   # Check if running
agent-telegram daemon log      # View recent daemon log
agent-telegram daemon stop     # Stop if stuck
agent-telegram daemon start    # Restart manually
```

**Port conflict:** The daemon uses port 7312 by default. If another process occupies it, the daemon will fail. Check with:

```bash
lsof -i :7312    # macOS/Linux
netstat -ano | findstr 7312   # Windows
```

### Command not found after install

The binary isn't in your PATH.

**curl install:** Add `~/.local/bin` to PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Add this to your `~/.zshrc`, `~/.bashrc`, or shell profile.

**npm/bun install:** The global bin directory should already be in PATH. Check with:
```bash
npm bin -g    # or: bun pm bin -g
```

**PowerShell install:** The installer adds the binary to `%LOCALAPPDATA%\Programs\agent-telegram\bin` and updates PATH. Restart your terminal.

### Uninstalling

| Method | Command |
|--------|---------|
| Homebrew | `brew uninstall agent-telegram` |
| curl | `trash ~/.local/bin/agent-telegram ~/.local/lib/agent-telegram` |
| npm | `npm uninstall -g @avemeva/agent-telegram` |
| Bun | `bun remove -g @avemeva/agent-telegram` |
| PowerShell | Delete `%LOCALAPPDATA%\Programs\agent-telegram\` |
