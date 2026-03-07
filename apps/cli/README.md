# agent-telegram

Telegram CLI for AI agents. Read messages, send messages, search, download media, manage chats — all from the terminal. JSON output, designed for automation.

## Installation

### npm (all platforms)

```bash
npm i -g @avemeva/agent-telegram
```

### Bun (all platforms)

```bash
bun i -g @avemeva/agent-telegram
```

### Homebrew (macOS)

```bash
brew install avemeva/tap/agent-telegram
```

### curl (macOS/Linux)

```bash
curl -fsSL https://kurier.sh/install | bash
```

### PowerShell (Windows)

```powershell
irm https://kurier.sh/install.ps1 | iex
```

### CMD (Windows)

```cmd
curl -fsSL https://kurier.sh/install.cmd -o install.cmd && install.cmd
```

### Verify

```bash
agent-telegram --version
agent-telegram doctor
```

## Authentication

agent-telegram connects to your **real Telegram account** — it reads and sends actual messages, not a sandbox. Authenticate before first use:

```bash
agent-telegram login                     # Log in to Telegram (interactive)
agent-telegram me                        # Verify connection
```


## How It Works

A background daemon manages the TDLib connection and auto-starts on first command. TDLib caches your chats, messages, and user data locally, so most reads are instant (~0.2s) without hitting Telegram's servers. The daemon shuts down after 10 minutes of inactivity.

## Quick Start

```bash
agent-telegram me                              # Current user info
agent-telegram chats list --limit 10           # Recent chats
agent-telegram msg list @username --limit 5    # Message history
agent-telegram action send @username "hello"   # Send a message
agent-telegram msg search "keyword"            # Search across all chats
```

## Commands

### Identity

```bash
agent-telegram me                                # Current user info
agent-telegram info <id|username|phone|link>     # Detailed entity info
```

### Chats

```bash
agent-telegram chats list [--limit N] [--unread] [--type user|group|channel]
agent-telegram chats search "query" [--type chat|bot|group|channel] [--global]
agent-telegram chats members <chat> [--limit N] [--type bot|admin|recent]
```

### Messages

```bash
agent-telegram msg list <chat> [--limit N] [--filter photo|video|document|voice]
agent-telegram msg get <chat> <msgId>
agent-telegram msg search "query" [--chat <id>] [--type private|group|channel]
```

### Actions

```bash
agent-telegram action send <chat> "text" [--html] [--md] [--reply-to N] [--silent]
agent-telegram action edit <chat> <msgId> "text" [--html]
agent-telegram action delete <chat> <msgId...> [--revoke]
agent-telegram action forward <from> <to> <msgId...>
agent-telegram action pin <chat> <msgId>
agent-telegram action react <chat> <msgId> <emoji>
agent-telegram action click <chat> <msgId> <button>
```

### Media

```bash
agent-telegram media download <chat> <msgId> [--output path]
agent-telegram media transcribe <chat> <msgId>
```

### Real-time Streaming

```bash
agent-telegram listen --type user              # Stream events as NDJSON
agent-telegram listen --chat 12345             # Stream specific chat
```

### Daemon

```bash
agent-telegram daemon start | stop | status | log
```

### Auth

```bash
agent-telegram login                           # Log in to Telegram (interactive)
agent-telegram logout                          # Log out of Telegram
```

### Advanced

```bash
agent-telegram eval '<javascript>'             # Run JS with connected TDLib client
agent-telegram doctor                          # Verify installation health
```

## Entity Arguments

All commands accepting `<chat>` support:
- Numeric ID: `12345678`, `-1001234567890`
- Username: `@username` or `username`
- Phone: `+1234567890`
- Link: `t.me/username`
- Special: `me` or `self`

## Output

All output is JSON to stdout. Errors and warnings go to stderr. Pipe through `jq` for processing:

```bash
agent-telegram chats list --unread | jq '.[].title'
agent-telegram msg search "meeting" | jq '.messages[].content'
```

## Pagination

List commands return `hasMore` and `nextOffset`. Pass the offset back to paginate:

```bash
agent-telegram msg list <chat> --limit 50
agent-telegram msg list <chat> --limit 50 --offset-id <nextOffset>
```

## Claude Code Skill

Best suited for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Install the skill to give Claude full Telegram access:

```bash
npx skills add avemeva/agent-telegram
```

## License

GPL-3.0
