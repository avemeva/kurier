# AI Agent Benchmark for Telegram

## Goal

Build a benchmark to evaluate how well Claude + agent-telegram performs real-world tasks against a real Telegram account. No existing benchmark covers AI agents operating on messaging platforms — this would be the first.

## Key Insight

The hard problem isn't defining tasks or scoring — it's **reproducing a realistic environment**. A freshly seeded account with 5 test groups doesn't test the agent. A real account has hundreds of channels, hundreds of contacts, diverse media types, years of history. The agent must find the right answer amid real-world noise.

## Approach: TDLib Database Snapshots + Offline Mode

### How TDLib stores data locally [fact]

Two files in `database_directory`:

| File | Format | Contents |
|------|--------|----------|
| `td.binlog` | Custom binary log, AES-CTR encrypted | Auth state, users, chats, channels, secret chats, pending operations. Append-only, replayed on startup. |
| `db.sqlite` | SQLCipher 4.x (encrypted SQLite) | Messages (with FTS index), dialogs, file metadata, stories, threads. Data stored as opaque binary blobs — only TDLib can parse them. |

Plus `files_directory/` for downloaded media (photos, videos, stickers, etc.).

Which tables exist depends on TDLib parameters: `use_file_database`, `use_chat_info_database`, `use_message_database`. All three should be `true` for maximum local cache.

### The snapshot/restore strategy

```
1. Run daemon with real account -> TDLib syncs everything to local DB
2. Stop daemon (clean shutdown, WAL flushed)
3. cp -r database_directory/ -> snapshots/real-account-YYYY-MM-DD/
4. For each benchmark run:
   a. cp -r snapshot/ -> run-db/
   b. Start daemon pointing at run-db/
   c. Immediately call setNetworkType(networkTypeNone)
   d. Run agent tasks (reads work from local SQLite via TDLib API)
   e. Stop daemon, discard run-db/
```

Each run starts from identical state. Perfectly reproducible.

### setNetworkType(networkTypeNone) — the kill switch [fact]

TDLib has a built-in mechanism to disable all network activity:

```json
{ "@type": "setNetworkType", "type": { "@type": "networkTypeNone" } }
```

What it does:
- `network_flag_` -> `false` in StateManager
- ConnectionCreator stops opening connections
- Session blocks all outgoing queries
- getDifference never runs (needs network)
- State becomes `connectionStateWaitingForNetwork`
- Network-dependent queries queue up and wait (don't fail)

Source: `td/telegram/net/Session.cpp:1185` — `if (!network_flag_) return;` blocks connection opening.

### Race condition on startup

Between daemon start and `setNetworkType(networkTypeNone)`, TDLib will attempt to connect and call `updates.getDifference`. Solutions:

1. **Block at network level** — firewall/proxy rule before starting, then set networkTypeNone, then restore
2. **Patch TDLib** — start with networkTypeNone by default (one-line change in `Td.cpp` init)
3. **Set networkTypeNone in daemon startup** — make it the very first TDLib call before auth completes

Option 3 is cleanest. Add a `--offline` flag to the daemon.

### What works offline [fact]

| Operation | Works offline? | Source |
|-----------|---------------|--------|
| getChat / getChats | Yes — reads from DialogDb | `MessagesManager.cpp:13236` |
| getUser / getBasicGroup / getSupergroup | Yes — reads from binlog | `UserManager.cpp:4742` |
| getChatHistory | Yes — reads from MessageDb (if cached) | `MessagesManager.cpp:19152-19232` |
| searchMessages (text) | Yes — local FTS index | `MessagesManager.cpp:18370-18410` |
| getUserFullInfo | No — always server | `UserManager.cpp:1427` |
| Resolve username | No — server lookup | — |
| Send/forward messages | No — requires server | — |
| Download media | No — requires server | — |
| Load older uncached messages | No — requires server | — |

### What you CAN'T benchmark this way

- Write operations (send, forward, delete, pin)
- Operations requiring server (resolve usernames, load uncached history)
- Real-time scenarios (monitoring new messages)

For write operations, you'd need real accounts with network access and accept non-reproducibility.

## No existing benchmarks for messaging agents [fact]

Searched extensively (March 2026). No published benchmark evaluates AI agents on Telegram or any messaging platform. Products like Manus and OpenClaw operate on Telegram but have no evaluation suite.

### Closest methodological fits

| Benchmark | Relevance | Approach |
|-----------|-----------|----------|
| [tau-bench](https://github.com/sierra-research/tau-bench) | HIGH | Simulated user + agent + domain tools + policy. pass^k scoring. GPT-4o <50% pass^1 on retail domain. |
| [MCPMark](https://github.com/eval-sys/mcpmark) | HIGH | MCP-native eval, 127 CRUD tasks across 5 environments. Best model 52% pass@1. ICLR 2026. |
| [MCP-Bench](https://github.com/Accenture/mcp-bench) | MEDIUM-HIGH | 104 tasks across 28 live MCP servers. Tests single and multi-server composition. |
| [BFCL V4](https://gorilla.cs.berkeley.edu/leaderboard.html) | MEDIUM | Raw function-calling correctness (serial, parallel, multi-turn). |
| [tau2-bench](https://github.com/sierra-research/tau2-bench) | MEDIUM | Dual-control scenarios. Claude 3.7 Sonnet 49% pass^1. |

### Other reviewed (low relevance)

- **ToolBench/ToolLLM** — 16k+ REST APIs, breadth over depth, no messaging
- **API-Bank** — 73 API tools, older (2023), not deep on any domain
- **SEAL ToolComp** — proprietary, closed, not extensible

### Meta-resources

- [AI Agent Benchmark Compendium](https://github.com/philschmid/ai-agent-benchmark-compendium) — catalogs 50+ benchmarks, none messaging-specific
- [LLM Agent Evaluation Survey](https://arxiv.org/html/2507.21504v1) — taxonomy of what/how to evaluate

## Benchmark Architecture

### Task generation from live state

Since state varies per snapshot, tasks should be generated dynamically:

```typescript
// pre-flight reads current state via TDLib/daemon API
const chats = await getChats()
const unreadCount = chats.filter(c => c.unread > 0).length

tasks.push({
  instruction: 'How many unread chats do I have?',
  expected: unreadCount,
})

const lastPhoto = await findLastPhoto('Travel')
tasks.push({
  instruction: 'Who sent the last photo in Travel?',
  expected: lastPhoto.sender,
})
```

Tasks reference content by structure (sender, text pattern, media type), not by message ID.

### Scoring

- **pass^k** (tau-bench style) — run each task k times, measure reliability across trials
- **Structural assertions** — sender matches, content contains pattern, media type correct
- **LLM-as-judge** — for open-ended tasks (summarize, describe)
- **Efficiency** — tool calls per task, tokens used

### What to measure

| Metric | Why |
|--------|-----|
| Accuracy (pass@1) | Can the agent get the right answer? |
| Reliability (pass^k) | Does it get it right consistently? |
| Tool call count | Efficiency — 3 calls vs 15 for same task |
| Token usage | Cost per task |
| Latency | Wall clock time per task |
| Error recovery | Does it recover from wrong first attempts? |

### Task categories

| Category | Example | Offline? |
|----------|---------|----------|
| Count / aggregate | "How many unread chats?" | Yes |
| Search by content | "Find the PDF Alice shared in Project Team" | Yes (FTS) |
| Search by sender | "Last message from Bob" | Yes |
| Navigation | "List all groups I'm in" | Yes |
| Media identification | "Find voice messages in Family chat" | Yes |
| Cross-chat | "Which chat was the budget discussed in?" | Yes |
| Disambiguation | "Find John's message about the meeting" (multiple Johns) | Yes |
| Write operations | "Send hello to Saved Messages" | No — needs network |
| Resolve | "Find @username's chat" | No — needs network |

### Proposed directory structure

```
benchmarks/
  snapshots/           # TDLib database snapshots
  tasks/
    definitions.yaml   # task templates
  harness.ts           # orchestrates: restore snapshot -> start daemon -> run tasks -> score
  generator.ts         # generates tasks + ground truth from current TDLib state
  judge.ts             # LLM-as-judge for open-ended tasks
  report.ts            # aggregates results, generates pass rates
  results/             # stored runs for comparison
```

## TDLib Database Internals (Reference)

### Files created by TDLib [fact]

- `td.binlog` — binary event log (path: `{database_directory}/td.binlog`)
- `db.sqlite` — SQLCipher database (path: `{database_directory}/db.sqlite`)
- `db.sqlite-journal` / `db.sqlite-wal` / `db.sqlite-shm` — SQLite auxiliary files
- Path construction: `TdDb.cpp:49-55`

### Database is opaque [fact]

- SQLCipher 4.x encryption with key derived from `database_encryption_key`
- Even decrypted, tables contain serialized TDLib-internal binary blobs
- No official tools to inspect directly
- TDLib maintainer: "data stored in the database as binary blobs, which can be parsed only by TDLib itself" (GitHub issue #1454)
- Best way to inspect: run TDLib and use its API

### Key source files

| File | What it does |
|------|-------------|
| `td/telegram/TdDb.cpp` | Database initialization, path construction, open/close |
| `td/telegram/TdDb.h` | Parameters struct (database_directory, use_message_database, etc.) |
| `td/telegram/MessageDb.h` | Message storage interface (FTS queries, dialog message queries) |
| `td/telegram/DialogDb.h` | Dialog/chat storage interface |
| `td/telegram/UpdatesManager.cpp` | getDifference sync logic |
| `td/telegram/net/Session.cpp:1185` | Network flag check — blocks connections when offline |
| `td/telegram/StateManager.cpp:39-42` | Network state management |
| `td/telegram/net/NetType.h` | NetType enum including None |

### Snapshot requirements [fact]

- TDLib must be **stopped** before copying (WAL data, file locks)
- Must provide **same `database_encryption_key`** when reopening
- Copy everything: binlog + sqlite + auxiliary files
- Confirmed viable by TDLib community and project's own research notes (`tdata-decryption.md:228`)

## Open Questions

- How much of a real account's history is cached locally? (depends on `use_message_database` and how much was scrolled/loaded)
- Can we pre-warm the cache by programmatically scrolling through all chats before snapshotting?
- What's the snapshot size for a heavy account? (hundreds of channels, years of history)
- Should we benchmark against multiple snapshots (different accounts, different sizes) for generalizability?
