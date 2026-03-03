# Search Command Restructure: `find` + `search`

## Background

The `tg search` command currently handles three fundamentally different operations:

1. **Entity discovery** — find bots, channels, groups, users by name/username
2. **Global message search** — find messages across all chats
3. **Per-chat message search** — find messages within a specific chat

These have different TDLib backends, different parameter sets, different pagination mechanisms, and different output shapes. Cramming them into one command created flag conflicts, silent failures, and an inconsistent API.

---

## Part 1: What Telegram / TDLib Provides

### Entity Search Methods

These find chats/users by name. No pagination — results are returned in full.

#### `searchPublicChats(query)`
- **Input**: query string
- **Returns**: `chat_ids[]` — bots, public channels, public groups matching by username/title
- **Network**: yes
- **Note**: excludes contacts and chats already in your chat list

#### `searchChats(query, limit)`
- **Input**: query string, max results
- **Returns**: `chat_ids[]` — locally known chats matching by title/username
- **Network**: no (offline, instant)
- **Note**: ordered as in main chat list

#### `searchChatsOnServer(query, limit)`
- **Input**: query string, max results
- **Returns**: `chat_ids[]` — server-known chats (wider than local)
- **Network**: yes

#### `searchContacts(query, limit)`
- **Input**: query string, max results
- **Returns**: `user_ids[]` — phonebook contacts matching by first name, last name, username
- **Network**: no

### Message Search Methods

#### `searchMessages` (global, cross-chat)

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | text to match |
| `offset` | string | opaque pagination cursor (empty = first page) |
| `limit` | int32 | max results (up to 100) |
| `filter` | SearchMessagesFilter? | content type: photo, video, document, url, voice, gif, audio, etc. |
| `chat_type_filter` | SearchMessagesChatTypeFilter? | restrict to Private, Group, or Channel |
| `min_date` | int32 | messages after this unix timestamp (0 = no limit) |
| `max_date` | int32 | messages before this unix timestamp (0 = no limit) |
| `chat_list` | ChatList? | restrict to Main or Archive list (null = all) |

**Pagination**: cursor-based. TDLib returns `next_offset` string. Stateless — pass it back to get next page.

**Not supported**: sender filter, topic filter. These only work per-chat.

#### `searchChatMessages` (per-chat)

| Parameter | Type | Description |
|-----------|------|-------------|
| `chat_id` | int53 | which chat to search |
| `query` | string | text to match |
| `sender_id` | MessageSender? | filter by sender (user or chat). Not in secret chats |
| `from_message_id` | int53 | pagination: start from this message (0 = newest) |
| `offset` | int32 | relative offset from `from_message_id` |
| `limit` | int32 | max results (up to 100) |
| `filter` | SearchMessagesFilter? | content type filter |

**Pagination**: message-ID-based. Pass last message's ID as `from_message_id` for next page.

**Not supported**: date range, chat type filter (already scoped to one chat).

### SearchMessagesFilter — All Content Filters

| Filter value | CLI name | Matches |
|---|---|---|
| `searchMessagesFilterPhoto` | `photo` | Photos |
| `searchMessagesFilterVideo` | `video` | Videos |
| `searchMessagesFilterDocument` | `document` | Documents/files |
| `searchMessagesFilterUrl` | `url` | Messages containing URLs |
| `searchMessagesFilterVoiceNote` | `voice` | Voice messages |
| `searchMessagesFilterAnimation` | `gif` | GIF animations |
| `searchMessagesFilterAudio` | `music` | Audio files |
| `searchMessagesFilterPhotoAndVideo` | `media` | Photos + videos combined |
| `searchMessagesFilterVideoNote` | `videonote` | Round video messages |
| `searchMessagesFilterVoiceAndVideoNote` | `voicevideo` | Voice + video notes |

Per-chat only (not supported in global `searchMessages`):

| Filter value | Matches |
|---|---|
| `searchMessagesFilterMention` | Messages mentioning current user |
| `searchMessagesFilterUnreadMention` | Unread mentions |
| `searchMessagesFilterUnreadReaction` | Unread reactions |
| `searchMessagesFilterPinned` | Pinned messages |
| `searchMessagesFilterFailedToSend` | Failed sends |

### SearchMessagesChatTypeFilter — Chat Type Restriction (global only)

| Filter value | CLI name | Restricts to |
|---|---|---|
| `searchMessagesChatTypeFilterPrivate` | `private` | Private (1:1) chats |
| `searchMessagesChatTypeFilterGroup` | `group` | Group chats |
| `searchMessagesChatTypeFilterChannel` | `channel` | Channels |

Only applies to `searchMessages` (global). Meaningless for per-chat (already scoped).

---

## Part 2: Current Problems

### Problem 1: Three operations in one command

Entity search, global message search, and per-chat message search have fundamentally different:
- **Inputs**: entities need `query + type`, messages need `query + date/filter/sender`
- **Outputs**: entities are chat/user objects, messages are message objects
- **Pagination**: entities have none, global messages use string cursors, per-chat messages use message IDs

### Problem 2: `--type` overloaded

We repurposed `--type` (originally for chat type filter on messages: `user|group|channel`) to mean entity type filter (`bot|channel|group|user|contact|message`). This:
- Lost the ability to filter global messages by chat type (e.g., "messages in channels only")
- Created confusion: `--type channel` means "find channel entities" not "messages in channels"
- Made `--type message` a weird escape hatch to force message-only search

### Problem 3: Silent flag failures

| Flag | Silently ignored when... |
|---|---|
| `--type` | used with `--chat` (per-chat mode) |
| `--filter` | used without `--chat` (global mode) — despite TDLib supporting it |
| `--offset-id` | used in global mode |
| `--offset` | used in per-chat mode |
| `--since`, `--context`, `--full` | used with entity-only types |
| `--limit` | entity search (hardcoded limits: 20 for searchChats, 50 for searchContacts) |

### Problem 4: Missing TDLib capabilities

| TDLib feature | Available | Exposed in CLI |
|---|---|---|
| `searchMessages` `filter` | photo, video, doc, url, voice, gif, music | Not wired (always `undefined`) |
| `searchMessages` `chat_type_filter` | Private, Group, Channel | Lost when `--type` was repurposed |
| `searchMessages` `max_date` | upper bound timestamp | Not exposed (only `min_date` via `--since`) |
| `searchMessagesFilterPhotoAndVideo` | combined media filter | Not mapped |
| `searchMessagesFilterVideoNote` | round videos | Not mapped |
| `searchMessagesFilterVoiceAndVideoNote` | voice + round combined | Not mapped |

### Problem 5: Inconsistent output shape

- Entity results are in `chats` sidecar field, messages in `data`. When `--type bot`, primary results are in metadata while `data` is empty.
- Per-chat `nextOffset` is a number (message ID). Global `nextOffset` is a string (cursor). Consumer must know which mode to parse correctly.
- Per-chat results include `chat_id` but not `chat_title`. Global results include both. Inconsistent.

### Problem 6: Redundant pagination flags

- `--offset` for global search (string cursor)
- `--offset-cursor` as alias for `--offset`
- `--offset-id` for per-chat search (message ID)

Three flags, two modes, one alias nobody needs.

---

## Part 3: Proposed Structure

Split into two commands: **`find`** for entity discovery, **`search`** for message search.

### `tg find` — Entity Discovery

Discover bots, channels, groups, and users by name or username.

```
tg find "query"                    # All entity types
tg find "query" --type bot         # Bots only
tg find "query" --type channel     # Channels only
tg find "query" --type group       # Groups only
tg find "query" --type user        # Non-bot users only
tg find "query" --type contact     # Contacts only
tg find "query" --limit 10         # Cap results
```

#### Flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--type` | `bot\|channel\|group\|user\|contact` | (all) | Filter by entity type |
| `--limit` | number | 50 | Max results to return |

That's it. Two flags. No pagination (TDLib returns all results in one call). No mode conflicts.

#### TDLib Calls

Always fire in parallel:
1. `searchPublicChats(query)` — discovers bots, channels, public groups
2. `searchChats(query, 20)` — finds locally known chats
3. `searchContacts(query, 50)` — only when `--type` is unset, `user`, or `contact`

Merge → deduplicate by chat ID → resolve via `getChat` + `getUser` → filter by `--type` → slice to `--limit`.

#### Type Filtering

| `--type` | Keep |
|---|---|
| `bot` | `chatTypePrivate` where `user.type === 'userTypeBot'` |
| `channel` | `chatTypeSupergroup` where `is_channel` |
| `group` | `chatTypeBasicGroup` or `chatTypeSupergroup` where `!is_channel` |
| `user` | `chatTypePrivate` where `user.type !== 'userTypeBot'` |
| `contact` | `chatTypePrivate` where `user.is_contact === true` |

#### Output Shape

```json
{
  "ok": true,
  "data": [
    {
      "id": 5815596965,
      "type": "user",
      "title": "ChatGPT | Midjourney",
      "unread_count": 0,
      "last_read_inbox_message_id": 755137249280,
      "last_message": {
        "id": 755137249280,
        "date": 1772532525,
        "text": "AI can see images..."
      },
      "user": {
        "id": 5815596965,
        "first_name": "ChatGPT | Midjourney",
        "username": "gpt3_unlim_chatbot",
        "phone_number": "",
        "type": "bot",
        "is_contact": false,
        "is_verified": false,
        "is_premium": false,
        "is_scam": false,
        "is_fake": false,
        "active_user_count": 2910473
      }
    }
  ]
}
```

Entities go in `data` — they are the primary result. No `hasMore`, no `nextOffset`, no `chats` sidecar.

---

### `tg search` — Message Search

Search message content globally or within a specific chat.

```
# Global search
tg search "query"                              # All chats
tg search "query" --type channel               # Messages in channels only
tg search "query" --type group                 # Messages in groups only
tg search "query" --type private               # Messages in private chats only
tg search "query" --filter photo               # Photos across all chats
tg search "query" --since 1700000000           # After timestamp
tg search "query" --until 1700100000           # Before timestamp
tg search "query" --offset "cursor"            # Next page

# Per-chat search
tg search "query" --chat <id>                  # In specific chat
tg search "query" --chat <id> --from @user     # By sender
tg search "query" --chat <id> --filter video   # Media type
tg search "query" --chat <id> --offset 12345   # Next page (message ID)

# Common flags (both modes)
tg search "query" --limit 20                   # Max results
tg search "query" --context 3                  # Surrounding messages
tg search "query" --full                       # No text truncation
```

#### Flags

| Flag | Type | Default | Global | Per-chat | Description |
|---|---|---|---|---|---|
| `--chat` | entity ref | — | — | required | Chat to search in |
| `--type` | `private\|group\|channel` | (all) | yes | error | Filter by chat type |
| `--filter` | media type | (all) | yes | yes | Filter by content type |
| `--from` | entity ref | (any) | error | yes | Filter by sender |
| `--since` | unix timestamp | 0 | yes | yes | Messages after this time |
| `--until` | unix timestamp | 0 | yes | error | Messages before this time |
| `--limit` | number | 20 | yes | yes | Max results |
| `--context` | number | 0 | yes | yes | Messages before/after each hit |
| `--full` | boolean | false | yes | yes | Disable 500-char truncation |
| `--offset` | string or number | — | yes (string) | yes (number) | Pagination cursor |

Notes:
- `--type` maps to TDLib's `SearchMessagesChatTypeFilter`. Only meaningful for global search (per-chat is already scoped). Values: `private`, `group`, `channel`.
- `--filter` maps to `SearchMessagesFilter`. Works in **both** modes (we were not passing it through for global search before — now we do).
- `--since` maps to `min_date` for global (native TDLib), client-side scan loop for per-chat.
- `--until` maps to `max_date` for global (native TDLib). Per-chat: not supported by TDLib's `searchChatMessages`, so we error instead of client-side filtering.
- `--offset` is polymorphic: string cursor for global, message ID number for per-chat. One flag, behavior determined by `--chat` presence. The consumer always gets `nextOffset` in the response and passes it back.

#### Flag Validation

Every invalid combination produces an explicit error:

| Combination | Error |
|---|---|
| `--from` without `--chat` | "—from requires --chat" |
| `--type` with `--chat` | "—type is for global search only (filters by chat type)" |
| `--until` with `--chat` | "—until is for global search only" |
| `--filter mention\|unread_mention\|pinned` without `--chat` | "—filter {value} requires --chat" |

No flag is ever silently ignored.

#### `--filter` Values

| Value | TDLib filter | Global | Per-chat |
|---|---|---|---|
| `photo` | searchMessagesFilterPhoto | yes | yes |
| `video` | searchMessagesFilterVideo | yes | yes |
| `document` | searchMessagesFilterDocument | yes | yes |
| `url` | searchMessagesFilterUrl | yes | yes |
| `voice` | searchMessagesFilterVoiceNote | yes | yes |
| `gif` | searchMessagesFilterAnimation | yes | yes |
| `music` | searchMessagesFilterAudio | yes | yes |
| `media` | searchMessagesFilterPhotoAndVideo | yes | yes |
| `videonote` | searchMessagesFilterVideoNote | yes | yes |
| `mention` | searchMessagesFilterMention | no (error) | yes |
| `pinned` | searchMessagesFilterPinned | no (error) | yes |

#### TDLib Calls

**Global** (`searchMessages`):
```typescript
{
  _: 'searchMessages',
  chat_list: undefined,
  query,
  offset: flags['--offset'] ?? '',
  limit: BATCH,                    // 50, internal batching
  filter: mapFilter(flags['--filter']),
  chat_type_filter: mapChatTypeFilter(flags['--type']),
  min_date: flags['--since'] ? Number(flags['--since']) : 0,
  max_date: flags['--until'] ? Number(flags['--until']) : 0,
}
```

**Per-chat** (`searchChatMessages`):
```typescript
{
  _: 'searchChatMessages',
  chat_id: chatId,
  query,
  sender_id: resolveSender(flags['--from']),
  from_message_id: flags['--offset'] ? Number(flags['--offset']) : 0,
  offset: 0,
  limit: since ? BATCH : limit,
  filter: mapFilter(flags['--filter']),
}
```

#### Output Shape (both modes)

```json
{
  "ok": true,
  "data": [
    {
      "id": 123456,
      "sender_type": "user",
      "sender_id": 789,
      "sender_name": "John",
      "chat_id": -1001234567890,
      "chat_title": "Tech News",
      "is_outgoing": false,
      "date": 1700000000,
      "content": { "type": "messageText", "text": "..." },
      "truncated": true,
      "context": [...]
    }
  ],
  "hasMore": true,
  "nextOffset": "cursor_or_message_id"
}
```

Changes from current:
- `chat_title` is always present (currently missing in per-chat mode). Fetch once at the start.
- No `chats` sidecar. Entity results are in `find`, message results are in `search`.
- `nextOffset` type depends on mode but consumer doesn't need to care — just pass it back as `--offset`.

---

## Part 4: Migration

### What moves

| Current | New |
|---|---|
| `tg search "q"` (entities + messages) | `tg find "q"` (entities) + `tg search "q"` (messages) |
| `tg search "q" --type bot` | `tg find "q" --type bot` |
| `tg search "q" --type channel` (entity search) | `tg find "q" --type channel` |
| `tg search "q" --type message` | `tg search "q"` (no flag needed) |
| `tg search "q" --type user\|group\|channel` (old message filter) | `tg search "q" --type private\|group\|channel` |
| `tg search "q" --chat <id>` | `tg search "q" --chat <id>` (unchanged) |

### What's removed

| Removed | Reason |
|---|---|
| `--offset-cursor` | Redundant alias for `--offset` |
| `--offset-id` | Merged into `--offset` (type inferred from mode) |
| `chats` field in output | Entities moved to `find` command |
| `--type message` | No longer needed — `search` is messages-only by default |

### What's new

| New | What it does |
|---|---|
| `tg find` command | Dedicated entity discovery |
| `--until` flag | Upper bound timestamp (maps to `max_date`) |
| `--filter` in global mode | Was silently ignored, now wired to TDLib |
| `--filter media` | Combined photo+video filter |
| `--filter videonote` | Round video filter |
| `--filter mention\|pinned` | Per-chat only filters (with validation) |
| `--type private` | Chat type filter for global messages (replaces overloaded `--type user`) |

### Breaking changes

1. `tg search "q"` no longer returns entities. Use `tg find "q"`.
2. `tg search "q" --type bot` is invalid. Use `tg find "q" --type bot`.
3. `--offset-id` removed. Use `--offset` (works for both modes).
4. `--type` values for `search` changed: `user|group|channel` → `private|group|channel`.
5. No `chats` field in search output.

These are acceptable because:
- The CLI is consumed by AI agents reading SKILL.md, not humans with muscle memory
- SKILL.md is the contract — update it and agents adapt immediately
- The old behavior had bugs (silent flag failures) that agents couldn't work around

---

## Part 5: Implementation

### Files to modify

| File | Change |
|---|---|
| `apps/cli/src/commands.ts` | Add `find` command, rewrite `search` command |
| `apps/cli/src/output.ts` | Remove `chats` from `PaginationMeta` |
| `apps/cli/tests/unit/slim.test.ts` | Keep existing tests, no changes needed |
| `.claude/skills/agent-telegram/SKILL.md` | Update command docs and constraints |

### Step 1: Remove `chats` from `PaginationMeta` (output.ts)

Remove `chats?: unknown[]` from `PaginationMeta` interface.
Remove `if (meta.chats !== undefined) result.chats = meta.chats;` from `success()`.

### Step 2: Add `find` command (commands.ts)

Add a new command object in the `// --- Identity ---` section (near `resolve`):

```typescript
{
  name: 'find',
  description: 'Find bots, channels, groups, or users by name',
  usage: 'tg find "<query>" [--type bot|channel|group|user|contact] [--limit N]',
  flags: {
    '--type': 'Filter: bot, channel, group, user, or contact',
    '--limit': 'Max results (default: 50)',
  },
  run: async (client, args, flags) => {
    const query = args[0];
    if (!query) fail('Missing required argument: <query>', 'INVALID_ARGS');

    const limit = parseLimit(flags, 50);
    const typeFilter = flags['--type'];
    if (typeFilter && !VALID_FIND_TYPES.has(typeFilter))
      fail(`Invalid --type: ${typeFilter}. Valid: bot, channel, group, user, contact`, 'INVALID_ARGS');

    // Fire TDLib calls in parallel
    // ... (entity search logic extracted from current global search)

    // Deduplicate, resolve, filter, slim, strip
    // Slice to --limit

    success(results);  // entities in data, no pagination meta
  },
}
```

The entity search logic (lines 1107-1221 of current code) moves here wholesale.

New constant:
```typescript
const VALID_FIND_TYPES = new Set(['bot', 'channel', 'group', 'user', 'contact']);
```

### Step 3: Rewrite `search` command (commands.ts)

The search command becomes message-search only.

**Updated flag definitions**:
```typescript
flags: {
  '--chat': 'Search in a specific chat (default: global)',
  '--limit': 'Max results (default: 20)',
  '--from': 'Filter by sender (requires --chat)',
  '--since': 'Only messages after this unix timestamp',
  '--until': 'Only messages before this unix timestamp (global only)',
  '--type': 'Filter by chat type: private, group, or channel (global only)',
  '--filter': 'Filter by content: photo, video, document, url, voice, gif, music, media, videonote, mention, pinned',
  '--context': 'Include N messages before and after each hit',
  '--offset': 'Pagination cursor from previous nextOffset',
  '--full': 'Return full message text (default: truncated to 500 chars)',
}
```

**Updated validation**:
```typescript
const VALID_SEARCH_TYPES = new Set(['private', 'group', 'channel']);
const VALID_FILTERS_GLOBAL = new Set(['photo', 'video', 'document', 'url', 'voice', 'gif', 'music', 'media', 'videonote']);
const VALID_FILTERS_PERCHAT = new Set([...VALID_FILTERS_GLOBAL, 'mention', 'pinned']);

// In global branch:
if (flags['--type'] && !VALID_SEARCH_TYPES.has(flags['--type']))
  fail(`Invalid --type for search: ${flags['--type']}. Valid: private, group, channel`, 'INVALID_ARGS');

// In per-chat branch:
if (flags['--type'])
  fail('--type is for global search only (filters by chat type). Per-chat is already scoped.', 'INVALID_ARGS');
if (flags['--until'])
  fail('--until is for global search only. TDLib does not support max_date for per-chat search.', 'INVALID_ARGS');

// Filter validation (both branches):
if (flags['--filter'] === 'mention' || flags['--filter'] === 'pinned') {
  if (!flags['--chat'])
    fail(`--filter ${flags['--filter']} requires --chat`, 'INVALID_ARGS');
}
```

**Global search TDLib call** — wire through `filter`, `chat_type_filter`, and `max_date`:
```typescript
{
  _: 'searchMessages',
  chat_list: undefined,
  query,
  offset: flags['--offset'] ?? '',
  limit: BATCH,
  filter: flags['--filter'] ? mapFilter(flags['--filter']) : undefined,
  chat_type_filter: flags['--type'] ? mapChatTypeFilter(flags['--type']) : undefined,
  min_date: flags['--since'] ? Number(flags['--since']) : 0,
  max_date: flags['--until'] ? Number(flags['--until']) : 0,
}
```

**Per-chat pagination** — replace `--offset-id` with `--offset`:
```typescript
let cursor = flags['--offset'] ? Number(flags['--offset']) : 0;
```

**Remove**: `--offset-id`, `--offset-cursor`, `VALID_CHAT_TYPES` constant, all entity search code from the search command, `chats` in the output.

### Step 4: Filter mapping helpers

```typescript
const FILTER_MAP: Record<string, string> = {
  photo: 'searchMessagesFilterPhoto',
  video: 'searchMessagesFilterVideo',
  document: 'searchMessagesFilterDocument',
  url: 'searchMessagesFilterUrl',
  voice: 'searchMessagesFilterVoiceNote',
  gif: 'searchMessagesFilterAnimation',
  music: 'searchMessagesFilterAudio',
  media: 'searchMessagesFilterPhotoAndVideo',
  videonote: 'searchMessagesFilterVideoNote',
  mention: 'searchMessagesFilterMention',
  pinned: 'searchMessagesFilterPinned',
};

function mapFilter(value: string): { _: string } {
  const mapped = FILTER_MAP[value];
  if (!mapped) fail(`Invalid --filter: ${value}. Valid: ${Object.keys(FILTER_MAP).join(', ')}`, 'INVALID_ARGS');
  return { _: mapped };
}

const CHAT_TYPE_FILTER_MAP: Record<string, string> = {
  private: 'searchMessagesChatTypeFilterPrivate',
  group: 'searchMessagesChatTypeFilterGroup',
  channel: 'searchMessagesChatTypeFilterChannel',
};

function mapChatTypeFilter(value: string): { _: string } {
  return { _: CHAT_TYPE_FILTER_MAP[value] };
}
```

### Step 5: Per-chat `--since` behavior

Currently, per-chat `--since` uses a client-side scan loop (TDLib's `searchChatMessages` has no `min_date`). This is correct but inefficient for large chats. Keep as-is, max scan 500 messages. Document the limitation.

### Step 6: Update SKILL.md

Replace the search section with:

```markdown
# Entity Discovery
tg find "query"                              # Find entities (bots, channels, groups, users)
tg find "query" --type bot                   # Bots only
tg find "query" --type channel               # Channels only
tg find "query" --type group                 # Groups only
tg find "query" --type user                  # Users only (non-bot)
tg find "query" --type contact               # Contacts only
tg find "query" --limit 10                   # Cap results

# Message Search
tg search "query"                            # Global search across all chats
tg search "query" --type channel             # Only messages in channels
tg search "query" --type group               # Only messages in groups
tg search "query" --type private             # Only messages in private chats
tg search "query" --filter photo             # Filter by content type
tg search "query" --since N                  # Messages after unix timestamp
tg search "query" --until N                  # Messages before unix timestamp
tg search "query" --chat <id>               # Search within a specific chat
tg search "query" --chat <id> --from <user>  # Filter by sender (per-chat only)
tg search "query" --chat <id> --filter mention  # Per-chat only filters
tg search "query" --context N                # Include N messages before/after each hit
tg search "query" --full                     # Disable 500-char text truncation
```

Update pagination table:

```markdown
| `find` | — | No pagination |
| `search` (global) | `--offset` | opaque cursor (string) |
| `search` (per-chat) | `--offset` | message ID (number) |
```

Update constraints:

```markdown
- **`find` returns entities, `search` returns messages** — two separate commands, no mixing
- **`--type` means different things**: in `find` it's entity type (bot/channel/group/user/contact), in `search` it's chat type filter (private/group/channel)
- **`--filter` works in both global and per-chat search** — but `mention` and `pinned` require `--chat`
- **`--from` requires `--chat`** — TDLib only supports sender filtering per-chat
- **`--until` is global only** — TDLib's per-chat search has no max_date parameter
- **`--since` in per-chat mode scans up to 500 messages** — client-side filtering, not instant
- **Bot entities include `active_user_count`** (monthly active users)
- **Entity search has no pagination** — all results returned in one call
```

### Step 7: Build + verify

1. `bun test` — all existing tests pass
2. `bun run --filter '@tg/cli' build` — compiles clean
3. `tg find "chatgpt" --pretty` — entities in `data`
4. `tg find "chatgpt" --type bot --pretty` — bots with `active_user_count`
5. `tg find "telegram" --type channel --pretty` — channels only
6. `tg search "chatgpt" --pretty` — messages only, no `chats` field
7. `tg search "news" --type channel --pretty` — messages in channels only
8. `tg search "photo" --filter photo --pretty` — global search with media filter (NEW)
9. `tg search "test" --chat <id> --offset 12345 --pretty` — per-chat pagination via `--offset`
10. `tg search "test" --type bot` — should error: "Invalid --type for search"
11. `tg search "test" --from @user` — should error: "--from requires --chat"
12. `tg search "test" --chat <id> --type channel` — should error: "--type is for global search only"
13. `tg search "test" --filter mention` — should error: "--filter mention requires --chat"
14. `tg resolve @gpt3_unlim_chatbot --pretty` — `active_user_count` still present
15. `tg find "test" --limit 3 --pretty` — capped at 3 results
