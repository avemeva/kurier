# Supergroup search and message navigation issues

**Task**: Search for messages containing "подарите" from a specific user (Валидол) in a supergroup chat (Башня маркарянов) to summarize what he wanted for his birthday.
**Commands used**: find, search, messages, message

## Issues
- `tg search --from "Валидол"` silently returns no results. Display names are not supported — only numeric user IDs work. No error is returned, it just matches nothing.
- `tg message -1001731417779 43135270912` returns all-null fields for a supergroup message that exists (was found via `tg search`).
- `tg search --context 5` returned empty context array for one result (Oct 2023, id 43135270912) while working fine for other results in the same response.

## Friction
- `--offset-id` + `--reverse` and `--min-id`/`--max-id` on supergroups return latest messages instead of messages near the target ID. Had to fall back to `tg search "exact text" --context N` to get surrounding messages — works but requires knowing the message text upfront.
- No way to resolve a display name to a user ID from search results. Had to find the numeric ID by cross-referencing `--context` output (which shows `user:112588642` format) with the `name` field from non-context results.

## Suggestions
- `--from` should accept display names (fuzzy match against chat members), or at minimum return `INVALID_ARGS` when a non-numeric value doesn't resolve.
- `tg message` should work reliably with supergroup message IDs returned by `tg search`.
- Consider a `tg members --search "Валидол"` shortcut to quickly resolve display name to user ID.
