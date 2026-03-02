# TG CLI Expectations

Comprehensive test expectation reference for `tg` -- the Telegram CLI for AI agents.

## Format

Each section covers a command group. Within each command, expectations are listed as:

**`command + flags`** => **expected behavior**

Edge cases follow each command in a dedicated subsection. Expectations describe observable behavior: stdout JSON shape, stderr warnings, exit codes, and side effects.

## Output Contract

All commands produce structured output:

| Condition | stdout | stderr | Exit code |
|-----------|--------|--------|-----------|
| Success | `{"ok":true,"data":...}` | warnings only | 0 |
| Success with pagination | `{"ok":true,"data":...,"hasMore":bool,"nextOffset":...}` | warnings only | 0 |
| Error | `{"ok":false,"error":"...","code":"..."}` | nothing | 1 |
| Help text | plain text (not JSON) | nothing | 0 |
| Streaming (listen) | NDJSON lines, one JSON object per line | `[warn] Listening for events...` | 0 on Ctrl+C |

Error codes: `UNKNOWN`, `NOT_FOUND`, `UNAUTHORIZED`, `SESSION_EXPIRED`, `RATE_LIMITED`, `FLOOD_WAIT`, `INVALID_ARGS`, `TIMEOUT`, `NO_SESSION`, `PEER_FLOOD`.

## Entity Resolution

Every command that accepts a `<chat>`, `<user>`, or entity argument resolves it through the same logic. These expectations apply universally.

| Entity format | Resolution method | Expected behavior |
|---------------|-------------------|-------------------|
| `me` | `getMe()` | Resolves to current user's ID; for chat commands, creates a private chat (Saved Messages) |
| `self` | `getMe()` | Identical to `me` |
| `12345` | Direct numeric ID | Positive: try `getChat`, fallback to `createPrivateChat`; Negative: use as chat ID directly |
| `-1001234567890` | Direct negative ID | Used as chat ID directly (group/channel) |
| `@username` | `searchPublicChat(username)` | Strips leading `@`, searches by username |
| `username` | `searchPublicChat(username)` | Same as `@username` |
| `+15551234567` | `searchUserByPhoneNumber` | Strips leading `+`, searches by phone |
| `https://t.me/username` | Strip prefix, then `searchPublicChat` | Extracts `username` from URL, resolves as username |
| `http://t.me/username` | Strip prefix, then `searchPublicChat` | Same as https variant |
| `t.me/username` | Strip prefix, then `searchPublicChat` | Same, without protocol |

### Entity Resolution Edge Cases

- Non-existent `@username` => `{"ok":false,"error":"...","code":"NOT_FOUND"}`, exit 1
- Non-existent phone `+10000000000` => `{"ok":false,"error":"...","code":"NOT_FOUND"}`, exit 1
- Invalid phone format `+abc` => treated as username (no `+\d+` match), resolved via `searchPublicChat`, likely NOT_FOUND
- Empty string as entity => depends on command; most fail with INVALID_ARGS before resolution
- `t.me/` with no username after => empty string passed to `searchPublicChat`, likely NOT_FOUND
- Very large numeric ID that does not exist => TDLib error, mapped to NOT_FOUND
- Numeric ID `0` => may cause unexpected behavior; TDLib likely rejects it
- Negative zero `-0` => parsed as `0` by `Number()`, same as above

---

## Global Flags

### `--pretty`

| Command | Expected behavior |
|---------|-------------------|
| `tg me --pretty` | stdout JSON is indented with 2 spaces |
| `tg dialogs --pretty` | stdout JSON is indented with 2 spaces |
| `tg <any command> --pretty` | All JSON output uses `JSON.stringify(..., null, 2)` formatting |
| `tg <any command>` (without `--pretty`) | stdout JSON is single-line, no whitespace formatting |
| `tg daemon status --pretty` | Pretty-printed JSON output |

### `--timeout N`

| Command | Expected behavior |
|---------|-------------------|
| `tg messages me --timeout 5` | If command takes >5 seconds, output `{"ok":false,"error":"Command timed out after 5s","code":"TIMEOUT"}`, exit 1 |
| `tg messages me --timeout 0` | No timeout applied (0 is falsy); command runs indefinitely |
| `tg messages me --timeout -1` | Negative value: `setTimeout` with negative ms fires immediately or behaves as 0; command times out instantly |
| `tg messages me --timeout abc` | `Number("abc")` is NaN; `NaN > 0` is false, so no timeout applied |
| `tg messages me --timeout 0.5` | 0.5 seconds (500ms) timeout |
| `tg listen --type user --timeout 5` | Timeout is NOT applied to streaming commands; listen runs indefinitely regardless |
| `tg daemon status --timeout 5` | Timeout is NOT applied to daemon subcommands (they exit before the main run loop) |

### `--help`

| Command | Expected behavior |
|---------|-------------------|
| `tg --help` | Print top-level help to stdout, exit 0 |
| `tg help` | Same as `tg --help` |
| `tg` (no args) | Same as `tg --help` |
| `tg messages --help` | Print command-specific help (name, description, usage, flags) to stdout, exit 0 |
| `tg messages me --help` | Still prints help (--help checked before running); does NOT connect to daemon |
| `tg nonexistent --help` | Error: `Unknown command: "nonexistent"`, exit 1 (unknown command checked before --help for that command) |

### Unknown Flags

| Command | Expected behavior |
|---------|-------------------|
| `tg me --foo` | `{"ok":false,"error":"Unknown flag: --foo. Run 'tg me --help' for usage.","code":"INVALID_ARGS"}`, exit 1 |
| `tg messages me --foo --bar` | `{"ok":false,"error":"Unknown flags: --foo, --bar. Run 'tg messages --help' for usage.","code":"INVALID_ARGS"}`, exit 1 |
| `tg messages me --limit 10 --foo` | Error about unknown flag `--foo`, exit 1; known flags do not suppress unknown flag detection |

### Global Flag Edge Cases

- `--pretty` combined with error output => error JSON is also pretty-printed
- `--pretty` combined with `--timeout` => both apply independently
- `--pretty` with `daemon log` => if `--json` not passed, log output is plain text regardless of `--pretty`
- `--timeout` with `--pretty` => timeout still fires, error JSON is pretty-printed

---

## 1. Identity

### `me`

| Command | Expected behavior |
|---------|-------------------|
| `tg me` | Returns `{"ok":true,"data":{...}}` with slim user object: `id`, `first_name`, `last_name`, `username`, `phone_number`, `type`, `is_contact`, `is_verified`, `is_premium`, `is_scam`, `is_fake` |
| `tg me --pretty` | Same data, pretty-printed |

**Data shape:**
- `id`: positive integer
- `first_name`: string (always present)
- `last_name`: string or absent (omitted if empty)
- `username`: string or `null` (first active username, or null if none)
- `phone_number`: string
- `type`: one of `"regular"`, `"bot"`, `"deleted"`, `"unknown"`
- `is_contact`: boolean
- `is_verified`: boolean
- `is_premium`: boolean
- `is_scam`: boolean
- `is_fake`: boolean

#### Edge Cases

- Daemon not running => auto-starts daemon, then executes; if daemon fails to start, error with UNKNOWN
- Session not authenticated => TDLib error, mapped to UNAUTHORIZED or SESSION_EXPIRED
- `tg me extraarg` => extra positional args are ignored (no minArgs validation for `me`)
- `tg me --limit 5` => error: unknown flag `--limit`

---

### `resolve`

| Command | Expected behavior |
|---------|-------------------|
| `tg resolve @username` | Returns `{"ok":true,"data":{"chat":{...},"user":{...}}}` for a user, or `{"ok":true,"data":{"chat":{...}}}` for a group/channel |
| `tg resolve +15551234567` | Resolves phone number to user; returns chat + user objects |
| `tg resolve https://t.me/username` | Strips URL prefix, resolves as username |
| `tg resolve t.me/username` | Same as above |
| `tg resolve 12345` | Resolves numeric ID; positive => try getChat, fallback createPrivateChat; returns chat (+ user if private) |
| `tg resolve -1001234567890` | Resolves as chat ID directly; returns chat object |
| `tg resolve me` | Resolves to own user; returns chat (Saved Messages) + user |

**Data shape for private chats:**
- `data.chat`: slim chat object (id, type, title, unread_count, last_read_inbox_message_id, last_message)
- `data.user`: slim user object (id, first_name, last_name, username, phone_number, type, booleans)

**Data shape for groups/channels:**
- `data.chat`: slim chat object only (no `user` field)

#### Edge Cases

- `tg resolve` (no argument) => `{"ok":false,"error":"\"resolve\" requires at least 1 argument...","code":"INVALID_ARGS"}`, exit 1
- `tg resolve nonexistentuser` => NOT_FOUND error
- `tg resolve @` => searches for empty username, likely NOT_FOUND
- `tg resolve +` => not a valid phone pattern (`/^\+\d+$/` fails), treated as username search for `+`, likely NOT_FOUND
- `tg resolve +abc` => not a valid phone pattern, treated as username, likely NOT_FOUND
- Multiple args `tg resolve @a @b` => only first arg used, second ignored

---

### `contacts`

| Command | Expected behavior |
|---------|-------------------|
| `tg contacts` | Returns array of slim user objects for saved contacts, default limit 100, offset 0 |
| `tg contacts --limit 10` | Returns at most 10 contacts |
| `tg contacts --offset 50` | Skips first 50 contacts, returns from index 50 |
| `tg contacts --limit 10 --offset 50` | Returns contacts 50-59 |
| `tg contacts --limit 10 --offset 0` | Same as `--limit 10` |

**Pagination:**
- Response includes `hasMore: true` if total contacts > offset + limit
- Response includes `nextOffset: offset + limit` when `hasMore` is true
- When `hasMore` is false, `nextOffset` is absent

| Command | Expected behavior |
|---------|-------------------|
| `tg contacts search "alice"` | Returns `{"ok":true,"data":{"myResults":[...],"globalResults":[...]}}`. `myResults` = users with phone numbers, `globalResults` = users without |
| `tg contacts search "alice" --limit 5` | Limits search results to 5 total (both my + global come from same TDLib call) |
| `tg contacts search ""` | Empty query string; TDLib behavior depends on implementation, may return all or none |

#### Edge Cases

- `tg contacts search` (no query) => `{"ok":false,"error":"Missing required argument: <query>...","code":"INVALID_ARGS"}`, exit 1
- `tg contacts --limit 0` => error: `--limit must be a positive integer`, exit 1
- `tg contacts --limit -1` => error: `--limit must be a positive integer`, exit 1
- `tg contacts --limit 1.5` => error: `--limit must be a positive integer` (not an integer), exit 1
- `tg contacts --limit abc` => error: `--limit must be a positive integer` (NaN), exit 1
- `tg contacts --offset -5` => negative offset; `slice(-5, -5+100)` which is `slice(-5, 95)` -- may return unexpected results (JS slice with negative start counts from end)
- `tg contacts --offset abc` => `Number("abc")` = NaN; `slice(NaN, NaN+100)` = `slice(0, NaN)` = empty array. Returns empty data
- `tg contacts --offset 99999` => offset beyond total contacts; returns empty array, `hasMore: false`
- `tg contacts --limit 10 --offset 95` where total is 100 => returns 5 contacts, `hasMore: false`
- `tg contacts randomarg` => "randomarg" is not "search", so it's ignored; runs as normal contacts list
- `tg contacts search "alice" --offset 10` => `--offset` is accepted as a flag but not used by search subcommand; search uses TDLib's searchContacts which has its own limit but no offset
- Zero contacts saved => returns empty array `[]`, `hasMore: false`

---

## 2. Chats

### `dialogs`

| Command | Expected behavior |
|---------|-------------------|
| `tg dialogs` | Returns array of slim chat objects, default limit 40, from main chat list |
| `tg dialogs --limit 10` | Returns at most 10 chats |
| `tg dialogs --limit 100` | Returns at most 100 chats |
| `tg dialogs --archived` | Returns chats from archived list instead of main |
| `tg dialogs --unread` | Returns only chats with `unread_count > 0` |
| `tg dialogs --type user` | Returns only private chats (1:1 conversations) |
| `tg dialogs --type group` | Returns only group chats (basic groups + non-channel supergroups) |
| `tg dialogs --type channel` | Returns only channels (supergroups where `is_channel` is true) |
| `tg dialogs --search "project"` | Client-side case-insensitive substring match on chat title |
| `tg dialogs --search "PROJECT"` | Same as above (case-insensitive) |
| `tg dialogs --offset-date 1700000000` | Pagination: skip chats whose last message date >= the offset timestamp |
| `tg dialogs --archived --unread` | Archived chats that have unread messages |
| `tg dialogs --type user --unread` | Only unread private chats |
| `tg dialogs --type group --search "dev"` | Groups matching "dev" in title |
| `tg dialogs --type channel --limit 5 --unread` | At most 5 unread channels |
| `tg dialogs --archived --type group --unread --search "team" --limit 3` | All filters combined |

**Pagination behavior:**
- Unfiltered: `hasMore` is true when returned count >= limit; `nextOffset` is the last chat's `last_message.date`
- Filtered: iterative fetch in batches of 50, scans up to 500 chats; `hasMore` true when matched count >= limit AND scan not exhausted
- `nextOffset` is a unix timestamp (number) for use with `--offset-date` on next call

**Data shape per chat:**
- `id`: number (negative for groups/channels)
- `type`: `"user"`, `"group"`, or `"channel"`
- `title`: string
- `unread_count`: number
- `last_read_inbox_message_id`: number
- `unread_mention_count`: number (absent if 0)
- `last_message`: `{id, date, text?}` or absent

#### Edge Cases

- `tg dialogs --type invalid` => `{"ok":false,"error":"Invalid --type \"invalid\". Expected: user, group, or channel","code":"INVALID_ARGS"}`, exit 1
- `tg dialogs --type User` => error (case-sensitive check); "User" is not in the valid set
- `tg dialogs --offset-date -1` => error: `--offset-date must be a non-negative unix timestamp`
- `tg dialogs --offset-date abc` => error: `--offset-date must be a non-negative unix timestamp` (NaN is not finite)
- `tg dialogs --offset-date 0` => valid; 0 is non-negative. But `offsetDate` is truthy only if non-zero, so 0 won't trigger the offset filter. Effectively same as no offset-date
- `tg dialogs --limit 0` => error: `--limit must be a positive integer`
- `tg dialogs --search ""` => empty search string; `"".toLowerCase()` = `""`, and `title.includes("")` is always true, so no filtering effect
- `tg dialogs --search "a" --limit 1000` => scans up to 500 chats maximum; may return fewer than 1000 even if more exist
- No chats at all => returns empty array `[]`, `hasMore: false`
- `tg dialogs --archived` with no archived chats => empty array
- `tg dialogs --unread` with no unread chats => empty array
- `--offset-date` combined with `--unread` => both filters apply; chat must have unread AND last_message.date < offset

---

### `unread`

| Command | Expected behavior |
|---------|-------------------|
| `tg unread` | Returns chats from main list with `unread_count > 0`, default limit 50 |
| `tg unread --all` | Includes both main and archived chats with unread messages |
| `tg unread --type user` | Only unread private chats |
| `tg unread --type group` | Only unread group chats |
| `tg unread --type channel` | Only unread channels |
| `tg unread --limit 5` | At most 5 unread chats |
| `tg unread --all --type user --limit 10` | All filters combined |

**Scan behavior:**
- Scans up to 500 chats from main list (and 500 from archive if `--all`)
- Filters by `unread_count > 0` then by `--type`
- Returns `hasMore: true` when total unread matching > limit

**Data shape:** Same as dialogs (array of slim chat objects).

#### Edge Cases

- `tg unread --type invalid` => error: `Invalid --type "invalid"...`
- `tg unread --limit 0` => error: `--limit must be a positive integer`
- No unread chats => empty array, `hasMore: false`
- `tg unread --all` but no archived chats => still returns main list unreads only
- `tg unread` without `--all` => archived chats with unreads are NOT included
- Very many unread chats (>500) => only scans 500; may miss some

---

### `chat`

| Command | Expected behavior |
|---------|-------------------|
| `tg chat @username` | Returns detailed info: `{"ok":true,"data":{"chat":{...},"user":{...}}}` for private, `{"ok":true,"data":{"chat":{...}}}` for group/channel |
| `tg chat -1001234567890` | Returns chat info for group/channel |
| `tg chat me` | Returns own Saved Messages chat + own user info |
| `tg chat 12345` | Resolves positive numeric ID; private chat => includes user info |

**Data shape:** Same as `resolve` -- chat object + optional user object.

#### Edge Cases

- `tg chat` (no argument) => `{"ok":false,"error":"\"chat\" requires at least 1 argument...","code":"INVALID_ARGS"}`, exit 1
- `tg chat nonexistent` => NOT_FOUND
- `tg chat @username` where username is a group => returns chat without user field
- `tg chat @username` where username is a user => returns chat + user

---

### `members`

| Command | Expected behavior |
|---------|-------------------|
| `tg members @groupname` | Returns array of slim member objects, default limit 100, recent members |
| `tg members @groupname --limit 10` | At most 10 members |
| `tg members @groupname --type admin` | Only admins and creators |
| `tg members @groupname --type bot` | Only bot members |
| `tg members @groupname --type recent` | Recent members (default) |
| `tg members @groupname --filter admin` | Same as `--type admin` (alias) |
| `tg members @groupname --search "alice"` | Search members by name |
| `tg members @groupname --offset 100` | Pagination: skip first 100 |
| `tg members @groupname --offset 100 --limit 50` | Members 100-149 |

**Supergroup vs Basic Group behavior:**
- Supergroups: uses `getSupergroupMembers` with TDLib-native filter (`supergroupMembersFilterBots`, `supergroupMembersFilterAdministrators`, `supergroupMembersFilterSearch`, `supergroupMembersFilterRecent`)
- Basic groups: uses `getBasicGroupFullInfo` then client-side filtering
- Basic group + `--search`: client-side name match (case-insensitive)
- Basic group + `--type bot`: client-side filter by `userTypeBot`
- Basic group + `--type admin`: client-side filter by `chatMemberStatusAdministrator` or `chatMemberStatusCreator`

**Supergroup --search + --type interaction:**
- If `--type bot` is specified, the TDLib filter is `supergroupMembersFilterBots` regardless of `--search`
- If `--type admin` is specified, the TDLib filter is `supergroupMembersFilterAdministrators` regardless of `--search`
- If `--search` is specified without `--type` (or `--type recent`), filter is `supergroupMembersFilterSearch`
- If neither `--search` nor meaningful `--type`, filter is `supergroupMembersFilterRecent`

**Data shape per member:**
- `user_id`: number
- `sender_type`: `"user"` or `"chat"`
- `joined_date`: number (unix timestamp) or absent
- `status`: `"creator"`, `"admin"`, `"member"`, `"restricted"`, `"banned"`, `"left"`
- `custom_title`: string or absent (only for creator/admin)

**Pagination:**
- `hasMore`: true when returned count >= limit (supergroup) or total > offset + limit (basic group)
- `nextOffset`: `offset + limit` when `hasMore` is true

#### Edge Cases

- `tg members` (no chat argument) => error: requires at least 1 argument
- `tg members @username` where @username is a private chat => error: `Chat is not a group or channel`, code INVALID_ARGS
- `tg members me` => resolves to Saved Messages (private chat) => error: `Chat is not a group or channel`
- `tg members @group --type invalid` => no error from validation, but for supergroups, falls through to `supergroupMembersFilterRecent`; for basic groups, no filtering applied
- `tg members @group --type admin --search "alice"` => for supergroups, `--type admin` takes precedence, `--search` is ignored; for basic groups, both filters apply (admin status AND name match)
- `tg members @group --limit 0` => error: `--limit must be a positive integer`
- `tg members @group --offset -1` => negative offset; for supergroups, TDLib may reject or return from start; for basic groups, `slice(-1, -1+100)` returns last member + up to 99 more
- Empty group (no members) => returns empty array
- `tg members @group --filter bot --type admin` => `--type` takes precedence (checked first: `flags['--type'] ?? flags['--filter']`), so admin filter is used
- Secret chat => `chatTypeSecret` maps to `getChatType` returning "user", but `chat.type._` is `chatTypeSecret` which is neither supergroup nor basic group => error: `Chat is not a group or channel`

---

## 3. Messages

### `message`

| Command | Expected behavior |
|---------|-------------------|
| `tg message @chat 12345` | Returns single slim message object for message ID 12345 in the specified chat |
| `tg message me 12345` | Returns message from Saved Messages |
| `tg message -1001234567890 12345` | Returns message from group/channel by numeric chat ID |

**Data shape:**
- `id`: number (TDLib message ID)
- `sender_type`: `"user"` or `"chat"`
- `sender_id`: number
- `sender_name`: string (resolved from user/chat, absent if resolution fails)
- `chat_id`: number
- `is_outgoing`: boolean
- `date`: number (unix timestamp)
- `edit_date`: number or absent
- `reply_to_message_id`: number or absent
- `reply_in_chat_id`: number or absent (only if reply is in different chat)
- `forward_info`: object or absent
- `media_album_id`: string or absent (omitted if "0" or 0)
- `content`: varies by type (see Content Types below)

**Auto-download:** Small files (<=1MB) for photos, stickers, voice notes, video notes are auto-downloaded. The `file.downloaded` and `file.local_path` fields reflect this.

**Content Types:**

| content.type | Additional fields |
|-------------|-------------------|
| `messageText` | `text` (string, with markdown entities unparsed to markdown syntax) |
| `messagePhoto` | `caption?`, `photo.width`, `photo.height`, `photo.file` |
| `messageVideo` | `caption?`, `file_name`, `mime_type`, `duration`, `width`, `height`, `file` |
| `messageDocument` | `caption?`, `file_name`, `mime_type`, `file` |
| `messageAudio` | `caption?`, `file_name`, `mime_type`, `duration`, `title`, `performer`, `file` |
| `messageAnimation` | `caption?`, `file_name`, `mime_type`, `duration`, `width`, `height`, `file` |
| `messageVoiceNote` | `caption?`, `transcript?`, `duration`, `mime_type`, `file` |
| `messageVideoNote` | `transcript?`, `duration`, `width`, `height`, `file` |
| `messageSticker` | `emoji` |
| `messageLocation` | `location` |
| `messageContact` | `contact` |
| `messagePoll` | `poll` |
| `messageCall` | `is_video`, `duration`, `discard_reason` |
| Other types | `type` + raw fields from TDLib |

**File object shape:** `{id, size, downloaded, local_path?}`

#### Edge Cases

- `tg message @chat` (no message ID) => error: requires at least 2 arguments
- `tg message` (no args) => error: requires at least 2 arguments
- `tg message @chat 0` => `Number(0)` is falsy => error: `Invalid message ID`
- `tg message @chat abc` => `Number("abc")` is NaN, which is falsy => error: `Invalid message ID`
- `tg message @chat 99999999` (non-existent message) => TDLib error, mapped to NOT_FOUND
- `tg message @chat -1` => negative message ID; TDLib may reject or return error
- Deleted message => TDLib error, NOT_FOUND
- Message in a chat the user is not a member of => TDLib error, likely UNAUTHORIZED or NOT_FOUND

---

### `messages`

| Command | Expected behavior |
|---------|-------------------|
| `tg messages @chat` | Returns up to 20 messages (newest first) from chat history |
| `tg messages @chat --limit 5` | Returns up to 5 messages |
| `tg messages @chat --limit 50` | Returns up to 50 messages |
| `tg messages @chat --offset-id 12345` | Returns messages starting from (but not including) message ID 12345, going backwards |
| `tg messages @chat --reverse` | Returns messages in chronological order (oldest first) |
| `tg messages @chat --from @user` | Filter by sender; uses client-side filter in history mode |
| `tg messages @chat --from me` | Filter to only own messages |
| `tg messages @chat --search "hello"` | Enters search mode: uses `searchChatMessages` instead of `getChatHistory` |
| `tg messages @chat --since 1700000000` | Enters search mode: messages after the unix timestamp |
| `tg messages @chat --filter photo` | Filter by media type: uses `searchChatMessages` with photo filter |
| `tg messages @chat --filter video` | Video messages only |
| `tg messages @chat --filter document` | Document messages only |
| `tg messages @chat --filter url` | Messages containing URLs |
| `tg messages @chat --filter voice` | Voice note messages only |
| `tg messages @chat --filter gif` | Animation/GIF messages only |
| `tg messages @chat --filter music` | Audio messages only |
| `tg messages @chat --min-id 1000` | Only messages with ID > 1000 (exclusive, client-side filter) |
| `tg messages @chat --max-id 5000` | Only messages with ID < 5000 (exclusive, client-side filter) |
| `tg messages @chat --min-id 1000 --max-id 5000` | Messages with 1000 < ID < 5000 |
| `tg messages @chat --download-media` | Auto-download photos, stickers, voice messages; adds `local_path` to file objects |

**Three execution modes:**

1. **Search mode** (triggered by `--search` or `--since`): Uses `searchChatMessages`. Supports `--from` (server-side sender filter), `--filter`, `--since`, `--offset-id`.
2. **Filter mode** (triggered by `--filter` without `--search`/`--since`): Uses `searchChatMessages` with empty query. Supports `--from`, `--min-id`, `--max-id`, `--offset-id`.
3. **History mode** (default): Uses `getChatHistory`. Supports `--from` (client-side), `--min-id`, `--max-id`, `--offset-id`, `--reverse`.

**Pagination:**
- `hasMore`: true when matched count >= limit
- `nextOffset`: last message's ID when not reversed; first message's ID when reversed
- For search/filter modes with `--since`: iterative batching, scans up to 500

**Auto-download behavior:**
- Always: small files <=1MB for specific types (photos, stickers, voice/video notes) via `autoDownloadSmall`
- With `--download-media`: additionally downloads photos, stickers, voice/video notes regardless of size via `autoDownloadMessages`

**Combined flags:**

| Command | Expected behavior |
|---------|-------------------|
| `tg messages @chat --search "hello" --from @user` | Search for "hello" from specific sender |
| `tg messages @chat --search "hello" --since 1700000000` | Search for "hello" after timestamp |
| `tg messages @chat --search "hello" --filter photo` | Search for "hello" in photo captions |
| `tg messages @chat --since 1700000000 --filter photo` | Photos after timestamp |
| `tg messages @chat --filter photo --from @user` | Photos from specific user (in filter mode, --from is client-side) |
| `tg messages @chat --filter photo --min-id 100 --max-id 5000` | Photos in ID range |
| `tg messages @chat --from @user --min-id 100` | Messages from user with ID > 100 (client-side filters in history mode) |
| `tg messages @chat --reverse --limit 10` | Oldest 10 messages (but fetched newest-first, then reversed) |
| `tg messages @chat --reverse --offset-id 100` | Messages before ID 100, reversed to chronological order |
| `tg messages @chat --search "hello" --reverse` | `--reverse` is NOT applied in search mode (only in history mode) |
| `tg messages @chat --limit 10 --offset-id 500 --reverse` | Fetch 10 messages before ID 500, then reverse to chronological |

#### Edge Cases

- `tg messages` (no chat) => error: requires at least 1 argument
- `tg messages @chat --limit 0` => error: `--limit must be a positive integer`
- `tg messages @chat --limit -5` => error: `--limit must be a positive integer`
- `tg messages @chat --filter invalid` => error: `Invalid --filter "invalid". Expected: photo, video, document, url, voice, gif, music`
- `tg messages @chat --filter Photo` => error (case-sensitive match)
- `tg messages @chat --offset-id abc` => `Number("abc")` = NaN, used as `from_message_id` = NaN; TDLib behavior undefined, likely returns from latest
- `tg messages @chat --since abc` => enters search mode (since is truthy string); `Number("abc")` = NaN; messages with `date < NaN` is always false, so no messages filtered out
- `tg messages @chat --since -1` => negative timestamp; all messages have `date >= 0` so none filtered
- `tg messages @chat --min-id abc` => `Number("abc")` = NaN; `m.id <= NaN` is always false, so no filtering effect
- Empty chat (no messages) => empty array, `hasMore: false`
- `tg messages @chat --search ""` => empty search query; TDLib returns all messages (no text filter)
- `tg messages @chat --from nonexistent` => resolveEntity fails with NOT_FOUND before any messages are fetched
- `tg messages @chat --search "hello" --min-id 100` => search mode does NOT apply min-id/max-id (those are only in history/filter mode)
- `tg messages @chat --download-media` => downloads photos, stickers, voice notes regardless of size; other media types (video, documents) are NOT auto-downloaded
- Very large `--limit` (e.g., 10000) => scan cap of 500 prevents runaway; may return fewer than requested
- `--from` in search mode vs history mode: in search mode, `--from` is passed as `sender_id` to TDLib (server-side); in history mode, it's a client-side filter requiring iterative batching

---

### `search`

| Command | Expected behavior |
|---------|-------------------|
| `tg search "hello"` | Global search across all chats; returns up to 20 results |
| `tg search "hello" --limit 5` | At most 5 results |
| `tg search "hello" --chat @groupname` | Per-chat search within specific chat |
| `tg search "hello" --chat @groupname --from @user` | Per-chat search filtered by sender |
| `tg search "hello" --since 1700000000` | Only messages after timestamp |
| `tg search "hello" --type user` | Global search, only results from private chats |
| `tg search "hello" --type group` | Global search, only results from groups |
| `tg search "hello" --type channel` | Global search, only results from channels |
| `tg search "hello" --chat @group --filter photo` | Per-chat search, only photo messages |
| `tg search "hello" --context 3` | Include 3 messages before and after each hit |
| `tg search "hello" --full` | Return full message text (no truncation) |
| `tg search "hello" --offset "cursor_string"` | Paginate global search with cursor from previous `nextOffset` |
| `tg search "hello" --offset-cursor "cursor"` | Alias for `--offset` |
| `tg search "hello" --chat @group --offset-id 12345` | Paginate per-chat search with message ID |
| `tg search --filter photo --chat @group` | Search by media type without text query; query defaults to " " (space) |

**Global search data shape:** Each result includes:
- All slim message fields
- `chat_id`: number
- `chat_title`: string (resolved from chat)
- `content`: may be truncated to 500 chars (unless `--full`)
- `truncated`: boolean (present only if text was truncated)
- `context`: array of surrounding messages (if `--context` used)

**Per-chat search data shape:** Same as global but without `chat_title`.

**Truncation:**
- Default: `messageText.text` and media captions truncated to 500 chars
- `--full`: no truncation
- `truncated: true` field added when truncation occurred

**Context enrichment:**
- `--context N`: fetches N messages before and after each hit using `getChatHistory`
- Context is only fetched for the first 5 results (MAX_CONTEXT = 5); remaining results get `context: []`
- Context messages exclude the hit message itself

**Pagination:**
- Per-chat: `nextOffset` is the last message ID (number); use with `--offset-id`
- Global: `nextOffset` is an opaque cursor string; use with `--offset` or `--offset-cursor`
- `hasMore: true` when result count >= limit

**Global vs Per-chat restrictions:**

| Flag | Global search | Per-chat search |
|------|---------------|-----------------|
| `--from` | Error: requires `--chat` | Supported |
| `--type` | Supported | Ignored (not validated) |
| `--filter` | Not supported (per-chat only per help text, but code passes `filter: undefined` for global) | Supported |
| `--offset` | Supported (cursor) | Not applicable |
| `--offset-id` | Not applicable | Supported |
| `--context` | Supported (each result's chat) | Supported |

#### Edge Cases

- `tg search` (no query, no filter) => error: `Missing <query>. Or use --filter to search by media type.`
- `tg search "" --chat @group` => empty string is falsy; without `--filter`, error about missing query
- `tg search "hello" --from @user` (global, no `--chat`) => error: `--from requires --chat for per-chat search. Global search does not support sender filtering.`
- `tg search "hello" --type invalid` => error: `Invalid --type "invalid"...`
- `tg search "hello" --chat @group --type user` => `--type` is accepted but not validated/used in per-chat mode (it's only checked in global branch)
- `tg search "hello" --filter invalid --chat @group` => error: `Invalid --filter "invalid"...`
- `tg search "hello" --context 0` => 0 is falsy, no context enrichment
- `tg search "hello" --context -1` => error: `--context must be a positive integer`
- `tg search "hello" --context abc` => `Number("abc")` = NaN; fails the finite check, error: `--context must be a positive integer`
- `tg search "hello" --context 1.5` => fails integer check, error
- `tg search "hello" --offset "cursor" --offset-cursor "cursor2"` => `--offset` takes precedence (`flags['--offset'] ?? flags['--offset-cursor']`)
- `tg search "hello" --since abc` => `Number("abc")` = NaN; for global, `min_date: NaN`; for per-chat, messages with `date < NaN` is false, no filtering
- No results found => empty array, `hasMore: false`
- `tg search "hello" --type user --limit 100` => may scan up to 500 messages from global search, filtering by chat type client-side; may return fewer than 100 if not enough matches in 500 scanned
- `tg search "hello" --context 10 --limit 20` => context fetched only for first 5 results; results 6-20 have `context: []`
- Global search with `--since` => passed as `min_date` to `searchMessages` (server-side)
- Per-chat search with `--since` => client-side filter with iterative batching

---

## 4. Messages (Write Operations)

### `send`

| Command | Expected behavior |
|---------|-------------------|
| `tg send @user "Hello world"` | Sends plain text message; returns slim message object with server-assigned ID |
| `tg send me "note to self"` | Sends to Saved Messages |
| `tg send @group "Hello" --silent` | Sends without notification |
| `tg send @user "Hello" --reply-to 12345` | Sends as reply to message 12345 |
| `tg send @user "*bold*" --md` | Parses Telegram MarkdownV2 |
| `tg send @user "<b>bold</b>" --html` | Parses HTML entities |
| `tg send @user "https://example.com" --no-preview` | Disables link preview |
| `tg send @user "Hello" --reply-to 12345 --silent --no-preview` | All options combined |
| `echo "piped text" \| tg send @user --stdin` | Reads message text from stdin pipe |
| `tg send @user --file /path/to/file.txt` | Reads message text from file |

**Send flow:**
1. Subscribe to TDLib updates (before sending)
2. Call `sendMessage` which returns a provisional message with temporary local ID
3. Wait for `updateMessageSendSucceeded` (up to 5 seconds) to get server-assigned ID
4. If timeout: warn on stderr, return provisional message
5. If `updateMessageSendFailed`: throw error with TDLib error message

**Parse mode precedence:**
- `--md` => Telegram MarkdownV2 parsing via `parseTextEntities`
- `--html` => HTML parsing via `parseTextEntities`
- Neither => plain text (no entity parsing)
- `--md --html` => `--md` checked first, so MarkdownV2 wins

**--stdin behavior:**
- Reads all of stdin until EOF
- Strips trailing newline
- Appends as positional arg (becomes the text argument)
- If stdin is a TTY (not piped), error: `--stdin requires piped input`
- If stdin is empty, error: `No input received from stdin`

**--file behavior:**
- Reads entire file as UTF-8
- Appends as positional arg
- If file doesn't exist, error: `File not found: <path>`
- If file is empty, error: `File is empty: <path>`

#### Edge Cases

- `tg send @user` (no text) => error: requires at least 2 arguments
- `tg send` (no args) => error: requires at least 2 arguments
- `tg send @user ""` => empty string is a valid positional arg; TDLib may reject with MESSAGE_EMPTY => INVALID_ARGS
- `tg send @user "Hello" --md --html` => both are boolean flags; `--md` is checked first, so MarkdownV2 parsing is used
- `tg send @user "*unclosed bold" --md` => `parseTextEntities` may fail with TDLib error about invalid markdown => mapped error
- `tg send @user "<b>unclosed" --html` => `parseTextEntities` may fail with TDLib error about invalid HTML => mapped error
- `tg send @user --stdin --file /path` => both are processed: `--stdin` adds text first, then `--file` adds another positional arg; command sees 3 positional args, uses `args[1]` as text (from stdin)
- `tg send @user "inline text" --stdin` => with piped input, stdin text is appended after "inline text"; `args[1]` = "inline text" is used (stdin text becomes `args[2]`, ignored)
- `tg send @user "inline text" --file /path` => same as above; file text becomes `args[2]`, ignored
- `tg send @user --stdin` (no piped input, TTY) => error: `--stdin requires piped input`
- `tg send @user --file /nonexistent` => error: `File not found: /nonexistent`
- `tg send @user --file /empty/file` => error: `File is empty: /empty/file`
- `tg send @user "Hello" --reply-to abc` => `Number("abc")` = NaN; sent as reply_to with NaN message_id; TDLib may reject
- `tg send @user "Hello" --reply-to 0` => reply to message 0; TDLib may ignore or reject
- Very long message (>4096 chars) => TDLib error MESSAGE_TOO_LONG => INVALID_ARGS
- Sending to a chat where user lacks write permission => TDLib error WRITE_FORBIDDEN => UNAUTHORIZED
- Rate limited => 429 error; if wait <= 30s, auto-retry after wait; if > 30s, error with FLOOD_WAIT
- Send succeeds but server ID timeout => stderr warning, returns provisional message (local ID)
- `tg send @user "Hello" --no-preview` on a message without links => no effect, message sent normally

---

### `edit`

| Command | Expected behavior |
|---------|-------------------|
| `tg edit @chat 12345 "new text"` | Edits message 12345 with new plain text; returns updated slim message |
| `tg edit @chat 12345 "*bold*" --md` | Edits with MarkdownV2 parsing |
| `tg edit @chat 12345 "<b>bold</b>" --html` | Edits with HTML parsing |
| `echo "new text" \| tg edit @chat 12345 --stdin` | Reads new text from stdin |
| `tg edit @chat 12345 --file /path/to/file.txt` | Reads new text from file |

**Data shape:** Returns updated slim message object (same shape as `message` command).

#### Edge Cases

- `tg edit @chat 12345` (no new text) => error: requires at least 3 arguments
- `tg edit @chat` (no msgId) => error: requires at least 3 arguments
- `tg edit` (no args) => error: requires at least 3 arguments
- `tg edit @chat abc "text"` => message ID `abc` becomes `NaN`; TDLib rejects => error
- `tg edit @chat 12345 "new text"` where message is not yours => TDLib error MESSAGE_EDIT_FORBIDDEN or similar => UNAUTHORIZED
- `tg edit @chat 12345 "new text"` where message doesn't exist => TDLib error => NOT_FOUND
- `tg edit @chat 12345 "new text" --md --html` => `--md` takes precedence
- `tg edit @chat 12345 ""` => empty text; TDLib may reject with MESSAGE_EMPTY => INVALID_ARGS
- Editing a message with media (photo caption) => `editMessageText` replaces content; behavior depends on TDLib (may fail for non-text messages)
- `tg edit @chat 12345 "text" --no-preview` => error: unknown flag `--no-preview` (not in edit's flag list)

---

## 5. Actions

### `read`

| Command | Expected behavior |
|---------|-------------------|
| `tg read @chat` | Marks all messages as read in the chat; returns `{"ok":true,"data":{"chat":"@chat","marked":true}}` |
| `tg read me` | Marks Saved Messages as read |
| `tg read -1001234567890` | Marks group/channel as read |

**Implementation:** Gets the chat's last message, then calls `viewMessages` with that message ID and `force_read: true`.

#### Edge Cases

- `tg read` (no chat) => error: requires at least 1 argument
- `tg read @chat` where chat has no messages (`last_message` is null) => `viewMessages` is NOT called; returns `{"chat":"@chat","marked":true}` anyway
- `tg read @nonexistent` => entity resolution fails => NOT_FOUND
- Already fully read chat => still calls viewMessages; returns success
- The `data.chat` field contains the raw entity string (e.g., "@chat"), NOT the resolved chat ID

---

### `delete`

| Command | Expected behavior |
|---------|-------------------|
| `tg delete @chat 12345` | Deletes message 12345 for self only; returns `{"ok":true,"data":{"chat":<chatId>,"deleted":[12345]}}` |
| `tg delete @chat 12345 --revoke` | Deletes message 12345 for everyone |
| `tg delete @chat 12345 67890` | Deletes multiple messages at once |
| `tg delete @chat 12345 67890 11111 --revoke` | Deletes multiple messages for everyone |

**Note:** `data.chat` contains the resolved numeric chat ID (unlike `read` which returns the raw string).

#### Edge Cases

- `tg delete @chat` (no message ID) => error: requires at least 2 arguments
- `tg delete` (no args) => error: requires at least 2 arguments
- `tg delete @chat abc` => `Number("abc")` = NaN; TDLib receives `[NaN]` as message_ids, likely rejects
- `tg delete @chat 12345` where message doesn't exist => TDLib may silently succeed or return error
- `tg delete @chat 12345 --revoke` in a private chat => revokes for both parties
- `tg delete @chat 12345 --revoke` in a group where you're not admin and message is not yours => TDLib error => UNAUTHORIZED
- `tg delete @chat 12345 --revoke` for a message older than 48 hours (in private/basic groups) => TDLib may reject
- Deleting 0 messages: not possible since minArgs=2 (at least chat + one msgId)

---

### `forward`

| Command | Expected behavior |
|---------|-------------------|
| `tg forward @fromchat @tochat 12345` | Forwards message 12345; returns array of slim forwarded messages with server IDs |
| `tg forward @from @to 12345 67890` | Forwards multiple messages |
| `tg forward @from @to 12345 --silent` | Forwards without notification |

**Forward flow:**
1. Subscribe to TDLib updates
2. Call `forwardMessages`
3. Wait for `updateMessageSendSucceeded` for each provisional message (up to 5 seconds)
4. If timeout with partial confirmations: warn, return confirmed ones
5. If timeout with no confirmations: warn, return provisional messages
6. If `updateMessageSendFailed`: count down expected, resolve when all accounted for

#### Edge Cases

- `tg forward @from @to` (no message IDs) => error: requires at least 3 arguments
- `tg forward @from` (missing to-chat) => error: requires at least 3 arguments
- `tg forward @from @to abc` => `Number("abc")` = NaN in message IDs; TDLib may reject
- `tg forward @from @to 12345` where message doesn't exist => TDLib error
- Forwarding to a chat without write permission => TDLib error => UNAUTHORIZED
- Forwarding from a chat where forwarding is restricted => TDLib error
- `tg forward @from @to 12345 67890 11111` => multiple messages forwarded; waits for all to confirm
- Partial send failure (some succeed, some fail) => returns only confirmed messages after timeout

---

### `pin`

| Command | Expected behavior |
|---------|-------------------|
| `tg pin @chat 12345` | Pins message 12345 with notification; returns `{"ok":true,"data":{"chat":"@chat","pinned":12345}}` |
| `tg pin @chat 12345 --silent` | Pins without notification |

**Note:** `data.chat` contains the raw entity string, `data.pinned` is the numeric message ID.

#### Edge Cases

- `tg pin @chat` (no message ID) => error: requires at least 2 arguments
- `tg pin` (no args) => error: requires at least 2 arguments
- `tg pin @chat abc` => `Number("abc")` = NaN; TDLib rejects
- `tg pin @chat 12345` without admin permissions => TDLib error => UNAUTHORIZED
- `tg pin @chat 99999` (non-existent message) => TDLib error
- Pinning an already-pinned message => TDLib may succeed silently

---

### `unpin`

| Command | Expected behavior |
|---------|-------------------|
| `tg unpin @chat 12345` | Unpins specific message; returns `{"ok":true,"data":{"chat":"@chat","unpinned":12345}}` |
| `tg unpin @chat --all` | Unpins all messages; returns `{"ok":true,"data":{"chat":"@chat","unpinnedAll":true}}` |

#### Edge Cases

- `tg unpin @chat` (no msgId and no --all) => error: `Missing <msgId> or --all flag`
- `tg unpin` (no args) => error: requires at least 1 argument
- `tg unpin @chat 12345 --all` => `--all` is checked first; unpins all messages regardless of the msgId argument
- `tg unpin @chat abc` => `Number("abc")` = NaN; TDLib rejects
- `tg unpin @chat 12345` without admin permissions => TDLib error => UNAUTHORIZED
- `tg unpin @chat --all` in a chat with no pinned messages => TDLib succeeds silently
- `tg unpin @chat 99999` (non-existent message) => TDLib error

---

### `react`

| Command | Expected behavior |
|---------|-------------------|
| `tg react @chat 12345 "👍"` | Adds thumbs-up reaction; returns `{"ok":true,"data":{"chat":"@chat","msgId":12345,"emoji":"👍","action":"added"}}` |
| `tg react @chat 12345 "👍" --remove` | Removes reaction; `action: "removed"` |
| `tg react @chat 12345 "❤️" --big` | Adds with big animation |
| `tg react @chat 12345 "👍" --big --remove` => `--remove` removes reaction (--big is irrelevant for removal) |

**Emoji normalization:** Variation selectors (`\uFE0E`, `\uFE0F`) are stripped from the emoji string before sending.

#### Edge Cases

- `tg react @chat 12345` (no emoji) => error: requires at least 3 arguments
- `tg react @chat` (missing msgId and emoji) => error: requires at least 3 arguments
- `tg react @chat 12345 "🎉"` where this emoji is not allowed in the chat => caught specifically; error: `Reaction "🎉" is invalid -- this emoji may not be allowed in this chat`, code INVALID_ARGS
- `tg react @chat 12345 "abc"` (not a valid emoji) => TDLib REACTION_INVALID error => caught, same INVALID_ARGS message
- `tg react @chat abc "👍"` => `Number("abc")` = NaN; TDLib rejects
- `tg react @chat 12345 "👍" --remove` when reaction wasn't added => TDLib may error or succeed silently
- `tg react @chat 12345 "👍"` when already reacted => TDLib may error or update existing reaction
- `data.chat` contains the raw entity string; `data.msgId` is the parsed number

---

## 6. Real-time

### `listen`

| Command | Expected behavior |
|---------|-------------------|
| `tg listen --type user` | Streams events from all private chats as NDJSON |
| `tg listen --type group` | Streams events from all groups |
| `tg listen --type channel` | Streams events from all channels |
| `tg listen --chat -1001234567890` | Streams events from specific chat |
| `tg listen --chat -100123,-100456` | Streams events from multiple chats (comma-separated) |
| `tg listen --type user --chat -100123` | Streams from all users AND the specific chat |
| `tg listen --type user --exclude-chat -100123` | All user chats except the specified one |
| `tg listen --type user --exclude-type group` | User chats, explicitly excluding groups (redundant here, but valid) |
| `tg listen --type user --event new_message` | Only new message events from user chats |
| `tg listen --type user --event new_message,edit_message` | Multiple event types |
| `tg listen --type user --incoming` | Only incoming messages (filter out outgoing) |
| `tg listen --type user --download-media` | Auto-download photos, stickers, voice messages for incoming events |

**Required:** Must specify `--chat` or `--type` (or both). Without either => error: `Must specify --chat or --type`.

**Default event types:** `new_message`, `edit_message`, `delete_messages`, `message_reactions`

**All available event types:**
- `new_message` - new message received
- `edit_message` - message content or edit date changed
- `delete_messages` - messages permanently deleted
- `message_reactions` - reaction info updated
- `read_outbox` - outgoing messages read by recipient
- `user_typing` - user typing indicator
- `user_status` - user online/offline status change
- `message_send_succeeded` - own sent message confirmed by server

**Special events (always emitted, not filterable):**
- `auth_state` - authorization state changes
- `reconnected` - connection restored after disconnect

**NDJSON event shapes:**

```
{"type":"new_message","chat_id":number,"message":{...slim message...}}
{"type":"edit_message","chat_id":number,"message":{...slim message...}}
{"type":"delete_messages","chat_id":number,"message_ids":[...]}
{"type":"message_reactions","chat_id":number,"message_id":number,"interaction_info":{...}}
{"type":"read_outbox","chat_id":number,"last_read_outbox_message_id":number}
{"type":"user_typing","chat_id":number,"sender_id":{...},"action":{...}}
{"type":"user_status","user_id":number,"status":{...}}
{"type":"message_send_succeeded","chat_id":number,"old_message_id":number,"message":{...}}
{"type":"auth_state","authorization_state":{...}}
{"type":"reconnected"}
```

**Chat inclusion logic:**
1. If chat is in `--exclude-chat`, skip
2. If chat type matches `--exclude-type`, skip
3. If chat is in `--chat` set, include
4. If chat type matches `--type`, include
5. Otherwise, skip

**Streaming behavior:**
- Writes `[warn] Listening for events. Press Ctrl+C to stop.` to stderr on start
- Never resolves (blocks forever)
- `--timeout` does NOT apply to streaming commands
- Exit via SIGINT (Ctrl+C) or SIGTERM

**Chat ID resolution:** Chat IDs in `--chat` and `--exclude-chat` are resolved at startup using `resolveChatId` (supports @username, numeric IDs, etc).

**Chat type caching:** Chat types are cached in memory to avoid repeated TDLib lookups per event.

**--incoming filter:** Only applies to `new_message` events; checks `msg.is_outgoing`.

**--download-media:** For `new_message` events, downloads photos/stickers/voice/video notes before emitting. If download fails, event is still emitted without downloaded file.

#### Edge Cases

- `tg listen` (no --chat, no --type) => error: `Must specify --chat or --type`
- `tg listen --type invalid` => error: `Invalid --type "invalid"...`
- `tg listen --type user --exclude-type invalid` => error: `Invalid --exclude-type "invalid"...`
- `tg listen --chat abc` => resolves "abc" as entity; if not found, error at startup before listening begins
- `tg listen --chat 123,abc,456` => resolves each; if any fails, error at startup
- `tg listen --type user --event nonexistent_event` => no error, but no events will match "nonexistent_event"; effectively silent
- `tg listen --type user --event ""` => empty string in event set; no events match ""
- `tg listen --type user --incoming` => `--incoming` only filters `new_message` events; other events (edit, delete, reactions) still pass through even if from outgoing messages
- `tg listen --type user --exclude-type user` => type user is included by `--type` but excluded by `--exclude-type`; exclusion happens first in the `shouldSkip` logic, so all user chats are excluded. Effectively listens to nothing
- `tg listen --chat -100123 --exclude-chat -100123` => same chat included and excluded; exclusion wins (checked first). Listens to nothing
- `user_status` events do NOT go through the `shouldSkip` filter (they have no chat_id, only user_id); they are always emitted if `user_status` is in the event filter
- `auth_state` events are always emitted regardless of `--event` filter
- `reconnected` events are always emitted regardless of `--event` filter
- `delete_messages` events with `is_permanent: false` are NOT emitted (only permanent deletions)
- Handler errors inside the update callback are silently caught and ignored
- Connection drop and reconnection => `reconnected` event emitted when connection state returns to ready

---

## 7. Media

### `download`

| Command | Expected behavior |
|---------|-------------------|
| `tg download @chat 12345` | Downloads media from message 12345; returns `{"ok":true,"data":{"file":"<absolute path>","size":number,"mime_type":"..."}}` |
| `tg download @chat 12345 --output /tmp/photo.jpg` | Downloads and copies to specified output path |
| `tg download --file-id 789` | Downloads by TDLib file ID directly |

**File path:** Always an absolute path. If `--output` is specified, the copied file path is returned. Otherwise, TDLib's internal download path is returned.

**MIME type:** Included when downloading from a message (not available when using `--file-id`).

**Two modes:**
1. **From message:** Resolve chat + message, extract file ID from message content, download
2. **From file ID:** Download directly by TDLib internal file ID

#### Edge Cases

- `tg download` (no args, no --file-id) => error: `Missing required argument: <chat>. Or use --file-id <id>`
- `tg download @chat` (no message ID) => error: `Missing required argument: <msgId>`
- `tg download @chat 12345` where message has no media (text-only) => error: `Message has no downloadable media`, code NOT_FOUND
- `tg download --file-id abc` => error: `--file-id must be a number`
- `tg download --file-id 99999` (non-existent file ID) => TDLib error
- `tg download @chat 12345 --output /readonly/path` => `copyFileSync` throws => error
- `tg download @chat 12345 --output /tmp/dir/` (directory, not file) => `copyFileSync` may throw
- Download fails (incomplete) => error: `Failed to download media`
- `tg download @chat 12345 --file-id 789` => both modes specified; `--file-id` is checked first (has the flag), so file-id mode is used; positional args are ignored
- Large file download with `--timeout 2` => may timeout before download completes
- `tg download @chat 12345 --output ./relative` => path resolved to absolute by `path.resolve`

---

### `transcribe`

| Command | Expected behavior |
|---------|-------------------|
| `tg transcribe @chat 12345` | Transcribes voice/video note; returns `{"ok":true,"data":{"text":"transcribed text"}}` |

**Flow:**
1. Get message, check if already transcribed (returns cached result immediately)
2. Verify message is `messageVoiceNote` or `messageVideoNote`
3. Call `recognizeSpeech`
4. Poll every 1 second for up to 30 seconds
5. Return text when `speechRecognitionResultText` received

**Requires Telegram Premium** on the account.

#### Edge Cases

- `tg transcribe @chat 12345` where message is a text message => error: `Message is not a voice or video note`, code INVALID_ARGS
- `tg transcribe @chat 12345` where message is a photo => same error
- `tg transcribe @chat 12345` where message is already transcribed => returns cached text immediately (no re-recognition)
- `tg transcribe @chat 12345` on non-Premium account => TDLib error during `recognizeSpeech`
- `tg transcribe @chat 12345` where recognition fails => error: `Speech recognition failed: <error message>`
- `tg transcribe @chat 12345` where recognition takes >30 seconds => error: `Speech recognition timed out`
- `tg transcribe @chat` (no message ID) => error: requires at least 2 arguments
- `tg transcribe` (no args) => error: requires at least 2 arguments
- `tg transcribe @chat abc` => `Number("abc")` = NaN; TDLib may reject
- `tg transcribe @chat 12345 --timeout 2` => global timeout (2s) may fire before 30s polling completes

---

## 8. Advanced

### `eval`

| Command | Expected behavior |
|---------|-------------------|
| `tg eval "return await client.invoke({_:'getMe'})"` | Executes JS code with connected TDLib client; returns result as JSON |
| `tg eval "success({hello:'world'})"` | Calls success() directly; outputs `{"ok":true,"data":{"hello":"world"}}` |
| `tg eval "const me = await client.invoke({_:'getMe'}); return me.id"` | Returns the user ID |
| `tg eval "fail('oops','INVALID_ARGS')"` | Calls fail() directly; outputs error JSON |

**Available in scope:**
- `client` - TelegramClient instance (can call `client.invoke(...)`)
- `success(data)` - output success JSON
- `fail(msg, code)` - output error JSON
- `strip(obj)` - clean object for serialization
- `fs` - Node.js `fs` module
- `path` - Node.js `path` module

**Return value handling:**
- If the async function returns a non-undefined value, it's passed through `strip()` then `success()`
- If it returns `undefined`, no output (unless `success()` was called manually inside)
- If `strip()` result is non-serializable, error: `eval returned a non-serializable value`

#### Edge Cases

- `tg eval` (no code) => error: requires at least 1 argument
- `tg eval "syntax error }{}"` => JS syntax error at Function construction
- `tg eval "throw new Error('boom')"` => error bubbles up, mapped by `mapErrorCode`
- `tg eval "while(true){}"` => infinite loop; only stopped by `--timeout` or process kill
- `tg eval "process.exit(0)"` => exits the process immediately
- `tg eval "console.log('hi')"` => "hi" goes to stdout (outside JSON protocol); returns undefined, no success output
- Multiple positional args: `tg eval "return" "1+1"` => args are joined with space: `"return 1+1"`; returns 2
- `tg eval "success(1); success(2)"` => two JSON lines written to stdout (violates single-response contract, but technically possible)
- `tg eval "return undefined"` => no output (undefined return)
- `tg eval "return null"` => `strip(null)` returns `null`; `success(null)` outputs `{"ok":true,"data":null}`

---

### `list`

| Command | Expected behavior |
|---------|-------------------|
| `tg list` | Returns JSON array of all commands (except `list` itself) with name, description, usage, options, minArgs |

**Data shape per command:**
```json
{
  "name": "me",
  "description": "Get current user info",
  "usage": "tg me",
  "options": {},
  "minArgs": 0
}
```

- `options` contains the flag definitions (key=flag name, value=description)
- Commands without flags have `options` as `undefined` (omitted by strip) or `{}`
- `list` command itself is excluded from the output
- No daemon connection needed (but currently connects to daemon anyway)

#### Edge Cases

- `tg list --pretty` => pretty-printed JSON array
- `tg list extraarg` => extra args ignored
- `tg list --limit 5` => error: unknown flag `--limit`

---

## 9. Daemon

### `daemon start`

| Command | Expected behavior |
|---------|-------------------|
| `tg daemon start` | If not running: spawns daemon, waits for ready, returns `{"ok":true,"data":{"started":true,"pid":number}}` |
| `tg daemon start` (already running) | Returns `{"ok":true,"data":{"already_running":true,"pid":number}}` |

#### Edge Cases

- Daemon fails to start => error: `Failed to start daemon`
- Port conflict => daemon fails to bind, error
- PID file exists but process is dead => behavior depends on `getDaemonPid` implementation
- `tg daemon start --pretty` => pretty-printed output

---

### `daemon stop`

| Command | Expected behavior |
|---------|-------------------|
| `tg daemon stop` | If running: sends SIGTERM, returns `{"ok":true,"data":{"stopped":true,"pid":number}}` |
| `tg daemon stop` (not running) | Error: `Daemon not running`, code NOT_FOUND, exit 1 |

#### Edge Cases

- Daemon process doesn't respond to SIGTERM => `process.kill` succeeds (signal sent), but daemon may not actually stop
- PID file stale (process already dead) => `process.kill` may throw (ESRCH)

---

### `daemon status`

| Command | Expected behavior |
|---------|-------------------|
| `tg daemon status` (running) | `{"ok":true,"data":{"running":true,"pid":number}}` |
| `tg daemon status` (not running) | `{"ok":true,"data":{"running":false}}` (note: this is a SUCCESS response, not an error) |

#### Edge Cases

- `tg daemon status --pretty` => pretty-printed
- Status is always a success response (even when not running), unlike `stop` which errors

---

### `daemon log`

| Command | Expected behavior |
|---------|-------------------|
| `tg daemon log` | Outputs last 20 lines of daemon log as plain text to stdout |
| `tg daemon log --json` | Outputs `{"ok":true,"data":{"lines":[...]}}` with last 20 lines as array |

#### Edge Cases

- No log file exists => error: `No daemon log file`, code NOT_FOUND
- Log file is empty => outputs empty string or empty last 20 lines
- Log file has fewer than 20 lines => outputs all lines
- `tg daemon log --pretty` => `--pretty` does not affect plain text mode; only affects `--json` mode

---

### Daemon Subcommand Edge Cases

- `tg daemon` (no subcommand) => error: `Usage: bun tg daemon <start|stop|status|log>`, code INVALID_ARGS
- `tg daemon invalid` => same error
- `tg daemon start stop` => only first arg used; "start" subcommand runs, "stop" ignored
- Daemon subcommands exit via `process.exit(0)` after handling; they do NOT go through the main command pipeline

---

## 10. Flood Wait / Rate Limiting

The CLI has built-in flood wait handling for all commands:

| Scenario | Expected behavior |
|----------|-------------------|
| TDLib returns 429 with retry_after <= 30s | Stderr warning: `Rate limited. Waiting Ns before retry...`; waits N seconds then retries the command once |
| TDLib returns 429 with retry_after > 30s | Error: `Rate limited. Retry after Ns`, code FLOOD_WAIT, exit 1 |
| TDLib returns 429 without parseable retry time | Defaults to 5s wait, then retries |
| Retry after wait also gets 429 | Not handled; the error from the second attempt is returned as-is |

---

## 11. Error Code Mapping

The CLI maps TDLib/Telegram error messages to structured error codes:

| Pattern | Mapped code |
|---------|-------------|
| `404` in message | NOT_FOUND |
| `401` in message | UNAUTHORIZED |
| `429` in message | FLOOD_WAIT |
| MESSAGE_ID_INVALID, PEER_ID_INVALID, USERNAME_NOT_OCCUPIED, USERNAME_INVALID, CHANNEL_INVALID | NOT_FOUND |
| "No user has", "Chat not found", "User not found", "Message not found" | NOT_FOUND |
| MESSAGE_TOO_LONG, MESSAGE_EMPTY, MEDIA_INVALID, SCHEDULE_DATE_INVALID, ENTITY_BOUNDS_INVALID | INVALID_ARGS |
| AUTH_KEY_UNREGISTERED, SESSION_REVOKED, "Session expired" | SESSION_EXPIRED |
| FORBIDDEN, ADMIN_REQUIRED, WRITE_FORBIDDEN, USER_BANNED | UNAUTHORIZED |
| FLOOD_WAIT, FLOOD_PREMIUM_WAIT, "Too Many Requests" | FLOOD_WAIT |
| "timed out", TIMEOUT | TIMEOUT |
| Anything else | UNKNOWN |

---

## 12. JSON Serialization

The `strip()` function processes all output data:

| Input type | Output |
|------------|--------|
| BigInt | Converted to string |
| Buffer / Uint8Array | Removed (undefined) |
| Object keys starting with `_` | Removed (internal TDLib fields) |
| Nested depth > 12 | Truncated (undefined) |
| Empty arrays at depth 0 | Preserved as `[]` |
| Empty arrays at depth > 0 | Removed (undefined) |
| Empty objects | Removed (undefined) |
| `undefined` | Removed from output |
| `null` | Preserved as `null` |

---

## 13. Argument Parsing

### Flag parsing rules

| Input | Parsed as |
|-------|-----------|
| `--flag value` | `flags["--flag"] = "value"` |
| `--flag=value` | `flags["--flag"] = "value"` |
| `--bool-flag` (in BOOLEAN_FLAGS set) | `flags["--bool-flag"] = "true"` |
| `--flag` (not boolean, no next arg) | `flags["--flag"] = "true"` |
| `--flag --other` (not boolean, next is flag) | `flags["--flag"] = "true"` |
| `-- --not-a-flag` | `--not-a-flag` is a positional arg (after `--` separator) |
| `--help` | `flags["--help"] = "true"` (special case) |

**Boolean flags:** `--archived`, `--silent`, `--no-preview`, `--revoke`, `--reverse`, `--all`, `--md`, `--html`, `--big`, `--pretty`, `--stdin`, `--remove`, `--incoming`, `--download-media`, `--full`, `--unread`

### Edge Cases

- `--limit` without a value followed by another flag: `tg messages @chat --limit --reverse` => `--limit` gets value "true" (next token starts with `--` and `--limit` is not boolean); then `parseLimit` fails because "true" is not a valid integer
- Actually, let me re-examine: `--limit` is NOT in BOOLEAN_FLAGS, and `--reverse` starts with `--`, so the condition `BOOLEAN_FLAGS.has(arg) || i + 1 >= raw.length || next?.startsWith('--')` means `--limit` IS treated as boolean when next arg is a flag. So `flags["--limit"] = "true"`, and `parseLimit` fails with "must be a positive integer"
- `--flag=` (equals with empty value): `flags["--flag"] = ""`
- `-- value` => `value` is positional, not a flag value
- No `--` separator, value that looks like a flag: `tg send @chat "--not-text"` => `"--not-text"` is parsed as a flag
- To pass text starting with `--`: use `tg send @chat -- "--actual-text"` (the `--` separator makes it positional)

---

## 14. Daemon Auto-Start

For all commands (except `daemon` subcommands, `help`, and `version`):

| Scenario | Expected behavior |
|----------|-------------------|
| Daemon running | Connect to existing daemon, execute command |
| Daemon not running | Auto-start daemon via `ensureDaemon()`, wait for ready, then execute command |
| Daemon fails to start | Error before command execution |
| Daemon starts but is not authenticated | Command runs but TDLib calls fail with auth-related errors |

---

## 15. Cross-Cutting Edge Cases

### Combination of global flags with all commands

| Combination | Expected behavior |
|-------------|-------------------|
| Any command + `--pretty` + `--timeout 5` | Pretty-printed output if completes in 5s; pretty-printed timeout error if not |
| `tg send @user "hi" --pretty --silent --md` | All flags coexist; pretty output, silent send, markdown parse |
| `tg messages @chat --pretty --limit 5 --reverse --download-media` | All flags coexist |

### Process exit behavior

| Scenario | Exit code |
|----------|-----------|
| Successful command | 0 |
| `fail()` called | 1 |
| Unknown command | 1 |
| Missing required args | 1 |
| Unknown flags | 1 |
| TDLib error (any) | 1 |
| `--help` | 0 |
| `listen` + Ctrl+C | 0 (normal signal exit) |
| `--timeout` exceeded | 1 |

### Concurrent/sequential behavior

- CLI is single-command, single-process. No concurrent command execution
- Each invocation auto-starts daemon if needed, connects, runs command, disconnects
- Client is closed in `finally` block after command execution
- Streaming commands (`listen`) keep the client open indefinitely

### stdin/file interaction with all write commands

| Command | --stdin supported | --file supported |
|---------|-------------------|------------------|
| `send` | Yes | Yes |
| `edit` | Yes | Yes |
| Others | No (flags not in their flag list => unknown flag error) | No |

### Large output handling

- No explicit size limits on JSON output
- Large arrays (many messages, many contacts) are serialized in full
- `strip()` depth limit of 12 prevents infinite recursion but may truncate deeply nested objects
- BigInt values are converted to strings to prevent `JSON.stringify` from throwing

---

## 16. Pagination Patterns Summary

| Command | Pagination flag | nextOffset type | Default limit |
|---------|----------------|-----------------|---------------|
| `contacts` | `--offset N` | number (index) | 100 |
| `contacts search` | (none) | (none) | 50 |
| `dialogs` | `--offset-date N` | number (unix timestamp) | 40 |
| `unread` | (none) | (none, hasMore only) | 50 |
| `messages` | `--offset-id N` | number (message ID) | 20 |
| `messages` (reversed) | `--offset-id N` | number (first message ID) | 20 |
| `search` (per-chat) | `--offset-id N` | number (message ID) | 20 |
| `search` (global) | `--offset "cursor"` | string (opaque cursor) | 20 |
| `members` | `--offset N` | number (index) | 100 |

---

## 17. --limit Validation (Universal)

The `parseLimit` function is used by: `contacts`, `dialogs`, `unread`, `messages`, `search`, `members`.

| Input | Expected behavior |
|-------|-------------------|
| `--limit 10` | Valid: returns 10 |
| `--limit 1` | Valid: returns 1 (minimum) |
| `--limit 0` | Error: `--limit must be a positive integer` |
| `--limit -1` | Error: `--limit must be a positive integer` |
| `--limit 1.5` | Error: `--limit must be a positive integer` (not integer) |
| `--limit abc` | Error: `--limit must be a positive integer` (NaN) |
| `--limit Infinity` | Error: `--limit must be a positive integer` (not finite) |
| `--limit NaN` | Error: `--limit must be a positive integer` |
| `--limit 999999` | Valid: accepted, but internal scan limits (500) may cap actual results |
| (no --limit) | Uses command-specific default |

---

## 18. Version

| Command | Expected behavior |
|---------|-------------------|
| `tg version` | Prints `tg <version>` to stderr, exit 0 |
| `tg --version` | Same as `tg version` |

Note: version output goes to stderr (not stdout), so it does not interfere with JSON output piping.

---

## 19. Slim Output Fields Reference

### User (from `me`, `resolve`, `chat`, `contacts`)

```
id              number
first_name      string
last_name       string | absent
username        string | null
phone_number    string
type            "regular" | "bot" | "deleted" | "unknown"
is_contact      boolean
is_verified     boolean
is_premium      boolean
is_scam         boolean
is_fake         boolean
```

### Chat (from `dialogs`, `unread`, `chat`, `resolve`)

```
id                          number
type                        "user" | "group" | "channel"
title                       string
unread_count                number
last_read_inbox_message_id  number
unread_mention_count        number | absent (0 omitted)
last_message                {id, date, text?} | absent
```

### Message (from `message`, `messages`, `search`, `send`, `edit`, `forward`, `listen`)

```
id                    number
sender_type           "user" | "chat"
sender_id             number
sender_name           string | absent
chat_id               number
is_outgoing           boolean
date                  number (unix timestamp)
edit_date             number | absent
reply_to_message_id   number | absent
reply_in_chat_id      number | absent
forward_info          object | absent
media_album_id        string | absent
content               object (varies by type)
```

### Member (from `members`)

```
user_id        number
sender_type    "user" | "chat"
joined_date    number | absent
status         "creator" | "admin" | "member" | "restricted" | "banned" | "left"
custom_title   string | absent
```

### File (nested in message content)

```
id           number
size         number
downloaded   boolean
local_path   string | absent
```
