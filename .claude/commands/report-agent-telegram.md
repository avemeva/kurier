Write a feedback report for the agent-telegram CLI based on what just happened in this conversation.

Look at the conversation history for any `bun tg` commands that were run (directly or via subagents). Focus on things worth reporting:

- **Bugs**: commands that returned wrong results, unexpected errors, crashes
- **Friction**: workarounds you had to use, commands that took too many steps
- **Missing features**: flags or commands that would have made the task easier
- **Surprising behavior**: anything that didn't match the SKILL.md docs

If the user provides additional context with this command, incorporate it: $ARGUMENTS

## Instructions

1. Read existing reports in `.claude/skills/agent-telegram/reports/` to avoid duplicating known issues
2. Write the report to `.claude/skills/agent-telegram/reports/<YYYY-MM-DD>-<slug>.md`
   - `<slug>` = 2-4 word kebab-case summary (e.g., `unread-triage`, `search-context-bug`)
3. Use this format:

```
# <Short title>

**Task**: <1-2 sentence description of what the user was trying to accomplish>
**Commands used**: dialogs, messages, search, ...

## Issues
- (bug or unexpected behavior — include exact command + error JSON)

## Friction
- (worked but painful — what workaround was needed)

## Suggestions
- (concrete improvement — specific flag, command, or behavior change)
```

4. Skip sections that don't apply. Don't pad with "everything worked great".
5. Keep it 5-15 lines. One report per invocation.
