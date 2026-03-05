# Filtered chat list silently truncated by MAX_SCAN=500

**Task**: Map the user's full Telegram network (all groups, channels, users) for a relationship analysis.
**Commands used**: chats list, chats members, info, msg list

## Issues
- `tg chats list --type group --limit 200` returns only 30 groups with `hasMore: false`, but the account has 89+ groups (verified via unfiltered `--limit 1000` which found 89). Root cause: `MAX_SCAN=500` in `commands.ts:257` caps the filtered scan at 500 chats. Groups beyond position 500 by recency are silently dropped. Same bug affects `--type channel` (55 missing), `--type bot` (33 missing), `--type user` (309 missing), and `--unread`.
- The same `MAX_SCAN=500` pattern exists in 5 other places: `msg search --since` (line 454), `msg list --filter` (line 548), `msg list` plain history (line 606), `msg search` single-chat (line 880), `msg search` cross-chat (line 952).

## Friction
- `--offset-date` pagination doesn't help because it triggers `isFiltered` (line 252), routing through the same capped path. No way to paginate past the 500-chat ceiling with any flag combination.
- Had to compare `--limit 1000` (unfiltered) vs `--type group` (filtered) to discover the discrepancy. The `hasMore: false` response gives no signal that results were truncated.

## Suggestions
- Remove `MAX_SCAN` cap entirely. Loop until `matched.length >= limit` or all chats are exhausted. The requested `--limit` is the user's intent; the scan should honor it.
- If a safety cap is needed for performance, make it proportional to the requested limit (e.g., `limit * 20`) rather than a fixed 500.
