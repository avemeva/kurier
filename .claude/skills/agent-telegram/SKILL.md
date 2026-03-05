---
name: agent-telegram
description: Telegram CLI for AI agents. Use when the user needs to interact with Telegram — read messages, send messages, search chats, download media, monitor conversations, or automate any Telegram task. Triggers on requests to "check my messages", "send a message", "search Telegram", "read unread", "listen to chat", "download from Telegram", or any task requiring programmatic Telegram interaction via the `tg` CLI.
---

# Telegram Automation with agent-telegram

Telegram CLI for AI agents. Interact with Telegram programmatically — read messages, send messages, search, download media, and more.

All output is JSON to stdout. Warnings go to stderr. Prefer `jq` over `python3` for JSON processing — it's faster and preserves Unicode.

## Setup

The CLI reuses the session from the Telegram AI desktop app. You must be logged in via the web app first.

```bash
tg me   # Verify connection works
```

A background daemon auto-starts on first command and keeps the Telegram connection alive, making subsequent commands fast (~0.2s vs ~2-3s).

## Finding People

**Prefer `tg chats search` and `tg msg search` over `tg chats search --type user` when looking for a person by name.** `chats search --type user` searches contacts and global directory, which may not include people the user actually talks to. `chats search` and `msg search` match against real chat history — far more reliable for finding someone the user has communicated with.

```bash
# GOOD: search actual chats and message history
tg chats search "boris"                          # Find in chat list by name
tg msg search "boris" --type private --limit 5   # Find messages mentioning/from boris

# LESS RELIABLE: searches contacts/global directory, may miss non-contacts
tg chats search "boris" --type user
```

If the name doesn't match in chats, fall back to `tg msg search "<name>" --type private` to find messages in private chats — this reveals the chat ID and title even for people not in contacts.

## Entity Arguments

All commands accepting `<chat>` or `<user>` support:
- Numeric ID: `12345678`, `-1001234567890` (channels/supergroups use `-100` prefix)
- Username: `@username` or `username`
- Phone: `+1234567890` (must be in your contacts)
- Link: `t.me/username` or `https://t.me/username`
- Special: `me` or `self` (your own Saved Messages)

Use `--` to separate flags from negative positional arguments if needed: `tg msg list -- -1001234567890 --limit 20`.

## Global Flags

```
--timeout N   Timeout in seconds (applies to command execution, not daemon startup)
```

## Commands

```bash
# Identity
tg me                                    # Current user info
tg info <id|username|phone|link>         # Detailed info (entity, chat, shared groups)

# Chat Discovery (local by default — searches your chats, not global)
tg chats search "query"                      # Find in your chats (local + server-backed)
tg chats search "query" --global             # Also search public Telegram (network)
tg chats search "query" --type chat          # Direct chats only (1:1)
tg chats search "query" --type bot           # Bots only
tg chats search "query" --type channel       # Channels only
tg chats search "query" --type group         # Groups only
tg chats search "query" --limit 10           # Cap results
tg chats search "query" --archived           # Only archived chats (default: excludes archived)

# Chat Lists
tg chats list [--limit N] [--archived]       # List chats (paginated)
tg chats list --type user|group|channel      # Filter by chat type
tg chats list --unread                       # Only chats with unread messages
tg chats list --offset-date N                # Paginate (unix timestamp from nextOffset)
tg chats members <chat> [--limit N] [--query text] [--offset N]  # Group/channel members
tg chats members <chat> --type bot|admin|recent                   # Filter by participant type
tg chats members <chat> --filter bot|admin|recent                 # Alias for --type

# Messages
tg msg list <chat> [--limit N]               # Message history (paginated)
tg msg list <chat> --offset-id N             # Continue from message ID (pagination cursor)
tg msg list <chat> --min-id N                # Only messages newer than this ID (exclusive floor)
tg msg list <chat> --since N                 # Only messages after unix timestamp
tg msg list <chat> --query "keyword"         # Search in chat
tg msg list <chat> --from <user>             # Filter by sender
tg msg list <chat> --filter photo            # Filter: photo|video|document|url|voice|gif|music
tg msg list <chat> --auto-download           # Auto-download photos/stickers/voice
tg msg list <chat> --auto-transcribe         # Auto-transcribe voice/video notes (Premium)
tg msg get <chat> <msgId>                    # Single message by ID

# Message Search
tg msg search "query"                            # Cross-chat search (your chats only)
tg msg search "query" --type channel             # Only messages in channels
tg msg search "query" --type group               # Only messages in groups
tg msg search "query" --type private             # Only messages in private chats
tg msg search "query" --filter photo             # Filter: photo|video|document|url|voice|gif|music|media|videonote|mention|pinned
tg msg search "query" --since N                  # Messages after unix timestamp
tg msg search "query" --until N                  # Messages before unix timestamp
tg msg search "query" --chat <id>                # Search within a specific chat
tg msg search "query" --chat <id> --from <user>  # Filter by sender (per-chat only)
tg msg search "query" --context N                # Include N before + hit + N after in context array
tg msg search "query" --auto-download            # Auto-download photos/stickers/voice
tg msg search "query" --auto-transcribe          # Auto-transcribe voice/video notes (Premium)
tg msg search "query" --full                     # Disable 500-char text truncation
tg msg search "query" --archived                 # Search archived chats only (default: main list)

# Send & Edit (plain text by default — no implicit markdown parsing)
tg action send <chat> "text"                    # Send message (plain text)
tg action send <chat> "text" --reply-to 123     # Reply to message
tg action send <chat> "text" --html             # With HTML formatting
tg action send <chat> "text" --md               # With MarkdownV2
tg action send <chat> "text" --silent           # No notification
tg action send <chat> "text" --no-preview       # Disable link preview
echo "text" | tg action send <chat> --stdin     # Read text from stdin
tg action send <chat> --file /path/to/msg.txt   # Read text from file
tg action edit <chat> <msgId> "new text"        # Edit message (plain text)
tg action edit <chat> <msgId> "text" --html     # Edit with formatting
tg action edit <chat> <msgId> "text" --md       # Edit with MarkdownV2
echo "text" | tg action edit <chat> <msgId> --stdin  # Read text from stdin
tg action edit <chat> <msgId> --file /path/to/msg.txt  # Read text from file

# Actions
tg action delete <chat> <msgId> [msgId...] [--revoke]  # Delete (--revoke = for everyone)
tg action forward <from> <to> <msgId> [msgId...] [--silent]  # Forward messages
tg action pin <chat> <msgId> [--silent]         # Pin message
tg action unpin <chat> <msgId>                  # Unpin message
tg action unpin <chat> --all                    # Unpin all messages
tg action react <chat> <msgId> <emoji>          # Add reaction
tg action react <chat> <msgId> <emoji> --remove # Remove reaction
tg action react <chat> <msgId> <emoji> --big    # Big animation
tg action click <chat> <msgId> <button>         # Click inline keyboard button (index or text)

# Real-time
tg listen --type user                        # Stream all user chat events (NDJSON)
tg listen --chat 12345,-1001234567890        # Stream specific chats
tg listen --type group --exclude-chat 12345  # All groups except one
tg listen --type user --auto-download        # Auto-download photos/stickers/voice
tg listen --type user --incoming             # Only incoming messages
tg listen --event new_message,edit_message   # Custom event types

# Media
tg media download <chat> <msgId> [--output path]  # Download message media
tg media download --file-id <id> [--output path]  # Download by TDLib file ID
tg media transcribe <chat> <msgId>                 # Transcribe voice/video note (Premium)

# Advanced
tg eval '<javascript>'                   # Run JS with connected client
tg eval --file script.js                 # Run JS from file
tg eval <<'EOF'                          # Run JS via heredoc (recommended)
<code>
EOF

# Daemon
tg daemon start                          # Start background daemon
tg daemon stop                           # Stop daemon
tg daemon status                         # Check if daemon is running
tg daemon log                            # Show recent daemon log

# Auth
tg auth                                  # Show current auth state
tg auth phone <number>                   # Submit phone number (e.g. +1234567890)
tg auth code <code>                      # Submit verification code
tg auth password <password>              # Submit 2FA password
tg auth logout                           # Log out of Telegram

# Discovery
tg <command> --help                      # Per-command help
tg chats                                 # List available chats subcommands
tg msg                                   # List available msg subcommands
tg action                                # List available action subcommands
tg media                                 # List available media subcommands
```

## Pagination

List commands return `hasMore` (boolean) and `nextOffset` (varies by command). Pass `nextOffset` back as the corresponding offset flag:

| Command | Offset flag | nextOffset type |
|---------|------------|-----------------|
| `msg list` | `--offset-id` | message ID (number) |
| `chats list` | `--offset-date` | unix timestamp (number) |
| `chats search` | — | No pagination |
| `msg search` (cross-chat) | `--offset` | opaque cursor (string) |
| `msg search` (per-chat) | `--offset` | message ID (number) |
| `chats members` | `--offset` | index (number) |

## Formatting

Use `--html` (recommended) or `--md` for formatted messages. Without these flags, text is sent as **plain text** — no implicit parsing.

Supported HTML tags: `<b>`, `<i>`, `<code>`, `<pre>`, `<a href="...">`, `<s>`, `<u>`, `<blockquote>`, `<tg-spoiler>`. No `<table>`, `<div>`, `<span>`, `<br>` — use newlines for line breaks.

**Telegram message limit: 4096 characters.** Split longer messages into multiple `action send` calls.

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

- **`chats search` returns entities, `msg search` returns messages** — two separate commands, no mixing.
- **`--type` means different things**: in `chats search` it's entity type (bot/channel/group/chat), in `msg search` it's chat type filter (private/group/channel).
- **`--filter` works in both cross-chat and per-chat search** — but `mention` and `pinned` require `--chat`.
- **`--from` requires `--chat`** — TDLib only supports sender filtering per-chat.
- **`--until` is cross-chat only** — TDLib's per-chat search has no max_date parameter.
- **`--since` in per-chat mode scans up to 500 messages** — client-side filtering, not instant.
- **`chats search` is local by default** — searches your chats via `searchChats` + `searchChatsOnServer`. Use `--global` to discover public entities (network call).
- **`chats search` results include bio/description** — users get `bio` + `personal_channel`, bots get `short_description`, groups/channels get `description`.
- **`chats search` results sorted by last message date** (most recent first).
- **`chats search` type `chat`** means direct 1:1 chats. Valid types: `chat`, `bot`, `group`, `channel`.
- **Entity search has no pagination** — all results returned in one call.
- **`--limit` must be a positive integer**: 0, negative, or non-numeric values return `INVALID_ARGS`.
- **`--type` values are validated**: Invalid values (e.g., `--type dm`) return `INVALID_ARGS`.
- **Telegram search is single-term**: No boolean operators. Run separate queries and merge.
- **`info` accepts IDs, usernames, phones, and t.me links**: Not display names. Returns entity details, chat state, and shared groups (for users — groups where the person was active in the last 5 months, sorted by their recent activity).
- **`listen` requires `--chat` or `--type`**: At least one inclusion filter is mandatory.
- **`listen` default events**: `new_message`, `edit_message`, `delete_messages`, `message_reactions`. Additional: `read_outbox`, `user_typing`, `user_status`, `message_send_succeeded`.
- **`msg search` truncates text to 500 chars by default**: Use `--full` to get complete content.
- **`msg search` without a query requires `--filter`**: Media-only search is supported per-chat.
- **`action click` uses flat button indexing**: Buttons are numbered 0, 1, 2... left-to-right, top-to-bottom across all rows.
- **`action click` callback buttons may timeout**: Bots have ~30 seconds to respond to callback queries.
- **`reply_markup` in message output**: Messages with inline keyboards include a `reply_markup` field showing button text, type, and data.

## Contextual Tasks (summarize, catch up, review, etc.)

When the user asks for a contextual task — summarizing a chat, catching up on messages, reviewing a conversation — **always use `--auto-transcribe`** on message fetches. Voice and video notes are common in Telegram and contain critical context that would otherwise appear as blank `"content": "voice"` entries. Without transcription the summary will have gaps.

```bash
# Always transcribe when reading for context
tg msg list <chat> --limit 50 --auto-transcribe
```

## Common Patterns

### Find and respond to unread messages
```bash
tg chats list --unread --type user
# Use last_read_inbox_message_id from each entry to fetch exactly the unread messages
tg msg list <chatId> --min-id <last_read_inbox_message_id>
tg action send <chatId> "response" --html
```

### Paginate through history
```bash
tg msg list <chat> --limit 50
# Use nextOffset from response
tg msg list <chat> --limit 50 --offset-id <nextOffset>
```

### Search with context
```bash
tg msg search "keyword" --context 3 --limit 10
# Each result includes 3 messages before and 3 after
```

### Send programmatic messages
```bash
echo "<b>Report</b>" | tg action send me --stdin --html
tg action send me --file /tmp/report.html --html
```

### Download media from messages
```bash
tg msg list <chat> --filter photo --limit 5
tg media download <chat> <msgId> --output /tmp/file.jpg
```

### Find entities
```bash
tg chats search "Boris" --type chat         # Find a person in your chats
tg chats search "chatgpt" --type bot        # Find bots in your chats
tg chats search "telegram" --type channel   # Find channels in your chats
tg chats search "news" --global             # Discover public entities you haven't joined
```

### Monitor a chat
```bash
tg listen --chat -1001731417779
# Each event is a JSON line; parse with jq
tg listen --type user | while read line; do echo "$line" | jq .type; done
```

### Interact with bot inline keyboards
```bash
# View a bot message with its inline keyboard
tg msg get <chat> <msgId>
# Output includes reply_markup.rows with button text, type, and data

# Click by flat index (0 = first button across all rows)
tg action click <chat> <msgId> 0

# Click by button text (case-insensitive exact match)
tg action click <chat> <msgId> "Записаться"
```

### Custom TDLib calls

**Shell quoting can corrupt complex expressions** — use heredoc or `--file` to avoid issues with `!`, nested quotes, template literals, etc.

```bash
# Simple expressions work with single quotes
tg eval 'const me = await client.invoke({ _: "getMe" }); success({ id: me.id, name: me.first_name })'

# Complex JS: use heredoc (RECOMMENDED)
tg eval <<'EOF'
const me = await client.invoke({ _: "getMe" });
const chats = await client.invoke({ _: "getChats", chat_list: { _: "chatListMain" }, limit: 5 });
const titles = [];
for (const id of chats.chat_ids) {
  const chat = await client.invoke({ _: "getChat", chat_id: id });
  if (chat.title !== "") titles.push(chat.title);
}
success({ user: me.first_name, top_chats: titles });
EOF

# Or from a file
tg eval --file /tmp/my-script.js
```

**Rules of thumb:**
- Single-line, no `!` or nested quotes → `tg eval 'expression'` is fine
- Anything with `!==`, `!flag`, nested quotes, multiline → use heredoc `<<'EOF'`
- Reusable scripts → use `--file`

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
