# Research Request: Two-Stage Data Transformation in CLI

## Question

The CLI has a two-stage data transformation pipeline for TDLib messages: `slimMessage()` → `flattenMessage()`. Is this split justified, or should it be a single pass?

## Current Pipeline

```
Td.message (raw TDLib)
  → slimMessage()      pure sync — picks fields, flattens unions, strips internals
  → addSenderNames()   async I/O — resolves numeric IDs to names via getUser/getChat
  → flattenMessage()   pure sync — flat keys, group albums, format dates/durations, shorten paths
  → JSON stdout
```

## Key Files

- `apps/cli/src/slim.ts` — `slimMessage()`, `SlimMessage` type, `SlimContent` (16-variant union)
- `apps/cli/src/helpers.ts` — `addSenderNames()`, `enrichMessages()`, `enrichMessage()`
- `apps/cli/src/flatten.ts` — `flattenMessage()`, `flattenMessages()`, `FlatMessage` type

## What to Investigate

1. Is the two-stage split (slim then flatten) a standard pattern or an unnecessary abstraction?
2. Does the async enrichment step between the two stages justify keeping them separate?
3. `slimContent()` and `flattenMessage()` both switch on the same 16 content-type variants — is this duplication acceptable or a maintenance problem?
4. Several call sites skip name resolution (listen events, search context, forward) — does this diversity of consumption justify the intermediate type?
5. `clean()` and `flattenChatType()` are duplicated across both files — code smell or acceptable?
6. How do comparable projects (Discord.js, Telegraf, grammY) handle raw-API-to-consumer-format transformation?

## Constraints

- Project uses strict TypeScript, no `any` casts
- `addSenderNames()` needs typed fields (`sender_type`, `forward_info.origin` discriminated union) to decide which TDLib API to call
- `SlimMessage` is also used by `slimUser()`, `slimMembers()`, `slimAuthState()` which share the same slim.ts module but have no flatten equivalent
- Album grouping (merging consecutive messages with same `media_album_id`) only happens in flatten, not slim

## Expected Output

- Comparison with established patterns (compiler IR, ETL, SDK architecture)
- Verdict: merge, keep as-is, or restructure
- If restructure: concrete proposal with trade-offs
