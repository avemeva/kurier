# TDLib Search Functions

Verified against TDLib C++ source at `../td/` — all facts, no assumptions.

## Entity Search (find chats/people/channels)

| Function | Network? | What it searches | Matching | Order | CLI usage |
|---|---|---|---|---|---|
| `searchChats` | **No** (offline) | Your chat list — users: first+last+usernames, channels: title+usernames, groups: title only | Word prefix + transliteration, multi-word = AND | Pinned first, then last message date | `find` |
| `searchChatsOnServer` | **Yes** (`contacts.search`) | Same scope as `searchChats` but server-backed — catches chats not synced to local cache. Returns `my_results` part | Server-side | Chat list order | — |
| `searchPublicChats` | **Yes** (`contacts.search`) | Public bots/channels/groups NOT in your list. Returns `results` part. Min 4 chars | Server-side, username+title | Server relevance | `find` |
| `searchPublicChat` | **Yes** (`contacts.resolveUsername`) | Single entity by **exact** username | Exact match | N/A (single result) | — |
| `searchContacts` | **No** (offline) | Phonebook contacts — first+last+usernames. **Includes contacts you've never chatted with** | Word prefix + transliteration | By rating (default: user ID) | `find` |
| `searchRecentlyFoundChats` | **No** (offline) | Up to 50 chats explicitly added via `addRecentlyFoundChat`. **Not auto-populated** — client must call add manually | Word prefix + transliteration | Insertion order (newest first) | — |

**Key insight**: `searchChatsOnServer` and `searchPublicChats` both call the same MTProto method (`contacts.search`) — they just return different halves of the response: `my_results` vs `results`.

## Message Search

| Function | Network? | What it searches | Matching | Order | CLI usage |
|---|---|---|---|---|---|
| `searchChatMessages` | **Yes** (`messages.search`) | Messages in a single chat. Text + captions. Supports `from_id` and media `filter` | Server-side | Newest first (descending msg ID) | `search --chat` |
| `searchMessages` | **Yes** (`messages.searchGlobal`) | Messages across all chats. Supports chat type filter (private/group/channel), date range, media filter | Server-side | Newest first, server `next_rate` for relevance | `search` |

## Utility Search

| Function | Network? | What it searches | Matching | CLI usage |
|---|---|---|---|---|
| `searchChatMembers` | Mixed — local for basic groups, **network** (`channels.getParticipants`) for supergroups | Members of a specific chat | Word prefix + transliteration | — (`getSupergroupMembers` used instead) |
| `searchHashtags` | **No** (offline) | Previously used hashtags stored in local DB | Prefix | — |
| `searchUserByPhoneNumber` | Conditional — cache first, then **network** (`contacts.resolvePhone`) | Single user by exact phone number | Exact match | — |

## How tdesktop Uses These

tdesktop's main search bar fires when you type (900ms debounce):

1. **Local instant**: `searchChats` + `searchRecentlyFoundChats` + `searchContacts` → "Chats and Contacts" section
2. **Network**: `searchPublicChats` + `searchChatsOnServer` → "Global Search" section
3. **Network**: `messages.searchGlobal` → "Messages" section

All in parallel, results stream in as they arrive.

## Matching Details

### `searchChats` / `searchContacts` / `searchRecentlyFoundChats`

All use TDLib's `Hints` engine (`tdutils/td/utils/Hints.cpp`):

- Text tokenized into words, normalized (lowercase, diacritics removed)
- Each query word must **prefix-match** a word in the indexed text
- Multi-word queries = AND (all words must match)
- Cyrillic-to-Latin transliteration supported
- Example: "john do" matches "John Doe" (both are prefixes)

### `searchChats` indexed text per entity type

- **Users**: `first_name + " " + last_name + " " + active_usernames`
- **Channels/Supergroups**: `title + " " + active_usernames`
- **Basic groups**: `title` only

### `searchChats` result order

Order is by "dialog base order":
1. Pinned chats (custom pin order)
2. Regular chats by `(message_date << 32) | message_id` — effectively last message date, with message ID as tiebreaker

## Full Info Functions (for bio/description)

Not search functions, but needed for richer `find` results:

| Function | Network? | Returns | Key fields |
|---|---|---|---|
| `getUserFullInfo` | **No** (local DB) | `userFullInfo` | `bio` (formattedText), `personal_chat_id`, `bot_info.short_description`, `bot_info.description` |
| `getSupergroupFullInfo` | **No** (local DB, may trigger background refresh) | `supergroupFullInfo` | `description` (string), `member_count`, `linked_chat_id` |
| `getBasicGroupFullInfo` | **No** (local DB) | `basicGroupFullInfo` | `description` (string), `creator_user_id`, `members` |
