# Markdown Output for AI Agents

`--markdown` flag on `dialogs`, `messages`, and `search` commands. Everything else stays JSON.

## Why Only These Three?

These are the **high-volume reads** — the commands where an AI agent spends most of its context window. Action commands (`send`, `edit`, `delete`) return small confirmations. Entity commands (`me`, `resolve`, `chat`) return single objects. The token budget bleeds out in message lists and chat lists.

## Token Budget

| Command | 10 items JSON | 10 items Markdown | Savings |
|---------|--------------|-------------------|---------|
| `dialogs` | ~1500 tokens | ~400 tokens | ~73% |
| `messages` | ~2800 tokens | ~450 tokens | ~84% |
| `search` | ~3500 tokens | ~550 tokens | ~84% |

## Architecture

```
apps/cli/src/
  markdown.ts        ← NEW: formatDialogs(), formatMessages(), formatSearch()
  commands.ts        ← CHANGE: 3 commands get --markdown check (~3 lines each)
  output.ts          ← CHANGE: add stdout() for raw text output
  parse.ts           ← CHANGE: register --markdown global flag
```

No changes to `slim.ts`, `resolve.ts`, `daemon.ts`, `index.ts`.

## Output Format: `dialogs`

```
tg dialogs --markdown --limit 5
```

```markdown
| # | Chat | Type | Unread | Last |
|---|------|------|--------|------|
| 1 | Work Group (#chat:-1001234) | group | 5 | "meeting at 3pm" (14:32) |
| 2 | @johndoe (#chat:456) | user | 0 | "thanks!" (11:20) |
| 3 | News Channel (#chat:-1005678) | channel | 12 | "Breaking: ..." (10:05) |

hasMore | nextOffset: 1709481600
```

### Fields kept

| Field | Format | Why |
|-------|--------|-----|
| title | `Work Group` | Identity |
| chat id | `(#chat:-1001234)` | Actionable — AI passes to other commands |
| type | `group` | Routing decisions (different commands for groups vs users) |
| unread_count | `5` | Prioritization |
| last_message.text | `"meeting at 3pm"` | Preview, truncated to 100 chars |
| last_message.date | `(14:32)` | Recency signal |

### Fields dropped

| Field | Why dropped |
|-------|-------------|
| last_read_inbox_message_id | Internal bookkeeping, AI doesn't act on it |
| unread_mention_count | Rarely non-zero, not actionable differently from unread_count |
| last_message.id | Not needed in dialog list context |

## Output Format: `messages`

```
tg messages @johndoe --markdown --limit 5
```

```markdown
[14:00] **Alice** (#msg:100):
Has anyone seen the report?

[14:01] **Bob** (#msg:101) ↩ #msg:100 ↪ fwd from "Carol":
[document: Q4_Report.pdf, 2MB]
Here it is

[14:02] **Alice** (#msg:102):
[voice 0:05] "Thanks Bob, I'll review it today and get back to you"

[14:03] **You** (#msg:103):
👍

[14:04] **Bob** (#msg:104):
[photo 1920×1080 → /tmp/chart.jpg]
Screenshot of the key chart

hasMore | nextOffset: 100
```

### Message Envelope

```
[HH:MM] **SenderName** (#msg:ID) [modifiers]:
content
```

Modifiers — only when present, space-separated after the msg ref:

| Modifier | When | Format |
|----------|------|--------|
| outgoing | `is_outgoing === true` | sender name becomes `**You**` |
| edited | `edit_date` exists | `(edited)` |
| reply | `reply_to_message_id` exists | `↩ #msg:N` |
| cross-chat reply | `reply_in_chat_id` also exists | `↩ #msg:N in #chat:X` |
| forward from user | `forward_info.origin.sender_user_id` | `↪ fwd from user #ID` |
| forward hidden | `forward_info.origin.sender_name` | `↪ fwd from "Name"` |
| forward channel | `forward_info.origin.chat_id` | `↪ fwd from #chat:ID #msg:N` |
| forward group | `forward_info.origin.sender_chat_id` | `↪ fwd from #chat:ID` |

### Content Types

**messageText** — raw text (already markdown from `unparse()`):
```
Hello **world** and [a link](https://example.com)
```

**messagePhoto**:
```
[photo 1280×720]                          ← not downloaded, no caption
[photo 1280×720 → /path/to/photo.jpg]    ← downloaded
[photo 1280×720]                          ← with caption:
Sunset in Bali                               caption on next line
```

**messageVideo**:
```
[video: demo.mp4, 2:07, 50MB]
Demo recording
```
Fields: file_name, duration (formatted), size (formatted). Dimensions dropped — not useful for AI reasoning.

**messageDocument**:
```
[document: Q4_Report.pdf, 1MB]
Please review by Friday
```
Downloaded: `[document: Q4_Report.pdf → /path/to/file]`

**messageAudio**:
```
[audio: "Bohemian Rhapsody" by Queen, 5:54]    ← has title+performer
[audio: recording.mp3, 2:00]                    ← no metadata, fall back to file_name
```

**messageAnimation** (GIF):
```
[gif: celebration.mp4, 0:03]
When the build passes
```

**messageVoiceNote**:
```
[voice 0:45]                                           ← no transcript
[voice 0:45] "Hey, checking if you're free at 3pm"    ← with transcript
[voice 0:05 → /path/to/voice.ogg] "transcript"        ← downloaded
```
Caption (rare) goes on next line below transcript.

**messageVideoNote**:
```
[video note 0:12]                          ← no transcript
[video note 0:12] "See you tomorrow"       ← with transcript
```
No caption field exists on video notes.

**messageSticker**: Just the emoji.
```
👍
```

**messageLocation**:
```
[location: 37.7749, -122.4194]
```

**messageContact**:
```
[contact: Bob Johnson, +19876543210, #user:444333]    ← TG user
[contact: Bob Johnson, +19876543210]                   ← not on TG
```

**messagePoll**:
```
[poll: "Which framework?" (244 votes)]
- React: 142 (58%)
- Vue: 63 (26%)
- Svelte: 39 (16%)
```
Closed: `[poll closed: "Which framework?" (244 votes)]`

**messageCall**:
```
[call 3:03]              ← voice call
[video call 10:00]       ← video call
[missed call]            ← duration=0
[missed video call]      ← video + duration=0
```

**Service messages** (fallback): `[type_name]` — just the TDLib type. Examples:
```
[pinned #msg:12345]
[joined the group]
[messageChatChangeTitle: "New Name"]
```

### Reply Markup (inline buttons)

Rendered below content, one row per line:
```
[Option A] [Option B]
[Visit ↗](https://example.com)
```

Button types:
- `callback`: `[Text]` — AI uses `tg click` with button text
- `url` / `web_app` / `login_url`: `[Text ↗](url)` — show the URL
- Everything else: `[Text]`

### What's Dropped from Messages

| Field | Why |
|-------|-----|
| sender_id | Redundant with sender_name; `resolve` if needed |
| sender_type | Inferable from context |
| chat_id | Already known from command arg |
| media_album_id | Grouping has no actionable value |
| file.id | Internal TDLib ref, useless for AI |
| file.downloaded (boolean) | Presence of path → downloaded; absence → not |
| file.size on downloaded files | Already got the file, size doesn't matter |
| mime_type | Inferable from file extension, rarely actionable |
| width/height on video/animation | Not useful for AI reasoning |
| location.horizontal_accuracy | Noise |
| contact.vcard | Almost always empty |
| poll.options[].is_being_chosen | UI state |
| poll.options[].is_chosen | UI state |
| poll.is_anonymous | Rarely relevant |
| call.discard_reason | Already stripped to nothing by strip() |

## Output Format: `search`

```
tg search "meeting" --markdown --limit 10
```

Global search (no --chat) groups results by chat:

```markdown
### Work Group (#chat:-1001234)

[14:00 Jan 15] **Alice** (#msg:100):
Let's schedule a **meeting** for tomorrow

[09:30 Feb 02] **Bob** (#msg:890):
**Meeting** notes attached
[document: notes.pdf, 340KB]

### Project Chat (#chat:-1005678)

[16:45 Jan 20] **Carol** (#msg:200):
Skip the **meeting**, I'll send a summary

hasMore | nextOffset: eyJsYXN0...
```

Per-chat search (`--chat`) — same as messages format (no grouping needed):

```markdown
[14:00 Jan 15] **Alice** (#msg:100):
Let's schedule a **meeting** for tomorrow

[09:30 Feb 02] **Bob** (#msg:890):
**Meeting** notes attached

hasMore | nextOffset: 890
```

### Search-specific differences from `messages`

| Difference | Why |
|------------|-----|
| Date includes month+day, not just time | Results span long periods |
| `chat_title` as section headers | Global search spans multiple chats |
| Truncated text (500 chars max) stays truncated | Already truncated by search command |
| `--context N` messages rendered inline, indented | Thread context around match |

### Context messages (--context N)

```markdown
[14:00 Jan 15] **Alice** (#msg:100):
Let's schedule a **meeting** for tomorrow
  > [13:58] **Bob** (#msg:99): What should we do about the deadline?
  > [14:02] **Alice** (#msg:101): How about 3pm?
```

Context messages are indented with `>` prefix, showing the surrounding conversation.

## Implementation Steps

### Step 1: Parse flag

In `parse.ts`, add `--markdown` to global flags. Just a boolean.

### Step 2: Raw stdout

In `output.ts`, add:
```ts
export function stdout(text: string): void {
  process.stdout.write(text + '\n')
}
```

### Step 3: Create `markdown.ts`

Exports:
```ts
formatDialogs(chats: SlimChat[]): string
formatMessages(messages: SlimMessage[], opts?: { hasMore?: boolean, nextOffset?: number | string }): string
formatSearch(results: SearchResult[], opts?: { query: string, hasMore?: boolean, nextOffset?: number | string }): string
```

Internal helpers (not exported, live in same file):
```ts
formatMessage(msg: SlimMessage): string
formatContent(content: SlimContent): string
formatForwardInfo(info: ForwardInfo): string
formatReplyMarkup(markup: SlimReplyMarkup): string
formatDate(unix: number, includeDay?: boolean): string
formatDuration(seconds: number): string
formatSize(bytes: number): string
```

### Step 4: Wire up commands

In `commands.ts`, three commands get the check:

```ts
// dialogs handler
if (flags.markdown) {
  return stdout(formatDialogs(chats, { hasMore, nextOffset }))
}

// messages handler
if (flags.markdown) {
  return stdout(formatMessages(messages, { hasMore, nextOffset }))
}

// search handler
if (flags.markdown) {
  return stdout(formatSearch(results, { query, hasMore, nextOffset }))
}
```

### Step 5: Test

Run each command with `--markdown` against real chats. Compare token counts with `--pretty` JSON output.

## Design Decisions

1. **Single file, not two** — `markdown-utils.ts` is unnecessary. Helpers are small and only used by `markdown.ts`. One file keeps it simple.

2. **No `--markdown` on action commands** — `send`, `edit`, `delete` etc. return tiny JSON. Token savings would be negligible. Adding markdown there adds complexity without payoff.

3. **`#msg:ID` / `#chat:ID` / `#user:ID` ref syntax** — Consistent prefix lets AI grep for refs. The `#` prefix is unlikely to collide with message text. AI can extract and pass to other commands.

4. **Time format `[HH:MM]` for messages, `[HH:MM Mon DD]` for search** — Messages are typically within a day. Search spans months. Adapt precision to context.

5. **Caption always on next line** — Never inline with the media tag. Consistent pattern = fewer parsing errors by AI.

6. **Transcript in double quotes** — Distinguishes spoken content from captions and regular text. `[voice 0:45] "spoken words"` vs `[voice 0:45]\ncaption text`.

7. **`**You**` for outgoing** — Clearer than appending `(you)` to sender name. AI immediately knows which side of the conversation.

8. **No JSON wrapping for errors either** — When `--markdown` is set and the command fails, still use `fail()` (JSON). AI tool integrations typically check exit code + parse error JSON separately from success output. Mixing formats for errors is fine.

9. **`hasMore | nextOffset: X` footer** — AI needs this to paginate. Plain text, not markdown syntax. Absent when `hasMore` is false.
