# msg list offset-id broken on supergroups

**Task**: Navigate to messages around a specific message ID in a supergroup to read context around a search hit.
**Commands used**: msg list, msg search

## Issues
- `tg msg list -- -1001731417779 --limit 10 --offset-id 102798196737` returned the latest message (Mar 5) instead of messages near the offset (Feb 7). The offset was silently ignored.
- `--reverse` didn't help: `tg msg list -- -1001731417779 --limit 10 --offset-id 102798196737 --reverse` also returned latest messages.
- `--max-id` same behavior: `tg msg list -- -1001731417779 --limit 5 --max-id 102797148161` also returned latest messages.
- All three variants ignored the offset and returned the most recent messages. Tested only on a supergroup (`-100` prefix chat ID). No error returned — just wrong results.

## Friction
- Had to fall back to `tg msg search "exact text" --context N` to get surrounding messages. This works but requires knowing the message text upfront — not always possible.

## Suggestions
- Fix `--offset-id` and `--max-id` for supergroups so navigation to arbitrary points in history works.
- If the offset is invalid or unsupported for a chat type, return an error instead of silently falling back to latest messages.
