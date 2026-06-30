# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

## This project — Idle Adventure (POC)

A turn-based exploration RPG built as a "logistics puzzle on a grid": pack a loadout, drop onto a procedural 20×20 map, make routing/gather/fight/turn-back calls under an **energy + HP budget**, return, craft upgrades, go again. The POC validates exactly one thing — **is that loop fun?**

**Read first (in `docs/`):**
- `superpowers/specs/2026-06-30-idle-adventure-poc-core-loop-design.md` — the design (what + why), including the engine contract.
- `superpowers/plans/2026-06-30-poc-core-loop-plan.md` — milestone plan M0→M7.
- `decisions.md` — decision history (D1–D19, with rationale).
- `balance-levers.md` — every tunable is a named lever; tuning happens here.
- Full vision/notes: the user's Obsidian vault, `Project Ideas/idle adventures/`.

**Non-negotiables:**
- Engine is pure: `reduce(state, action) → {state, events}`, seed in state, no DOM / `Math.random` / `Date.now`, no imports from `render`/`sim`/`web` (lint-enforced).
- Items are `{defId, qty}` referencing a code-side catalog; no per-instance item state.
- No magic numbers in engine logic — read levers from `src/data/`.

Work is tracked in **beads** — run `bd ready` for the next unblocked task before writing code.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

## Architecture Overview

_Add a brief overview of your project architecture_

## Conventions & Patterns

_Add your project-specific conventions here_
