# Double-dash separator breaks flag parsing

**Commands used**: messages

## Issues

- `tg messages -- -1001731417779 --filter video --limit 3` returns 20 messages of all types (text, photo). The `--filter` and `--limit` flags are silently ignored.
- `tg messages -- -1001731417779 --limit 3` returns 20 messages. The `--limit` flag is ignored.
- Without `--`, `tg messages -1001731417779 --filter video --limit 3` works correctly: returns 3 video messages.
- The documentation recommends `--` for negative chat IDs, but using it silently drops all subsequent flags.

## Friction

- Worked around by omitting `--` (Bun/the arg parser apparently handles negative IDs fine without it). But this contradicts the documented recommendation.
- The `search` command does not need `--` because the chat ID is passed via `--chat` flag, not positionally. So `search --chat -100... --filter video` works perfectly.

## Suggestions

- Fix the arg parser so flags after `--` are still parsed (only positional args should change behavior after `--`).
- Or: remove the `--` recommendation from docs since it's not needed (negative IDs work fine without it).
