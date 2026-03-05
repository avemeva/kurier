# CLI Entity-Based Restructure

## Context

Redesign tg CLI from flat command list to entity-based subcommand structure. Two top-level entities: `chats` and `msg`. Everything else stays top-level.

## Tree

```
tg
│
├── me
│
├── chats                                       # === CHAT ENTITY ===
│   │
│   ├── (default: list)                         # tg chats
│   │   ├── --limit N                           #   (default: 40)
│   │   ├── --archived                          #   include archived
│   │   ├── --unread                            #   only unread
│   │   ├── --type user|bot|group|channel
│   │   └── --offset-date N                     #   pagination cursor
│   │
│   ├── find <query>                            # tg chats find "boris"
│   │   ├── --type chat|bot|group|channel
│   │   ├── --limit N                           #   (default: 50)
│   │   ├── --archived                          #   only archived
│   │   └── --global                            #   include public search
│   │
│   ├── info <entity>                           # tg chats info @user
│   │
│   ├── members <chat>                          # tg chats members @group
│   │   ├── --limit N                           #   (default: 100)
│   │   ├── --search text
│   │   ├── --offset N
│   │   └── --type bot|admin|recent
│   │
│   └── read <chat>                             # tg chats read @user
│
├── msg                                         # === MESSAGE ENTITY ===
│   │
│   ├── (default: list) <chat>                  # tg msg @user
│   │   ├── --limit N                           #   (default: 20)
│   │   ├── --offset-id N
│   │   ├── --from <user>
│   │   ├── --search text
│   │   ├── --filter photo|video|doc|url|voice|gif|music
│   │   ├── --since N
│   │   ├── --min-id N
│   │   ├── --max-id N
│   │   ├── --reverse
│   │   ├── --download-media
│   │   └── --transcribe
│   │
│   ├── get <chat> <id>                         # tg msg get @user 123
│   │
│   ├── search <query>                          # tg msg search "keyword"
│   │   ├── --chat <id>
│   │   ├── --limit N
│   │   ├── --from <user>                       #   (requires --chat)
│   │   ├── --since N
│   │   ├── --until N                           #   (cross-chat only)
│   │   ├── --type private|group|channel        #   (cross-chat only)
│   │   ├── --filter photo|video|doc|url|voice|gif|music|media|videonote|mention|pinned
│   │   ├── --context N
│   │   ├── --offset "cursor"
│   │   ├── --full
│   │   └── --archived
│   │
│   ├── send <chat> <text>                      # tg msg send @user "hi"
│   │   ├── --reply-to N
│   │   ├── --md
│   │   ├── --html
│   │   ├── --silent
│   │   ├── --no-preview
│   │   ├── --stdin
│   │   └── --file path
│   │
│   ├── edit <chat> <id> <text>                 # tg msg edit @user 123 "fixed"
│   │   ├── --md
│   │   ├── --html
│   │   ├── --stdin
│   │   └── --file path
│   │
│   ├── delete <chat> <ids...>                  # tg msg delete @user 123 456
│   │   └── --revoke
│   │
│   ├── forward <from> <to> <ids...>            # tg msg forward @a @b 123
│   │   └── --silent
│   │
│   ├── pin <chat> <id>                         # tg msg pin @group 123
│   │   └── --silent
│   │
│   ├── unpin <chat> [id]                       # tg msg unpin @group 123
│   │   └── --all
│   │
│   ├── react <chat> <id> <emoji>               # tg msg react @user 123 👍
│   │   ├── --remove
│   │   └── --big
│   │
│   ├── click <chat> <id> <button>              # tg msg click @bot 123 "OK"
│   │
│   ├── download <chat> <id>                    # tg msg download @user 123
│   │   ├── --output path
│   │   └── --file-id N
│   │
│   └── transcribe <chat> <id>                  # tg msg transcribe @user 123
│
├── listen                                      # === REAL-TIME ===
│   ├── --chat <ids>
│   ├── --type user|bot|group|channel
│   ├── --exclude-chat <ids>
│   ├── --exclude-type <type>
│   ├── --event new_message|edit_message|...
│   ├── --incoming
│   └── --download-media
│
├── eval <code>                                 # === ESCAPE HATCH ===
│   └── --file path
│
├── auth                                        # === AUTH ===
│   ├── (default: status)
│   ├── phone <number>
│   ├── code <code>
│   ├── password <pw>
│   └── logout
│
└── daemon                                      # === DAEMON ===
    ├── start
    ├── stop
    ├── status
    └── log
```

## Migration from old commands

| Old | New |
|-----|-----|
| `tg dialogs` | `tg chats` |
| `tg unread` | `tg chats --unread` |
| `tg find "q"` | `tg chats find "q"` |
| `tg chat @user` | `tg chats info @user` |
| `tg resolve @user` | `tg chats info @user` |
| `tg members @group` | `tg chats members @group` |
| `tg read @user` | `tg chats read @user` |
| `tg messages @user` | `tg msg @user` |
| `tg message @user 123` | `tg msg get @user 123` |
| `tg search "q"` | `tg msg search "q"` |
| `tg send @user "hi"` | `tg msg send @user "hi"` |
| `tg edit @user 123 "x"` | `tg msg edit @user 123 "x"` |
| `tg delete @user 123` | `tg msg delete @user 123` |
| `tg forward @a @b 123` | `tg msg forward @a @b 123` |
| `tg pin @g 123` | `tg msg pin @g 123` |
| `tg unpin @g 123` | `tg msg unpin @g 123` |
| `tg react @u 123 👍` | `tg msg react @u 123 👍` |
| `tg click @bot 123 OK` | `tg msg click @bot 123 OK` |
| `tg download @u 123` | `tg msg download @u 123` |
| `tg transcribe @u 123` | `tg msg transcribe @u 123` |

## Collapsed overlaps

- `chat` + `resolve` → `chats info`
- `dialogs` + `unread` → `chats` + `chats --unread`
- `messages --search` ≈ `search --chat` → `msg --search` + `msg search --chat` (keep both, different use cases)
- `transcribe` → `msg transcribe` (single) + `msg --transcribe` (batch on list)

## Subcommand routing

Parser checks: if first positional arg after `chats`/`msg` matches a known subcommand name → route. Otherwise → default list behavior.

Known subcommands:
- `chats`: find, info, members, read
- `msg`: get, search, send, edit, delete, forward, pin, unpin, react, click, download, transcribe
