# Simplified JSON Output

Replace the current verbose JSON with a flat, agent-friendly format. This becomes the default output for `messages`, `message`, `dialogs`, and `search` commands.

## Principles

1. **One key per concept** — `name` not `sender_type` + `sender_id` + `sender_name`
2. **Content type is implicit** — presence of `photo`/`video`/`voice` key tells you the type. `content` field names it explicitly for non-text messages only.
3. **`text` is always the human-readable string** — message text, caption, or transcript. Omitted when absent.
4. **Media paths are strings** — downloaded = full path, not downloaded = `true` (agent uses `tg download` if needed). No dimensions, no file IDs, no sizes.
5. **Albums are pre-grouped** — `ids` array + `photos` array instead of N separate messages with `media_album_id`.
6. **Dates are `HH:MM`** — agent reads clocks, doesn't do unix math.
7. **Outgoing = `"You"`** — no `is_outgoing` boolean.

## Message Shapes

### Common fields (always present)

```
id      number    message ID (or `ids: number[]` for albums)
date    string    "HH:MM"
name    string    sender name, "You" if outgoing
```

### Optional fields (present when applicable)

```
re       number    reply-to message ID
fwd      string    forwarded from (name)
edited   true      message was edited
text     string    message text or caption
content  string    media type tag (absent for pure text messages)
buttons  string[][]  inline keyboard rows
```

### Text

```json
{"id": 0, "date": "HH:MM", "name": "", "text": ""}
```

With reply:
```json
{"id": 0, "date": "HH:MM", "name": "", "re": 0, "text": ""}
```

Forwarded:
```json
{"id": 0, "date": "HH:MM", "name": "", "fwd": "", "text": ""}
```

Edited:
```json
{"id": 0, "date": "HH:MM", "name": "", "edited": true, "text": ""}
```

### Photo

Downloaded:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "photo", "photo": "/path/to/file.jpg"}
```

Not downloaded:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "photo", "photo": true}
```

With caption:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "photo", "photo": "/path/to/file.jpg", "text": "caption"}
```

### Photo album

```json
{"ids": [0, 0, 0], "date": "HH:MM", "name": "", "content": "photo", "photos": ["/path1.jpg", "/path2.jpg", "/path3.jpg"]}
```

With caption:
```json
{"ids": [0, 0, 0], "date": "HH:MM", "name": "", "content": "photo", "photos": ["/p1.jpg", "/p2.jpg"], "text": "caption"}
```

### Video

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "video", "video": "/path/to/file.mp4", "duration": "10:37"}
```

Not downloaded:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "video", "video": true, "duration": "10:37"}
```

### Document

Downloaded:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "doc", "doc": "/path/to/report.pdf"}
```

Not downloaded (filename only):
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "doc", "doc": "report.pdf"}
```

### Voice note

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "voice", "duration": "0:45"}
```

Downloaded:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "voice", "voice": "/path/to/voice.ogg", "duration": "0:45"}
```

With transcript:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "voice", "duration": "0:45", "transcript": "spoken words"}
```

### Video note

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "videonote", "duration": "0:12"}
```

With transcript:
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "videonote", "duration": "0:12", "transcript": "spoken words"}
```

### Audio

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "audio", "audio": "Bohemian Rhapsody — Queen", "duration": "5:54"}
```

No metadata (fallback to filename):
```json
{"id": 0, "date": "HH:MM", "name": "", "content": "audio", "audio": "recording.mp3", "duration": "2:00"}
```

### Sticker

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "sticker", "sticker": "👍"}
```

### GIF

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "gif", "gif": "/path/to/anim.mp4", "duration": "0:03"}
```

### Location

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "location", "location": "37.7749, -122.4194"}
```

### Contact

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "contact", "contact": "Bob Johnson, +19876543210"}
```

### Poll

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "poll", "poll": "Which framework?", "options": ["React: 142 (58%)", "Vue: 63 (26%)", "Svelte: 39 (16%)"]}
```

### Call

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "call", "duration": "3:03"}
{"id": 0, "date": "HH:MM", "name": "", "content": "videocall", "duration": "10:00"}
{"id": 0, "date": "HH:MM", "name": "", "content": "call", "duration": "0:00"}
```

### Service messages

```json
{"id": 0, "date": "HH:MM", "name": "", "content": "pin", "pinned": 12345}
{"id": 0, "date": "HH:MM", "name": "", "content": "join"}
{"id": 0, "date": "HH:MM", "name": "", "content": "title", "text": "New Group Name"}
```

### Inline buttons

Can appear on any message type. Each button is `{"id": N, "text": "label"}` or `{"text": "label", "url": "https://..."}` for link buttons. The `id` is the button index (row * cols + col) used by `tg click`.

```json
{"id": 0, "date": "HH:MM", "name": "", "text": "Choose:", "buttons": [[{"id": 0, "text": "Option A"}, {"id": 1, "text": "Option B"}], [{"text": "Visit", "url": "https://example.com"}]]}
```

## Wrapper

```json
{"ok": true, "data": [...], "hasMore": true, "nextOffset": 12345}
```

## What's dropped vs current JSON

| Current field | Simplified | Reason |
|---------------|------------|--------|
| `sender_type` | gone | implicit from context |
| `sender_id` | gone | `name` is enough; `tg resolve` if ID needed |
| `chat_id` | gone | already known from command arg |
| `is_outgoing` | gone | `name: "You"` |
| `content.type` | `content` | flat string, absent for text |
| `content.text` / `content.caption` | `text` | unified |
| `content.photo.width/height` | gone | agent doesn't reason about dimensions |
| `content.photo.file.id` | gone | internal TDLib ref |
| `content.photo.file.size` | gone | not actionable |
| `content.photo.file.downloaded` | gone | implicit: string path = downloaded, `true` = not |
| `forward_info.origin.*` | `fwd` | just the name |
| `forward_info.date` | gone | when it was originally sent rarely matters |
| `forward_info.public_service_announcement_type` | gone | noise |
| `forward_sender_name` | `fwd` | same thing, shorter |
| `media_album_id` | gone | albums pre-grouped into `ids`/`photos` |
| `edit_date` | `edited: true` | boolean enough |
| `reply_to_message_id` | `re` | shorter |
| `reply_in_chat_id` | `re_chat` | only when cross-chat reply |
| `reply_markup` | `buttons` | flat string arrays |
| `date` (unix) | `date` (HH:MM) | human readable |
| `mime_type` | gone | inferable from extension |

## Implementation

The simplified format replaces `slimMessage` + `slimContent` + `strip()` pipeline. New function `flattenMessage()` in a new file (or replaces slim logic) does the full TDLib → flat JSON conversion in one pass.

Album grouping happens at the output level: after flattening individual messages, consecutive messages with the same `media_album_id` are merged into a single entry with `ids` and `photos`/`videos` arrays.

Name resolution (`addSenderNames` + forward names) happens before flattening so `name` and `fwd` are already strings.

`--text` formatter becomes trivial — just string-renders these flat objects instead of doing its own parallel simplification.
