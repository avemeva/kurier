Root cause analysis using the 5 Whys technique.

When stuck on a problem, do NOT patch or hotfix. Instead:

## Process

1. **State the problem.** What exactly is failing? Include the error, unexpected behavior, or broken invariant.

2. **List assumptions.** Write out every assumption you're currently making — about the code, the environment, the data, the types, the execution order. Label each `[verified]` or `[unverified]`.

3. **Verify unverified assumptions.** Read code, run commands, check values. Convert each to `[verified]` or `[disproven]`. Disproven assumptions are often the root cause.

4. **5 Whys.** Starting from the problem, ask "why?" iteratively:
   - Why does X happen? → Because Y. `[fact/assumption/inference]`
   - Why does Y happen? → Because Z. `[fact/assumption/inference]`
   - Continue until you hit a root cause you can act on (minimum 3, aim for 5).
   - Each answer must be verified before proceeding to the next why.

5. **Root cause statement.** One sentence: "The root cause is ___."

6. **Fix at the root.** The fix should address the root cause, not any intermediate symptom. If the fix is a patch at a symptom level, restart from step 4.

## Rules

- Never propose a fix before completing the 5 Whys.
- If a "why" answer is an assumption, verify it before continuing.
- If you can't go deeper, say so — don't fabricate causes.
- Output the full chain so the user can follow your reasoning.
