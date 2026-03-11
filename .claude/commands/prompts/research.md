Research and plan an implementation topic. Produce a structured document that a follow-up agent can execute autonomously.

Argument: $ARGUMENTS (the topic or goal to research)

## Process

Work with the user iteratively. Do NOT generate the full document in one shot. Go section by section, confirm alignment, then move on.

### Phase 1: Understand what the user actually wants

Before writing anything, have a conversation to understand the user's goals. Ask questions about **behavior and outcomes**, not implementation. Do NOT jump to solutions.

Keep asking until you can clearly articulate: what should happen, for whom, and why it matters.

Ask about **behavior and outcomes**, not implementation. What should happen? What should the user see, do, experience? Do NOT ask about technologies, libraries, architectural choices, or problems with the current state. Continue the conversation until there are no ambiguities left about the desired behavior.

Once clear, distill into:

1. A one-paragraph goal statement (behavior, not implementation)
2. Concrete success criteria — commands, URLs, or observable checks that prove it works

Example:
```
## Goal
A person runs one command and gets a working Telegram CLI. No build tools, no dependencies, no second step.

Success criteria:
  agent-telegram --version      # binary starts
  agent-telegram doctor         # tdjson found, config found
  agent-telegram me             # live Telegram data returns
```

Present your draft, iterate until the user confirms.

### Phase 2: Map the architecture

Understand the system. Draw a diagram (ASCII) showing components and their relationships. List constraints, native dependencies, or anything that makes this problem non-trivial.

Example:
```
## Architecture

  browser → Next.js app → API routes → Postgres
                                      → Redis (cache)
                                      → S3 (uploads)

Constraints:
- Postgres requires pg_vector extension for embeddings
- S3 uploads need presigned URLs (no direct access)
```

### Phase 2.5: Define acceptance criteria

This is the most important part of the plan. Before breaking into steps, define the acceptance criteria for the entire goal. These are the checks that prove the whole thing works end-to-end.

Every criterion must be **mechanically verifiable by an agent** — a command to run, an output to expect, a file to inspect, a status code to check. The agent must be able to run the check and get an unambiguous pass/fail with no human judgment required.

Bad criteria (vague, requires human judgment):
- "Auth works correctly"
- "Performance is acceptable"
- "UI looks right"
- "Error handling is robust"

Good criteria (agent can run and verify):
- `curl -s localhost:3000/api/auth/login -d '{"email":"test@test.com"}' | jq .token` returns a non-empty string
- `time bun run build` completes in under 30 seconds
- `grep -r "className=" src/ | wc -l` returns 0 (no inline styles)
- `bun test --coverage | grep "All files"` shows >80%

Present criteria to the user and iterate. If a criterion can't be made mechanically verifiable, either make it more specific or split it into sub-criteria that can be.

### Phase 3: Break into steps

Decompose into numbered steps. Each step must have:

- A clear deliverable (not "investigate X" but "X works, verified by Y")
- Sub-tasks as a verification table
- Each sub-task's "How to verify" must be a concrete command or check the agent can run — same standard as acceptance criteria above

Example:
```
### Step 1: Database migration pipeline

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Migration CLI runs | `bun db:migrate` exits 0 | TODO |
| 1.2 | Rollback works | `bun db:rollback` reverts last migration, `bun db:migrate status` shows previous state | TODO |
| 1.3 | CI runs migrations | `gh run view --log` contains "Migrations complete" | TODO |
```

Order steps so earlier ones unblock later ones. Mark dependencies explicitly when they exist.

### Phase 4: Reference material

Identify what a future agent needs to know:

- **Key files** — table of file paths and why they matter
- **Reference implementations** — similar projects or patterns to follow, with what to take from each
- **Known pitfalls** — things you or the user already know will be tricky

Example:
```
## Context for future agents

### Key files
| File | Why |
|------|-----|
| `src/db/migrate.ts` | Migration runner, reads from migrations/ dir |
| `docker-compose.yml` | Local Postgres + Redis setup |

### Reference implementations
| Source | What to take |
|--------|-------------|
| Drizzle docs | Migration API, push vs generate |
| Project X's setup | Their docker-compose pattern for pg_vector |

### Lessons learned
1. pg_vector requires CREATE EXTENSION — can't do it in a migration without superuser
2. Bun's postgres driver doesn't support COPY — use INSERT batches
```

### Phase 5: Review and finalize

Present the complete document. Ask the user:
- Are the steps in the right order?
- Is anything missing?
- Are acceptance criteria tight enough for an agent to verify?

## Output

Write the final document to `docs/research/<topic-slug>.md`.

The document structure:

```markdown
# <Title>

## Goal
<one paragraph + success criteria>

## Architecture
<diagram + constraints>

## What's been done
<if applicable — files already created, decisions already made>

## TODO

### Step N: <deliverable>
| # | What | How to verify | Status |
|---|------|---------------|--------|
| N.1 | ... | ... | TODO |

## Target matrix
<if applicable — platforms, environments, configurations to support>

## Secrets / Config
<if applicable — env vars, tokens, API keys needed>

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. If you need user input or manual tasks (browser login, UI verification, etc.), use chrome extension MCP tools or agent-browser to do it yourself.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- <additional project-specific rules>

### Key files
| File | Why |
|------|-----|

### Reference implementations
| Source | What to take |
|--------|-------------|

### Lessons learned
1. <insight that prevents re-discovery>
```

## Rules

- Every claim about the codebase must be verified by reading files. Do not assume.
- Steps must be ordered by dependency. If step 3 requires step 2, say so.
- Acceptance criteria must be mechanically verifiable — a command to run, an output to check, a file to inspect. Not "works correctly" but "returns 200 with JSON body containing `id` field".
- Status is always one of: `TODO`, `DONE`, `ABANDONED` (with reason).
- Keep the document concise. No prose where a table works. No table where a one-liner works.
- Omit sections that don't apply (target matrix, secrets, etc.) — don't include empty placeholders.
- The document must be self-contained: an agent with no prior context should be able to pick it up and execute.
