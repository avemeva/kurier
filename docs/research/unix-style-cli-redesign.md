# Unix-Style CLI Redesign Research

## Overview

Research into reworking the `tg` CLI to follow Unix coreutils conventions: one verb per action, familiar flags (`-n`, `-f`, `-l`, `-a`, `-C`), composability via pipes, JSON on stdout, errors on stderr.

---

## Command Renames

| Current | Unix-style | Analogy | Why |
|---------|-----------|---------|-----|
| `dialogs` + `unread` | `ls` | `ls` lists directory contents → list chats | listing things |
| `messages` + `message` | `cat` | `cat` prints file contents → print messages | reading content |
| `listen` | `tail -f` | `tail -f` follows file appends → follow new messages | following a stream |
| `search` | `grep` | `grep` searches file contents → search message contents | searching content |
| `me` | `whoami` | `whoami` prints current user | self-identity |
| `resolve` + `chat` | `id` | `id` prints user identity info | identify an entity |
| `contacts` + `members` | `who` | `who` lists logged-in users → list people | list people |
| `edit` | `sed` | `sed` stream editor → edit in place | edit message |
| `delete` | `rm` | `rm` removes files → remove messages | remove |
| `forward` | `mv` | `mv` moves between locations → forward | move between chats |
| `read` | `touch` | `touch` updates timestamp → mark as read | acknowledge |
| `download` | `wget` | `wget` retrieves files from network | fetch media |
| `transcribe` | `asr` | ASR = Automatic Speech Recognition | standard abbreviation |
| `send` | `send` | — | kept (clear enough) |
| `pin` / `unpin` | `pin` / `unpin` | — | kept (no Unix analog) |
| `react` | `react` | — | kept (no Unix analog) |
| `eval` | `eval` | `eval` is universal (bash, python, js) | kept |
| `auth` | `auth` | — | kept |
| `daemon` | `daemon` | — | kept |

**Result:** 24 commands → 16 verbs. 8 commands eliminated by merging.

---

## New Convention: `chat:id` Addressing

Used consistently across `cat`, `sed`, `rm`, `mv`, `pin`, `unpin`, `react`, `wget`, `asr` — mirrors `file:line` convention from compilers and editors.

```bash
tg cat @durov:48291        # single message
tg rm @durov:48291         # delete message
tg sed @durov:48291 "new"  # edit message
tg wget @durov:48291       # download media
```

---

## Eliminated Flags

| Killed | Replacement | Why |
|--------|-------------|-----|
| `--stdin` | `\| pipe` (auto-detect) | Unix convention — `cat`, `wc`, `sed` all detect stdin automatically |
| `--file path` | `< path` (shell redirect) | Shell redirects are the Unix way |
| `--offset-cursor` | `--offset` | Was redundant alias |
| `--filter` (members) | `--type` / `-t` | Was redundant alias |
| `--chat` (search) | positional arg | `grep pattern file`, not `grep --file pattern` |
| `--chat` (listen) | positional args | `tail -f file1 file2`, not `tail --file` |

---

## Composability Examples

```bash
# Unread DM count
tg ls -u -t user | jq '.data | length'

# Forward all photos from alice to saved
tg grep -t photo @alice | jq -r '.data[].id' | xargs -I{} tg mv @alice:{} me

# Monitor group, react to keywords
tg tail -f @devgroup | jq --unbuffered -r 'select(.text | test("deploy")) | .id' | \
  while read id; do tg react @devgroup:"$id" 🚀; done

# Export last 1000 messages as NDJSON
tg cat @durov -n 1000 | jq -c '.data[]'

# Search globally, get full context
tg grep -C 5 --full "API key" | jq '.data[] | {chat: .chat_title, text: .text}'
```

---

## Complete Flag Mapping Table

Every flag of every command, with the old command on the left, the new Unix-style equivalent, and an honest assessment of how natural the mapping is.

### Global Flags

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 1 | `tg dialogs --pretty` | `tg ls -J` | `-J` for JSON pretty-print | Weak. `-J` is not standard anywhere. `--pretty` is already good. Maybe just keep `--pretty` or let users pipe to `jq .` |
| 2 | `tg dialogs --timeout 30` | `tg ls -w 30` | `-w` wait | OK. `curl --max-time` uses `-m`, `nc` uses `-w`. Not universal but recognizable |
| 3 | `tg dialogs --help` | `tg ls -h` | universal | Perfect. Everyone expects `-h` |
| 4 | `echo "hi" \| tg send @durov` | auto-detect pipe | removed `--stdin` | Perfect. This is how every Unix tool works — `cat`, `wc`, `sed` all detect stdin automatically |
| 5 | `tg send @durov < msg.txt` | shell redirect | removed `--file` | Perfect. Shell redirects are the Unix way. No tool has `--file` for this |

### me → whoami

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 6 | `tg me` | `tg whoami` | renamed | Perfect. `whoami` is the exact coreutils command for "who am I" |

### resolve → id

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 7 | `tg resolve @durov` | `tg id @durov` | renamed | Good. `id` prints user identity info in Unix. Exact match |
| 8 | `tg resolve +79001234567` | `tg id +79001234567` | renamed | Good |
| 9 | `tg resolve t.me/durov` | `tg id t.me/durov` | renamed | Good |
| 10 | `tg resolve 123456789` | `tg id 123456789` | renamed | Good. `id 501` works in real Unix too |

### chat → id

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 11 | `tg chat @durov` | `tg id @durov` | merged into `id` | Good merge. Both do "tell me about this entity." But `id` in Unix is user-only — here it also resolves groups/channels. Slight stretch |
| 12 | `tg chat -1001234567890` | `tg id -1001234567890` | merged into `id` | Same concern — `id` for a channel feels less natural than `id` for a person |

### contacts → who

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 13 | `tg contacts` | `tg who` | renamed | Good. `who` lists logged-in users. Contacts ≈ "who's in my address book" — close enough |
| 14 | `tg contacts --limit 50` | `tg who -n 50` | `--limit` → `-n` | Acceptable. `who` doesn't have `-n` in real Unix, but `-n` for count is consistent within the CLI |
| 15 | `tg contacts --offset 100` | `tg who --offset 100` | kept long form | Fine. No Unix `who` has pagination, no precedent to follow. Long form is honest |
| 16 | `tg contacts --limit 50 --offset 100` | `tg who -n 50 --offset 100` | combined | Fine |
| 17 | `tg contacts search "john"` | `tg who -s "john"` | subcommand → `-s` flag | Questionable. `-s` in `who -s` means "short format" in real Unix. Overloading it for search could confuse people who know real `who` |
| 18 | `tg contacts search "john" --limit 10` | `tg who -s "john" -n 10` | combined | Same concern as above |

### members → who \<chat\>

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 19 | `tg members @devgroup` | `tg who @devgroup` | merged | Clever. `who` = "who's here." But real `who` doesn't take a "room" argument. It's a new semantic that looks like Unix but isn't |
| 20 | `tg members @devgroup --limit 50` | `tg who @devgroup -n 50` | `--limit` → `-n` | Same as contacts — consistent internal convention, no Unix precedent for `who -n` |
| 21 | `tg members @devgroup --search "alex"` | `tg who @devgroup -s "alex"` | `--search` → `-s` | Same `-s` concern as #17 |
| 22 | `tg members @devgroup --offset 100` | `tg who @devgroup --offset 100` | kept long form | Fine |
| 23 | `tg members @devgroup --type admin` | `tg who @devgroup -t admin` | `--type` → `-t` | OK. No precedent in real `who`, but `-t` for type is self-explanatory |
| 24 | `tg members @devgroup --type bot` | `tg who @devgroup -t bot` | `--type` → `-t` | OK |
| 25 | `tg members @devgroup --type recent` | `tg who @devgroup -t recent` | `--type` → `-t` | OK |
| 26 | `tg members @devgroup --filter admin` | `tg who @devgroup -t admin` | `--filter` removed | Good cleanup. Two flags for the same thing was a mistake |
| 27 | `tg members @devgroup --limit 50 --search "al" --type admin` | `tg who @devgroup -n 50 -s "al" -t admin` | all combined | Works, but `-s` still bugs me |

### dialogs → ls

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 28 | `tg dialogs` | `tg ls` | renamed | Perfect. `ls` lists things. Chats are the "files" of Telegram |
| 29 | `tg dialogs --limit 100` | `tg ls -n 100` | `--limit` → `-n` | Weak. Real `ls` has no `-n`. `-n` means numeric UIDs in real `ls`. Users of `head -n` / `tail -n` will get it, but `ls` users might not |
| 30 | `tg dialogs --archived` | `tg ls -a` | `--archived` → `-a` | Perfect. `ls -a` shows hidden files. Archived chats = hidden chats. Exact mental model |
| 31 | `tg dialogs --unread` | `tg ls -u` | `--unread` → `-u` | OK. Real `ls -u` sorts by access time — totally different meaning. But `-u` for "unread" is mnemonic enough that people won't care |
| 32 | `tg dialogs --type user` | `tg ls -t user` | `--type` → `-t` | Weak. Real `ls -t` sorts by modification time. Completely different. Could confuse `ls` power users |
| 33 | `tg dialogs --type group` | `tg ls -t group` | `--type` → `-t` | Same concern |
| 34 | `tg dialogs --type channel` | `tg ls -t channel` | `--type` → `-t` | Same concern |
| 35 | `tg dialogs --search "work"` | `tg ls -s "work"` | `--search` → `-s` | Bad. Real `ls -s` shows file sizes. Repurposing for search is misleading |
| 36 | `tg dialogs --offset-date 1709300000` | `tg ls --offset 1709300000` | `--offset-date` → `--offset` | Good simplification. No short form needed for pagination |
| 37 | `tg dialogs --limit 10 --archived --unread --type group` | `tg ls -n 10 -a -u -t group` | all combined | Looks clean, but `-t` and `-u` collide with real `ls` meanings |
| 38 | `tg dialogs --limit 10 --archived --unread --type group` | `tg ls -naut group` | collapsed short flags | Cute but `-naut` is unreadable. Nobody would actually type this |

### unread → ls -u

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 39 | `tg unread` | `tg ls -u` | command eliminated | Good. Separate command was unnecessary. But inherits the `-u` concern from #31 |
| 40 | `tg unread --limit 30` | `tg ls -u -n 30` | `--limit` → `-n` | Fine |
| 41 | `tg unread --all` | `tg ls -u -a` | `--all` → `-a` | Good. `-a` already means "show archived" in `ls` context |
| 42 | `tg unread --type user` | `tg ls -u -t user` | `--type` → `-t` | Same `-t` concern |
| 43 | `tg unread --type group` | `tg ls -u -t group` | `--type` → `-t` | Same |
| 44 | `tg unread --type channel` | `tg ls -u -t channel` | `--type` → `-t` | Same |
| 45 | `tg unread --all --type user --limit 20` | `tg ls -u -a -t user -n 20` | all combined | Fine |

### messages → cat

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 46 | `tg messages @durov` | `tg cat @durov` | renamed | Good. `cat` prints file contents. Messages are the "contents" of a chat |
| 47 | `tg messages @durov --limit 50` | `tg cat @durov -n 50` | `--limit` → `-n` | Weak. Real `cat` has no `-n`. Real `cat -n` means "number lines." `head -n` is the tool with count. Could use `tg head` instead? |
| 48 | `tg messages @durov --offset-id 48291` | `tg cat @durov --offset 48291` | `--offset-id` → `--offset` | Good simplification |
| 49 | `tg messages @durov --from @alice` | `tg cat @durov -F @alice` | `--from` → `-F` | OK but unusual. No coreutils tool uses `-F`. `cat -F` doesn't exist. Capital letters feel heavy for a common filter |
| 50 | `tg messages @durov --search "hello"` | `tg grep "hello" @durov` | moved to `grep` | Perfect. Search belongs in `grep`, not `cat`. Clean separation of concerns |
| 51 | `tg messages @durov --filter photo` | `tg cat @durov -t photo` | `--filter` → `-t` | OK. Real `cat` has no `-t` (well, it shows tabs). But `-t` for type is at least consistent across the CLI |
| 52 | `tg messages @durov --filter video` | `tg cat @durov -t video` | `--filter` → `-t` | Same |
| 53 | `tg messages @durov --filter document` | `tg cat @durov -t document` | `--filter` → `-t` | Same |
| 54 | `tg messages @durov --filter url` | `tg cat @durov -t url` | `--filter` → `-t` | Same |
| 55 | `tg messages @durov --filter voice` | `tg cat @durov -t voice` | `--filter` → `-t` | Same |
| 56 | `tg messages @durov --filter gif` | `tg cat @durov -t gif` | `--filter` → `-t` | Same |
| 57 | `tg messages @durov --filter music` | `tg cat @durov -t music` | `--filter` → `-t` | Same |
| 58 | `tg messages @durov --min-id 1000` | `tg cat @durov --min-id 1000` | kept long form | Fine. No short form needed for rare filters |
| 59 | `tg messages @durov --max-id 2000` | `tg cat @durov --max-id 2000` | kept long form | Fine |
| 60 | `tg messages @durov --since 1709300000` | `tg cat @durov --since 1709300000` | kept long form | Fine |
| 61 | `tg messages @durov --reverse` | `tg cat @durov -r` | `--reverse` → `-r` | Good. `sort -r`, `tac` — reversing is a common concept. `-r` is natural |
| 62 | `tg messages @durov --download-media` | `tg cat @durov -d` | `--download-media` → `-d` | Questionable. `-d` usually means "delete" or "debug" in Unix. "download" is a Telegram-specific concern crammed into a generic flag |
| 63 | `tg messages @durov --limit 50 --from @alice --reverse --download-media` | `tg cat @durov -n 50 -F @alice -r -d` | all combined | Compact but `-F` and `-d` are not intuitive without docs |

### message → cat \<chat\>:\<id\>

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 64 | `tg message @durov 48291` | `tg cat @durov:48291` | command eliminated, colon syntax | Good. `file:line` is a universal convention from compilers, editors, grep output. Instantly understood |
| 65 | `tg message -1001234567890 999` | `tg cat -1001234567890:999` | numeric chat + id | Works, but `-100...:999` looks visually noisy. Still unambiguous to a parser |

### search → grep

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 66 | `tg search "meeting"` | `tg grep "meeting"` | renamed (global) | Perfect. `grep` searches content. This is exactly what it does |
| 67 | `tg search "meeting" --chat @work` | `tg grep "meeting" @work` | `--chat` → positional | Perfect. `grep pattern file` — chat as the "file" argument. Exactly how grep works |
| 68 | `tg search "meeting" --limit 50` | `tg grep "meeting" -n 50` | `--limit` → `-n` | Bad. Real `grep -n` shows line numbers, not limits. This will trip up everyone. `-m 50` (max count) is the real grep flag for this |
| 69 | `tg search "bug" --chat @dev --from @alice` | `tg grep "bug" @dev -F @alice` | `--from` → `-F` | Bad. Real `grep -F` means "fixed string" (not regex). Repurposing it for "from sender" is a trap for grep users |
| 70 | `tg search "deploy" --since 1709300000` | `tg grep "deploy" --since 1709300000` | kept long form | Fine. No grep equivalent, long form is honest |
| 71 | `tg search "news" --type user` | `tg grep "news" -t user` | `--type` → `-t` | OK. Real `grep` has no `-t`. No collision, just unfamiliar |
| 72 | `tg search "news" --type group` | `tg grep "news" -t group` | `--type` → `-t` | Same |
| 73 | `tg search "news" --type channel` | `tg grep "news" -t channel` | `--type` → `-t` | Same |
| 74 | `tg search "pic" --chat @durov --filter photo` | `tg grep "pic" @durov -t photo` | `--filter` → `-t` | Overloaded. In global mode `-t` means chat type, in per-chat mode it means media type. Same flag, different semantics depending on context. Confusing |
| 75 | `tg search "vid" --chat @durov --filter video` | `tg grep "vid" @durov -t video` | `--filter` → `-t` | Same concern |
| 76 | `tg search "doc" --chat @durov --filter document` | `tg grep "doc" @durov -t document` | `--filter` → `-t` | Same |
| 77 | `tg search "link" --chat @durov --filter url` | `tg grep "link" @durov -t url` | `--filter` → `-t` | Same |
| 78 | `tg search "memo" --chat @durov --filter voice` | `tg grep "memo" @durov -t voice` | `--filter` → `-t` | Same |
| 79 | `tg search "meme" --chat @durov --filter gif` | `tg grep "meme" @durov -t gif` | `--filter` → `-t` | Same |
| 80 | `tg search "song" --chat @durov --filter music` | `tg grep "song" @durov -t music` | `--filter` → `-t` | Same |
| 81 | `tg search "bug" --chat @dev --context 3` | `tg grep "bug" @dev -C 3` | `--context` → `-C` | Perfect. `grep -C 3` is the exact same thing — N lines of context around a match. Textbook mapping |
| 82 | `tg search "key" --chat @dev --offset-id 5000` | `tg grep "key" @dev --offset 5000` | `--offset-id` → `--offset` | Fine |
| 83 | `tg search "key" --offset "abc123"` | `tg grep "key" --offset "abc123"` | kept | Fine |
| 84 | `tg search "key" --offset-cursor "abc123"` | `tg grep "key" --offset "abc123"` | removed alias | Good cleanup |
| 85 | `tg search "api key" --chat @dev --full` | `tg grep "api key" @dev -l` | `--full` → `-l` | Bad. Real `grep -l` means "files with matches" (list filenames only). Exact opposite of "show full content." Very misleading |
| 86 | `tg search "bug" --chat @dev --limit 50 --from @alice --context 3 --full` | `tg grep "bug" @dev -n 50 -F @alice -C 3 -l` | all combined | Three collisions in one command: `-n` (line numbers), `-F` (fixed string), `-l` (list files). A grep user would expect completely different behavior |

### send → send

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 87 | `tg send @durov "hello"` | `tg send @durov "hello"` | unchanged | Good. `send` is clear, no Unix rename needed. `mail` would be too email-specific |
| 88 | `tg send @durov "hello" --reply-to 48291` | `tg send @durov "hello" -r 48291` | `--reply-to` → `-r` | Good. `-r` for reply is intuitive. No collision since `send` isn't a real Unix tool |
| 89 | `tg send @durov "*bold*" --md` | `tg send @durov "*bold*" -m` | `--md` → `-m` | Fine. Telegram-specific, no Unix precedent to collide with |
| 90 | `tg send @durov "<b>bold</b>" --html` | `tg send @durov "<b>bold</b>" -H` | `--html` → `-H` | Fine. Capital `-H` is a bit heavy for a common flag, but `curl` uses `-H` for headers so it's not alien |
| 91 | `tg send @durov "shh" --silent` | `tg send @durov "shh" -s` | `--silent` → `-s` | Good. `-s` for silent is intuitive. `curl -s` means silent too |
| 92 | `tg send @durov "https://x.com" --no-preview` | `tg send @durov "https://x.com" -P` | `--no-preview` → `-P` | Weak. Capital `-P` for a negation is odd. Usually `--no-X` stays long. No one will guess what `-P` means |
| 93 | `tg send @durov "hello" -r 48291 -m -s -P` | all combined | | `-P` sticks out as the non-obvious one |
| 94 | `echo "piped" \| tg send @durov` | auto-detect | `--stdin` removed | Perfect |
| 95 | `tg send @durov < notes.txt` | shell redirect | `--file` removed | Perfect |

### edit → sed

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 96 | `tg edit @durov 48291 "fixed text"` | `tg sed @durov:48291 "fixed text"` | renamed, colon syntax | Clever but forced. Real `sed` does regex substitution (`s/old/new/`). This just replaces the whole message. It's "edit" not "stream edit." Naming is catchy but semantically wrong |
| 97 | `tg edit @durov 48291 "*bold*" --md` | `tg sed @durov:48291 "*bold*" -m` | `--md` → `-m` | Fine |
| 98 | `tg edit @durov 48291 "<b>bold</b>" --html` | `tg sed @durov:48291 "<b>bold</b>" -H` | `--html` → `-H` | Fine |
| 99 | `echo "new" \| tg edit @durov 48291 --stdin` | `echo "new" \| tg sed @durov:48291` | auto-detect | Good |
| 100 | `tg edit @durov 48291 --file fix.txt` | `tg sed @durov:48291 < fix.txt` | shell redirect | Good |

### delete → rm

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 101 | `tg delete @durov 48291` | `tg rm @durov:48291` | renamed, colon syntax | Perfect. `rm` removes things. Everyone knows it |
| 102 | `tg delete @durov 48291 48292 48293` | `tg rm @durov:48291 @durov:48292 @durov:48293` | each gets colon syntax | Good but verbose. Maybe allow `tg rm @durov:48291,48292,48293` as shorthand? |
| 103 | `tg delete @durov 48291 --revoke` | `tg rm -r @durov:48291` | `--revoke` → `-r` | Dangerous collision. `rm -r` means recursive delete in Unix — the most destructive common command. Here it means "delete for everyone." A user seeing `rm -r` will think recursive. Very misleading |
| 104 | `tg delete @durov 48291 48292 --revoke` | `tg rm -r @durov:48291 @durov:48292` | multiple + revoke | Same `rm -r` problem. This looks terrifying to a Unix user |

### forward → mv

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 105 | `tg forward @alice @bob 48291` | `tg mv @alice:48291 @bob` | renamed, dst last | Semantically wrong. `mv` means the source is gone after the operation. Forward creates a copy in the destination — the original stays. This is `cp`, not `mv` |
| 106 | `tg forward @alice @bob 48291 48292` | `tg mv @alice:48291 @alice:48292 @bob` | multiple, dst last | Same issue. Also `mv src1 src2 dst` syntax is nice |
| 107 | `tg forward @alice @bob 48291 --silent` | `tg mv -s @alice:48291 @bob` | `--silent` → `-s` | Fine as a flag, but the command name is wrong |

### read → touch

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 108 | `tg read @durov` | `tg touch @durov` | renamed | Clever. `touch` updates access timestamp ≈ marking as read. But `touch` creates files if they don't exist — that extra meaning could confuse. Also "read" is already a perfectly clear verb |
| 109 | `tg read -1001234567890` | `tg touch -1001234567890` | renamed | Same |

### pin → pin

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 110 | `tg pin @group 48291` | `tg pin @group:48291` | colon syntax | Good. `pin` has no Unix equivalent but the colon syntax is clean |
| 111 | `tg pin @group 48291 --silent` | `tg pin -s @group:48291` | `--silent` → `-s` | Fine. Consistent with `send -s` |

### unpin → unpin

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 112 | `tg unpin @group 48291` | `tg unpin @group:48291` | colon syntax | Good |
| 113 | `tg unpin @group --all` | `tg unpin -a @group` | `--all` → `-a` | Good. `-a` for "all" is universal |

### react → react

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 114 | `tg react @durov 48291 👍` | `tg react @durov:48291 👍` | colon syntax | Good |
| 115 | `tg react @durov 48291 👍 --remove` | `tg react -d @durov:48291 👍` | `--remove` → `-d` | OK. `-d` for delete/remove is used in `git branch -d`. Reasonable |
| 116 | `tg react @durov 48291 🔥 --big` | `tg react -b @durov:48291 🔥` | `--big` → `-b` | Fine. Telegram-specific, no collision risk |
| 117 | `tg react @durov 48291 🔥 --big --remove` | *(N/A — mutually exclusive)* | | |

### listen → tail

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 118 | `tg listen --type user` | `tg tail -f -t user` | renamed, `-f` required | Good core idea. `tail -f` for streaming is the most recognized Unix idiom. But requiring `-f` always is odd — real `tail` without `-f` shows last N lines then exits. Should `tg tail @chat` (no `-f`) show last N messages? If yes, this overlaps with `cat` |
| 119 | `tg listen --type group` | `tg tail -f -t group` | `--type` → `-t` | Real `tail` has no `-t`. No collision, just unfamiliar |
| 120 | `tg listen --type channel` | `tg tail -f -t channel` | `--type` → `-t` | Same |
| 121 | `tg listen --chat 123,456` | `tg tail -f 123 456` | chats are positional | Good. `tail -f file1 file2` is real Unix. Multiple files = multiple chats |
| 122 | `tg listen --chat 123 --type user` | `tg tail -f 123 -t user` | combined | Fine |
| 123 | `tg listen --exclude-chat 789` | `tg tail -f -t user -x 789` | `--exclude-chat` → `-x` | Weak. No Unix tool uses `-x` for exclude. `grep` uses `-v` for invert. `-x` means "exact match" in grep. Confusing |
| 124 | `tg listen --exclude-type group` | `tg tail -f -t user -X group` | `--exclude-type` → `-X` | Same issue plus capital letter. `--exclude-type` was clearer |
| 125 | `tg listen --event new_message` | `tg tail -f -t user -e new_message` | `--event` → `-e` | OK. `journalctl` uses `-e` (but it means "jump to end"). `-e` for event is mnemonic but not standard |
| 126 | `tg listen --event new_message,edit_message` | `tg tail -f -t user -e new_message,edit_message` | comma-separated | Fine |
| 127 | `tg listen --event delete_messages` | `tg tail -f -t user -e delete_messages` | | Fine |
| 128 | `tg listen --event message_reactions` | `tg tail -f -t user -e message_reactions` | | Fine |
| 129 | `tg listen --event read_outbox` | `tg tail -f -t user -e read_outbox` | | Fine |
| 130 | `tg listen --event user_typing` | `tg tail -f -t user -e user_typing` | | Fine |
| 131 | `tg listen --event user_status` | `tg tail -f -t user -e user_status` | | Fine |
| 132 | `tg listen --event message_send_succeeded` | `tg tail -f -t user -e message_send_succeeded` | | Fine |
| 133 | `tg listen --incoming` | `tg tail -f -t user -i` | `--incoming` → `-i` | Weak. `-i` universally means "case insensitive" (`grep -i`, `sort -i`). Using it for "incoming" will mislead |
| 134 | `tg listen --download-media` | `tg tail -f -t user -d` | `--download-media` → `-d` | Same concern as #62. `-d` for download is not standard. `curl -d` means POST data |
| 135 | `tg listen --chat 123 --type user --exclude-chat 789 --exclude-type group --event new_message --incoming --download-media` | `tg tail -f 123 -t user -x 789 -X group -e new_message -i -d` | all combined | Alphabet soup. Half these short flags collide with common Unix meanings |

### download → wget

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 136 | `tg download @durov 48291` | `tg wget @durov:48291` | renamed, colon syntax | Good. `wget` downloads files. Obvious mapping |
| 137 | `tg download @durov 48291 --output ~/photo.jpg` | `tg wget -O ~/photo.jpg @durov:48291` | `--output` → `-O` | Perfect. `wget -O` is the exact same flag with the exact same meaning. Textbook |
| 138 | `tg download --file-id 12345` | `tg wget --fid 12345` | `--file-id` → `--fid` | Minor. Abbreviation saves 3 chars. Debatable if it's worth the discoverability loss |
| 139 | `tg download --file-id 12345 --output ~/doc.pdf` | `tg wget -O ~/doc.pdf --fid 12345` | combined | Fine |

### transcribe → asr

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 140 | `tg transcribe @durov 48291` | `tg asr @durov:48291` | renamed, colon syntax | Niche. "ASR" is an industry term but most users don't know it. `transcribe` is self-documenting. Renaming to a 3-letter acronym saves typing but kills discoverability |

### eval → eval

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 141 | `tg eval "client.invoke({_:'getMe'})"` | `tg eval "client.invoke({_:'getMe'})"` | unchanged | Good. `eval` is universal (bash, python, js) |

### list → list

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 142 | `tg list` | `tg list` | unchanged | Fine |

### auth → auth

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 143 | `tg auth` | `tg auth` | unchanged | Fine |
| 144 | `tg auth phone +79001234567` | `tg auth phone +79001234567` | unchanged | Fine |
| 145 | `tg auth code 12345` | `tg auth code 12345` | unchanged | Fine |
| 146 | `tg auth password secret123` | `tg auth password secret123` | unchanged | Fine |
| 147 | `tg auth logout` | `tg auth logout` | unchanged | Fine |

### daemon → daemon

| # | Current command | Unix-style equivalent | What changed | How natural is the mapping? |
|---|---|---|---|---|
| 148 | `tg daemon start` | `tg daemon start` | unchanged | Fine |
| 149 | `tg daemon stop` | `tg daemon stop` | unchanged | Fine |
| 150 | `tg daemon status` | `tg daemon status` | unchanged | Fine |
| 151 | `tg daemon log` | `tg daemon log` | unchanged | Fine |

---

## Problems Identified

Sorted by severity — issues where the Unix-style mapping is misleading or actively harmful.

### Critical

| # | Issue | Detail |
|---|---|---|
| 103-104 | `rm -r` means "revoke" but Unix users read it as "recursive delete" | Muscle memory hazard. `rm -r` is the most dangerous common command in Unix. Repurposing it for "revoke" (delete for everyone) creates a false sense of familiarity with completely different semantics |
| 105-106 | `mv` implies source is removed; `forward` is actually a copy | `mv` = source is gone after operation. `forward` = original stays, copy appears in destination. This is `cp`, not `mv`. Wrong verb |

### High

| # | Issue | Detail |
|---|---|---|
| 68 | `grep -n` means "limit count" but real `grep -n` means "show line numbers" | Direct collision. Should use `-m` (max count) which is the real grep flag for limiting results |
| 69 | `grep -F` means "from sender" but real `grep -F` means "fixed string mode" | Direct collision. A grep user typing `-F` expects literal string matching, not sender filtering |
| 85 | `grep -l` means "full output" but real `grep -l` means "filenames only" | Inverted meaning. `-l` in grep means show LESS (just filenames). Here it means show MORE (full text). Exact opposite |
| 96 | `sed` name implies regex substitution | Real `sed` does `s/old/new/` pattern replacement. This command replaces the entire message body. The metaphor is wrong — it's "edit" not "stream edit" |

### Medium

| # | Issue | Detail |
|---|---|---|
| 32-34 | `ls -t` means "type filter" but real `ls -t` means "sort by time" | Collision with a very common `ls` flag |
| 35 | `ls -s` means "search" but real `ls -s` means "show file sizes" | Collision |
| 47 | `cat -n` means "limit count" but real `cat -n` means "number lines" | Collision |
| 133 | `tail -i` means "incoming" but `-i` universally means "case insensitive" | `-i` is one of the most universal short flags (`grep -i`, `sort -i`, `uniq -i`). Repurposing for "incoming" is risky |
| 74-80 | `-t` is overloaded: chat type (global) vs media type (per-chat) | Same flag, different semantics depending on whether a chat argument is present. Confusing |
| 62, 134 | `-d` for "download" | `-d` usually means "delete" or "debug" in Unix tools. `curl -d` means POST data. Not intuitive for download |
| 108-109 | `touch` for "mark as read" | Clever but `touch` creates files that don't exist. "read" was already a perfectly clear verb |

### Low

| # | Issue | Detail |
|---|---|---|
| 92 | `-P` for `--no-preview` is unguessable | Capital `-P` for a negation is unusual. `--no-preview` should probably stay long |
| 140 | `asr` is jargon | Most users don't know "ASR" = Automatic Speech Recognition. `transcribe` was self-documenting |
| 138 | `--fid` abbreviation | Saves 3 chars over `--file-id` at the cost of discoverability |
| 1 | `-J` for `--pretty` | Not standard anywhere. `--pretty` is already a fine flag |
| 123-124 | `-x` / `-X` for exclude | No Unix tool uses `-x` for exclude. `--exclude` was clearer |
| 49 | `-F` for `--from` in `cat` | Capital letter for a common filter feels heavy. No coreutils precedent |

---

## Consistent Short Flags Summary

| Short | Long | Used in | Meaning | Unix precedent? |
|-------|------|---------|---------|-----------------|
| `-n` | `--limit` | ls, cat, grep, who, tail | count/limit | `head -n`, `tail -n` — yes for count; collides with `cat -n` (line numbers) and `grep -n` (line numbers) |
| `-a` | `--all` | ls, unpin | include all / archived | `ls -a` — yes |
| `-t` | `--type` | ls, cat, grep, who, tail | type filter | collides with `ls -t` (sort by time) |
| `-s` | `--silent` / `--search` | send, mv, pin + ls, who | silent (actions) / search (queries) | `curl -s` — yes for silent; collides with `ls -s` (sizes) and `who -s` (short) |
| `-f` | `--follow` | tail | follow stream | `tail -f` — perfect |
| `-r` | `--reverse` / `--reply` / `--revoke` | cat + send + rm | context-dependent | `sort -r` — yes for reverse; collides with `rm -r` (recursive) |
| `-d` | `--download` / `--delete` | cat, tail + react | download media / remove reaction | `git branch -d` — ok for delete; unusual for download |
| `-C` | `--context` | grep | context lines | `grep -C` — perfect |
| `-O` | `--output` | wget | output path | `wget -O` — perfect |
| `-F` | `--from` | cat, grep | sender filter | collides with `grep -F` (fixed string) |
| `-m` | `--md` | send, sed | markdown mode | no collision |
| `-H` | `--html` | send, sed | HTML mode | `curl -H` — different meaning but no confusion in this context |
| `-b` | `--big` | react | big animation | no collision |
| `-i` | `--incoming` | tail | incoming only | collides with `grep -i`, `sort -i` (case insensitive) |
| `-u` | `--unread` | ls | unread only | collides with `ls -u` (sort by access time) |
| `-l` | `--full` | grep | long/full output | collides with `grep -l` (filenames only — opposite meaning) |
| `-P` | `--no-preview` | send | no link preview | obscure, should stay long form |
| `-e` | `--event` | tail | event type filter | mnemonic but not standard |
| `-x` | `--exclude` | tail | exclude chat | collides with `grep -x` (exact line match) |
| `-X` | `--exclude-type` | tail | exclude type | unusual |
| `-J` | `--pretty` | *(global)* | JSON pretty-print | not standard, `--pretty` is better |
| `-w` | `--timeout` | *(global)* | wait/timeout | `nc -w` — ok |
| `-h` | `--help` | *(global)* | help | universal |
