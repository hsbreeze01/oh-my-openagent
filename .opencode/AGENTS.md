# .opencode/ — Project-Scope Skills & Commands

**Generated:** 2026-05-20

## OVERVIEW

Project-scope OpenCode configuration: 5 skills and 5 slash commands committed alongside the source. Picked up by [`src/features/opencode-skill-loader/`](file:///Users/yeongyu/local-workspaces/omo/src/features/opencode-skill-loader/) and the slash-command discovery pipeline.

**Relationship to `.agents/`:** `.agents/` is the migration target during the `oh-my-opencode` → `oh-my-openagent` rename. It is a SUPERSET of `.opencode/` (mirrors all 5 skills + adds 5 more, mirrors the 5 commands). Both directories load during the transition; consumers should prefer `.agents/`.

## SKILLS (5)

| Skill | Purpose |
|-------|---------|
| `work-with-pr/` | Full PR lifecycle skill: worktree → implement → atomic commits → PR → verification loop → merge. |
| `work-with-pr-workspace/` | Iteration workspace for `work-with-pr` — captures benchmark inputs for the iteration-* subdirs. |
| `github-triage/` | Read-only triage of issues + PRs. 1 item = 1 background task. Writes evidence-backed reports. Never takes GitHub actions. |
| `hyperplan/` | Adversarial multi-agent planning. 5 hostile category members cross-critique, lead synthesizes. |
| `pre-publish-review/` | Nuclear-grade 16-agent pre-publish release gate. Runs `/get-unpublished-changes`, spawns ultrabrain agents per change, oracle for synthesis. |

Each skill follows the standard layout (`SKILL.md` + optional `scripts/`, `references/`, `assets/`).

## COMMANDS (5 slash commands)

| Command | Purpose |
|---------|---------|
| `/get-unpublished-changes` | Compare HEAD with the latest published npm version and list unpublished changes. |
| `/omomomo` | Easter-egg command — about oh-my-opencode. |
| `/publish` | Publish via GitHub Actions workflow. Argument: `<patch|minor|major>`. |
| `/remove-deadcode` | Remove unused code with LSP-verified safety + atomic commits. |
| `/security-research` | Run the Team Mode security-research audit with 3 vulnerability hunters and 2 PoC engineers. |

## OTHER CONTENTS

- `background-tasks.json` — Runtime state for active background tasks (gitignored from sensitive content but tracked structurally).
- `bun.lock`, `package.json`, `node_modules/` — Skill dependencies (some skills install their own packages).
- `.gitignore` — Local scope ignore patterns.

## CONVENTIONS

- **Skill YAML frontmatter is mandatory.** [`opencode-skill-loader`](file:///Users/yeongyu/local-workspaces/omo/src/features/opencode-skill-loader/) rejects skills without `name` + `description`.
- **Project-scope > user-scope.** A skill at `.opencode/skills/X/` overrides `~/.config/opencode/skills/X/` of the same name.
- **Trigger words** in the skill description determine when OpenCode loads the skill. Be specific.
- **Commands are user-visible.** Name them with a leading `/` (the loader normalizes filename → command).

## TDD PIPELINE (4 skills, self-orchestrating)

When a PRD is submitted (via Dashboard or direct prompt), execute the full TDD pipeline automatically without asking the user. The pipeline is deterministic and self-looping:

```
PRD → [prd-to-acceptance] → acceptance-criteria.md
    → [test-generation]   → tests/ (all failing = RED)
    → [tdd-implementation] → src/ (iterate until GREEN)
    → [tdd-verification]  → PASS? → Done
                            → FAIL? → loop back to tdd-implementation
```

### Pipeline Skills

| Skill | Phase | Input | Output |
|-------|-------|-------|--------|
| `prd-to-acceptance/` | 1 — AC | PRD markdown | `acceptance-criteria.md` |
| `test-generation/` | 2 — Red | `acceptance-criteria.md` | `tests/*.test.ts` (all failing) |
| `tdd-implementation/` | 3 — Green | Failing tests | `src/` implementation (all passing) |
| `tdd-verification/` | 4 — Verify | Tests + AC + code | PASS or loop back |

### Orchestration Rules

1. **No human confirmation between phases** — pipeline runs end-to-end autonomously
2. **Each skill invokes the next** — output of one phase is input to the next
3. **Verification loop is unbounded** — keep iterating until all gates pass
4. **On PRD submission, always start with `prd-to-acceptance`** — do not ask "should I use TDD?"
5. **Work in the target project directory** — the directory passed via SSE `?directory=` parameter

### Triggers

The pipeline activates when:
- A PRD is pasted/submitted via Dashboard
- User says "start TDD", "run TDD pipeline", "implement this PRD"
- The `?directory=` parameter indicates a target project workspace

## ANTI-PATTERNS

- Never duplicate a built-in skill from `src/features/builtin-skills/` here without a clear reason.
- Never commit `background-tasks.json` contents that include session IDs or token secrets.
- Never write a skill that calls `session.promptAsync` directly — go through `dispatchInternalPrompt` (see root AGENTS.md "Internal message injection is dangerous").
