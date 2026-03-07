# Skill Security Audit — Reducing Risk Score

## Goal

The agent-telegram skill on skills.sh currently scores **HIGH / FAIL**. Lower it to **SAFE / Pass** (or at minimum MEDIUM) by addressing the audit findings from all three scanners.

## Current audit results

### Gen Agent Trust Hub — FAIL (HIGH)

| Finding | Category |
|---------|----------|
| Installation instructions pipe remote shell scripts into bash/PowerShell | REMOTE_CODE_EXECUTION |
| `eval` command enables arbitrary JavaScript execution | COMMAND_EXECUTION |
| Indirect prompt injection: ingestion via `msg list`/`listen`, no boundary markers, no sanitization | PROMPT_INJECTION |
| Downloads CLI + TDLib binaries from GitHub/npm | EXTERNAL_DOWNLOADS |

### Snyk — FAIL (HIGH)

| Code | Severity | Score | Finding |
|------|----------|-------|---------|
| W007 | HIGH | 0.90 | Auth commands accept codes/passwords as CLI args — agent must put secrets verbatim in commands |
| W011 | MEDIUM | 1.00 | Third-party content exposure — untrusted Telegram messages can drive agent actions |

### Socket — PASS

All 4 categories passed (malicious behavior, security concerns, obfuscation, suspicious patterns). No action needed.

## Comparison: agent-browser (SAFE / Pass)

agent-browser has similar capabilities (eval, untrusted content, credential handling) but scores SAFE. Key differences:

| What | agent-browser | agent-telegram |
|------|---------------|----------------|
| `allowed-tools` in frontmatter | `Bash(npx agent-browser:*), Bash(agent-browser:*)` | Missing |
| Security section in SKILL.md | Yes — content boundaries, domain allowlist, action policy, output limits | None |
| Content boundary markers | `--content-boundaries` flag with nonce-based markers | Not documented |
| Credential handling | `--password-stdin` + auth vault, SKILL.md says "LLM never sees password" | Secrets as positional CLI args |
| eval docs | Present but scoped by `allowed-tools` | Present, unscoped |

agent-browser still gets flagged for COMMAND_EXECUTION, PROMPT_INJECTION, etc. — but the presence of documented mitigations keeps the overall score at SAFE.

---

## Plan

### Step 1: Add `allowed-tools` to SKILL.md frontmatter ✅

```yaml
allowed-tools: Bash(agent-telegram:*)
```

| # | What | Status |
|---|------|--------|
| 1.1 | Add `allowed-tools` to SKILL.md frontmatter | DONE |

### Step 2: Add Security section to SKILL.md ✅

| # | What | Status |
|---|------|--------|
| 2.1 | Add Security section with untrusted content rules | DONE |
| 2.2 | Document content boundaries (JSON field structure) | DONE |
| 2.3 | Add eval guardrails (never from message content) | DONE |
| 2.4 | Add destructive action confirmation rule | DONE |

### Step 3: Interactive auth flow ✅

| # | What | Status |
|---|------|--------|
| 3.1 | Pick prompt library (clack, inquirer, or prompts) | DONE — @clack/prompts |
| 3.2 | Add `login` top-level command with interactive flow | DONE |
| 3.3 | If already authenticated, show current user and exit | DONE |
| 3.4 | Password/code inputs masked (no echo) | DONE |
| 3.5 | Remove old `auth phone/code/password` subcommands | DONE |
| 3.6 | Update SKILL.md — auth section shows only `login` | DONE |
| 3.7 | Update `references/installation.md` auth section | DONE |

### Step 4: Reorder install methods in docs ✅

| # | What | Status |
|---|------|--------|
| 4.1 | Reorder SKILL.md setup section: npm/brew first, curl/ps1 second | DONE |
| 4.2 | Reorder `references/installation.md`: same | DONE |
| 4.3 | Reorder `apps/cli/README.md`: same | DONE |

### Step 5: Release v0.1.16 ✅

| # | What | Status |
|---|------|--------|
| 5.1 | Bump version to 0.1.16 | DONE |
| 5.2 | Push tag, CI builds + publishes to npm/brew/GitHub | DONE — all 19 jobs green |
| 5.3 | Skill repo updated | DONE |

### Step 6: Skill repo architecture ✅

Source of truth: `skills/agent-telegram/` in the monorepo. Standalone `avemeva/agent-telegram` repo for fast skill installation via `npx skills add`.

CI syncs monorepo → standalone repo using `rsync --delete` (no stale files). Previous approach (additive `cp -r`) caused stale files like WRITING_STYLE.md to linger.

Third-party skills in `.claude/skills/` marked `metadata.internal: true` so they don't leak into `npx skills add` discovery.

| # | What | Status |
|---|------|--------|
| 6.1 | Skill source of truth in `skills/agent-telegram/` | DONE |
| 6.2 | Symlink `.claude/skills/agent-telegram` → `../../skills/agent-telegram` | DONE |
| 6.3 | Standalone `avemeva/agent-telegram` repo for skill install | DONE |
| 6.4 | CI sync via `rsync --delete` in publish.yml | DONE |
| 6.5 | Third-party skills marked `internal: true` | DONE |
| 6.6 | `npx skills add avemeva/agent-telegram` discovers only 1 skill | VERIFIED |

### Step 7: Restructure SKILL.md (agent-browser pattern) ✅

| # | What | Status |
|---|------|--------|
| 7.1 | Restructure SKILL.md sections to match agent-browser pattern | DONE |
| 7.2 | Sync all commands with `--help` output | DONE |
| 7.3 | Add missing `media caption` command | DONE |
| 7.4 | Verify Security section preserved | DONE |
| 7.5 | Verify no `auth phone/code/password` references | DONE |

### Step 8: Set up kurier.sh domain ✅

Vercel project `kurier-sh` with `landing/vercel.json` redirects. Custom domain `kurier.sh` added and working.

| # | What | Status |
|---|------|--------|
| 8.1 | Create Vercel project with redirect rules | DONE — `landing/vercel.json` |
| 8.2 | Deploy to Vercel | DONE |
| 8.3 | Add `kurier.sh` custom domain | DONE |
| 8.4 | Verify redirects work | DONE — `curl -fsSL https://kurier.sh/install` returns script |
| 8.5 | Update install docs to use `https://kurier.sh` URLs | DONE |
| 8.6 | Update install scripts (install.ps1, install.cmd) | DONE |
| 8.7 | Update CI workflow URLs | DONE |

### Step 9: Release v0.1.17

| # | What | Status |
|---|------|--------|
| 9.1 | Add `SKILL_REPO_TOKEN` secret to kurier repo | TODO |
| 9.2 | Bump version to 0.1.17 | TODO |
| 9.3 | Push tag, CI builds + publishes | TODO |

### Step 10: Post-release verification

Every item below is verified against the **live release**, not source files.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 10.1 | CI publish completes green | `gh run list --limit 1` | TODO |
| 10.2 | npm install gives 0.1.17 | `npm i -g @avemeva/agent-telegram && agent-telegram --version` | TODO |
| 10.3 | kurier.sh curl install gives 0.1.17 | `curl -fsSL https://kurier.sh/install \| bash && agent-telegram --version` | TODO |
| 10.4 | Skill repo synced (commit msg has kurier SHA) | `gh api repos/avemeva/agent-telegram/commits?per_page=1` | TODO |
| 10.5 | Skill repo has no stale files (only SKILL.md + references/) | `gh api repos/avemeva/agent-telegram/git/trees/main` | TODO |
| 10.6 | `npx skills add avemeva/agent-telegram --list` → 1 skill | Run in /tmp | TODO |
| 10.7 | Installed SKILL.md has Security section | Read installed file | TODO |
| 10.8 | Installed SKILL.md has no Feedback section | Read installed file | TODO |
| 10.9 | Installed SKILL.md has no `auth phone/code/password` | Read installed file | TODO |

### Step 11: Verify scanner results

Depends on skills.sh re-scanning `avemeva/agent-telegram` — outside our control.

| # | What | Status |
|---|------|--------|
| 11.1 | Check Gen Agent Trust Hub | TODO |
| 11.2 | Check Snyk | TODO |
| 11.3 | Check Socket (maintain Pass) | TODO |

---

## Acceptance criteria

### Scanner targets

| Scanner | Current | Target |
|---------|---------|--------|
| Gen Agent Trust Hub | FAIL (HIGH) | SAFE or Pass |
| Snyk | FAIL (HIGH) — W007+W011 | Pass or LOW |
| Socket | Pass | Pass (maintain) |

### Specific findings

| Finding | Current | Target |
|---------|---------|--------|
| REMOTE_CODE_EXECUTION | Flagged | Reduced (npm/brew first, curl via kurier.sh secondary) |
| COMMAND_EXECUTION (eval) | Flagged, no mitigations | Flagged but mitigated (Security section + allowed-tools) |
| PROMPT_INJECTION | Flagged — no boundaries, no sanitization | Mitigated — Security section with rules + content boundaries |
| EXTERNAL_DOWNLOADS | Flagged | Reduced (package managers primary) |
| W007 (credentials) | HIGH 0.90 | Resolved — interactive `login`, no secrets in CLI args |
| W011 (third-party content) | MEDIUM 1.00 | Mitigated — Security section documents handling |

---

## Key files

| File | What changes |
|------|-------------|
| `skills/agent-telegram/SKILL.md` | Restructured, synced with --help, Security section preserved |
| `skills/agent-telegram/references/installation.md` | Install URLs use https://kurier.sh |
| `apps/cli/README.md` | Install URLs use https://kurier.sh |
| `install.ps1` | URLs use https://kurier.sh |
| `install.cmd` | URLs use https://kurier.sh |
| `.github/workflows/publish.yml` | Skill repo sync via rsync --delete, install URLs updated |
| `.claude/skills/*/SKILL.md` | Third-party skills marked `metadata.internal: true` |
| `landing/vercel.json` | Redirect rules for kurier.sh |

---

## Context

### What we're NOT doing (and why)

- **Not removing `eval` from SKILL.md** — it's a legitimate feature. agent-browser has eval too and scores SAFE. The fix is mitigations, not removal.
- **Not replacing `curl | bash` with a two-step download** — functionally identical, our install script already does SHA256 verification. That would be concealment, not a fix. We lead with package managers instead.
- **Not hiding install instructions** — the scanner reads the docs. We reorder to lead with safer methods, but we don't remove alternatives.
- **Not using `--stdin` for auth** — piping secrets via echo is marginally better but still awkward. Interactive prompts with masked input (like `create-next-app` style) are genuinely better UX and security.

### What agent-browser does that we copied

1. `allowed-tools` frontmatter — scopes tool access ✅
2. Security section — documents content boundaries, guardrails ✅
3. Interactive credential flow — agent never handles secrets ✅
4. Mitigations near dangerous patterns — scanner sees guardrails next to risks ✅
5. Standalone skill repo — fast clone for `npx skills add` ✅
6. Section ordering — Core Workflow → Commands → Patterns → Security → Advanced ✅

### How skills.sh discovery works

- `npx skills add owner/repo` clones the repo and scans for SKILL.md files in known directories (`skills/`, `.claude/skills/`, etc.)
- `metadata.internal: true` in SKILL.md frontmatter hides skills from discovery unless `INSTALL_INTERNAL_SKILLS=1` is set
- skills.sh website auto-discovers repos (no registration needed for the CLI, but the directory listing may require an issue on `vercel-labs/skills`)
- `npx skills find <query>` searches the skills.sh directory

### kurier.sh redirect approach

Vercel `vercel.json`-only project with redirect rules. Custom domain `kurier.sh` assigned. Redirects `/install`, `/install.ps1`, `/install.cmd` to GitHub raw URLs. Root `/` redirects to GitHub repo.

### Skill repo sync

Source of truth: `skills/agent-telegram/` in `avemeva/kurier`.
Published to: `avemeva/agent-telegram` (standalone repo for fast install).
Sync mechanism: `rsync -a --delete --exclude='.git'` in CI publish job.
Previous broken mechanism: additive `cp -r` overlay that left stale files.

### Scanner audit pages

| Scanner | URL |
|---------|-----|
| Gen Agent Trust Hub | `skills.sh/avemeva/agent-telegram/security/agent-trust-hub` |
| Snyk | `skills.sh/avemeva/agent-telegram/security/snyk` |
| Socket | `skills.sh/avemeva/agent-telegram/security/socket` |

### CI secret required

`SKILL_REPO_TOKEN` — GitHub PAT with repo write access to `avemeva/agent-telegram`. Needed for the skill repo sync step in publish.yml.
