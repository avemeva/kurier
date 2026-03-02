---
name: agent-telegram
description: Telegram CLI for AI agents. Use when the user needs to interact with Telegram — read messages, send messages, search chats, download media, monitor conversations, or automate any Telegram task. Triggers on requests to "check my messages", "send a message", "search Telegram", "read unread", "listen to chat", "download from Telegram", or any task requiring programmatic Telegram interaction via the `tg` CLI.
---

# Telegram Automation with agent-telegram

Telegram CLI for AI agents. Interact with Telegram programmatically — read messages, send messages, search, download media, and more.

All output is JSON to stdout. Warnings go to stderr.

## Setup

The CLI reuses the session from the Telegram AI desktop app. You must be logged in via the web app first.

```bash
tg me   # Verify connection works
```

A background daemon auto-starts on first command and keeps the Telegram connection alive, making subsequent commands fast (~0.2s vs ~2-3s).

## Entity Arguments

All commands accepting `<chat>` or `<user>` support:
- Numeric ID: `12345678`, `-1001234567890` (channels/supergroups use `-100` prefix)
- Username: `@username` or `username`
- Phone: `+1234567890` (must be in your contacts)
- Link: `t.me/username` or `https://t.me/username`
- Special: `me` or `self` (your own Saved Messages)

Use `--` to separate flags from negative positional arguments if needed: `tg messages -- -1001234567890 --limit 20`.

## Global Flags

```
--pretty      Pretty-print JSON output
--timeout N   Timeout in seconds
```

## Commands

```bash
# Identity
tg me                                    # Current user info
tg resolve <username|phone|link>         # Resolve to entity
tg contacts [--limit N] [--search query] [--offset N]  # Saved contacts
tg contacts search "<query>" [--limit N]               # Search contacts + global users

# Chats
tg dialogs [--limit N] [--archived]      # List chats (paginated)
tg dialogs --type user|group|channel     # Filter by chat type
tg dialogs --search "name"              # Filter by chat title (client-side)
tg dialogs --unread                     # Only chats with unread messages
tg dialogs --offset-date N              # Paginate (unix timestamp from nextOffset)
tg unread [--all] [--type user|group|channel] [--limit N]  # Unread chats
tg chat <id|username>                    # Chat details
tg members <chat> [--limit N] [--search] [--offset N]     # Group/channel members
tg members <chat> --type bot|admin|recent                  # Filter by participant type

# Messages
tg messages <chat> [--limit N]           # Message history (paginated)
tg messages <chat> --offset-id N         # Continue from message ID
tg messages <chat> --min-id N            # Only messages after this ID (exclusive)
tg messages <chat> --max-id N            # Only messages before this ID (exclusive)
tg messages <chat> --since N             # Only messages after unix timestamp
tg messages <chat> --search "keyword"    # Search in chat
tg messages <chat> --from <user>         # Filter by sender
tg messages <chat> --filter photo        # Filter: photo|video|document|url|voice|gif|music
tg messages <chat> --reverse             # Oldest first
tg messages <chat> --download-media      # Auto-download photos/stickers/voice
tg message <chat> <msgId>               # Single message by ID

# Search
tg search "query"                        # Global search (paginated)
tg search "query" --chat <id>            # Per-chat search (paginated)
tg search "query" --chat <id> --from <user>  # Filter by sender (per-chat only)
tg search "query" --since N              # Only results after unix timestamp
tg search "query" --type user|group|channel  # Filter by chat type (global only)
tg search "query" --filter photo         # Filter by media type (per-chat only)
tg search "query" --context N            # Include N messages before/after each hit
tg search "query" --full                 # Disable 500-char text truncation
tg search --chat <id> --filter photo     # Media search (no text query needed with --filter)

# Send & Edit (plain text by default — no implicit markdown parsing)
tg send <chat> "text"                    # Send message (plain text)
tg send <chat> "text" --reply-to 123     # Reply to message
tg send <chat> "text" --html             # With HTML formatting
tg send <chat> "text" --md               # With MarkdownV2
tg send <chat> "text" --silent           # No notification
tg send <chat> "text" --no-preview       # Disable link preview
echo "text" | tg send <chat> --stdin     # Read text from stdin
tg send <chat> --file /path/to/msg.txt   # Read text from file
tg edit <chat> <msgId> "new text"        # Edit message (plain text)
tg edit <chat> <msgId> "text" --html     # Edit with formatting

# Actions
tg read <chat>                           # Mark as read
tg delete <chat> <msgId> [msgId...] [--revoke]  # Delete (--revoke = for everyone)
tg forward <from> <to> <msgId> [msgId...] [--silent]  # Forward messages
tg pin <chat> <msgId> [--silent]         # Pin message
tg unpin <chat> <msgId>                  # Unpin message
tg unpin <chat> --all                    # Unpin all messages
tg react <chat> <msgId> <emoji>          # Add reaction
tg react <chat> <msgId> <emoji> --remove # Remove reaction
tg react <chat> <msgId> <emoji> --big    # Big animation

# Real-time
tg listen --type user                        # Stream all user chat events (NDJSON)
tg listen --chat 12345,-1001234567890        # Stream specific chats
tg listen --type group --exclude-chat 12345  # All groups except one
tg listen --type user --download-media       # Auto-download photos/stickers/voice
tg listen --type user --incoming             # Only incoming messages
tg listen --event new_message,edit_message   # Custom event types

# Media
tg download <chat> <msgId> [--output path]  # Download message media
tg download --file-id <id> [--output path]  # Download by TDLib file ID
tg transcribe <chat> <msgId>                # Transcribe voice/video note (Premium)

# Advanced
tg eval "<javascript>"                   # Run JS with connected client

# Daemon
tg daemon start                          # Start background daemon
tg daemon stop                           # Stop daemon
tg daemon status                         # Check if daemon is running
tg daemon log                            # Show recent daemon log

# Discovery
tg list                                  # All commands as JSON
tg <command> --help                      # Per-command help
tg version                               # CLI version
```

## Pagination

List commands return `hasMore` (boolean) and `nextOffset` (varies by command). Pass `nextOffset` back as the corresponding offset flag:

| Command | Offset flag | nextOffset type |
|---------|------------|-----------------|
| `messages` | `--offset-id` | message ID (number) |
| `dialogs` | `--offset-date` | unix timestamp (number) |
| `search` (global) | `--offset` | opaque cursor (string) |
| `search` (per-chat) | `--offset-id` | message ID (number) |
| `contacts` | `--offset` | index (number) |
| `members` | `--offset` | index (number) |

## Formatting

Use `--html` (recommended) or `--md` for formatted messages. Without these flags, text is sent as **plain text** — no implicit parsing.

Supported HTML tags: `<b>`, `<i>`, `<code>`, `<pre>`, `<a href="...">`, `<s>`, `<u>`, `<blockquote>`, `<tg-spoiler>`. No `<table>`, `<div>`, `<span>`, `<br>` — use newlines for line breaks.

**Telegram message limit: 4096 characters.** Split longer messages into multiple `send` calls.

## Error Handling

Errors include a machine-readable `code`:

| Code | Meaning | Action |
|------|---------|--------|
| `INVALID_ARGS` | Bad command, missing/invalid arguments, bad flags | Fix the command |
| `NOT_FOUND` | Entity, message, or media not found | Check the ID/username |
| `FLOOD_WAIT` | Rate limited (long wait) | Wait the specified seconds |
| `UNKNOWN` | Unexpected error | Check error message |

Unknown flags are rejected with `INVALID_ARGS` — never silently ignored. Rate limits under 30 seconds are auto-retried.

## Important Constraints

- **`--from` requires `--chat`**: Global search does not support sender filtering.
- **`--filter` requires `--chat`**: Global search does not support media filtering.
- **`--limit` must be a positive integer**: 0, negative, or non-numeric values return `INVALID_ARGS`.
- **`--type` values are validated**: Invalid values (e.g., `--type dm`) return `INVALID_ARGS`.
- **Telegram search is single-term**: No boolean operators. Run separate queries and merge.
- **Global search matches message content, not chat titles**: Use `dialogs --search` for name lookup.
- **`resolve` accepts usernames, phones, and t.me links only**: Not display names.
- **`listen` requires `--chat` or `--type`**: At least one inclusion filter is mandatory.
- **`listen` default events**: `new_message`, `edit_message`, `delete_messages`, `message_reactions`. Additional: `read_outbox`, `user_typing`, `user_status`, `message_send_succeeded`.
- **`search` truncates text to 500 chars by default**: Use `--full` to get complete content.
- **`search` without a query requires `--filter`**: Media-only search is supported per-chat.

## Common Patterns

### Find and respond to unread messages
```bash
tg unread --type user
# Use last_read_inbox_message_id from each entry to fetch exactly the unread messages
tg messages <chatId> --min-id <last_read_inbox_message_id>
tg send <chatId> "response" --html
tg read <chatId>
```

### Paginate through history
```bash
tg messages <chat> --limit 50
# Use nextOffset from response
tg messages <chat> --limit 50 --offset-id <nextOffset>
```

### Search with context
```bash
tg search "keyword" --context 3 --limit 10
# Each result includes 3 messages before and 3 after
```

### Send programmatic messages
```bash
echo "<b>Report</b>" | tg send me --stdin --html
tg send me --file /tmp/report.html --html
```

### Download media from messages
```bash
tg messages <chat> --filter photo --limit 5
tg download <chat> <msgId> --output /tmp/file.jpg
```

### Search contacts globally
```bash
tg contacts search "Alex"         # Searches contacts + global Telegram users
tg contacts --search "Alex"       # Searches saved contacts only
```

### Monitor a chat
```bash
tg listen --chat -1001731417779
# Each event is a JSON line; parse with jq
tg listen --type user | while read line; do echo "$line" | jq .type; done
```

### Custom TDLib calls
```bash
tg eval 'const me = await client.invoke({ _: "getMe" }); return { id: me.id, name: me.first_name };'
```

`eval` scope: `client` (.invoke()), `fs`, `path`, `success()`, `fail()`, `strip()`.

## Daemon

Auto-starts on first command. Shuts down after 10 minutes of inactivity. All commands go through it.

```bash
tg daemon status   # Check if running
tg daemon stop     # Stop manually
tg daemon start    # Start manually
tg daemon log      # View recent daemon log
```

## Feedback

If you hit a bug, painful workaround, or missing feature while using this CLI, file a report with `/report-agent-telegram`.
