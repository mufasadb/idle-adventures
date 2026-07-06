---
name: blind-playtest
description: Run a blind multi-agent playtest of Idle Adventure to judge whether the loop is fun. Use when the user wants to playtest, evaluate fun/depth, check if decisions matter, or sanity-check the game after landing mechanics. Dispatches agents that play the real player-surface headlessly (no internals), aiming for the endgame artifact, then interrogates them on the experience.
---

# Blind Playtest

Dispatch fresh agents to play the game **blind** through the real player interface, then interrogate them about the experience. The point is to learn whether the core loop is *fun* and whether *decisions matter* — from players who discovered the game by playing it, not by reading the code.

## The interface agents may use — and ONLY this

Agents play headlessly via the player-console:

```
bun run playtest <seed> '<actions-json-array>'
```

It prints exactly what a real player sees and nothing more: current state (energy/hp/bank/loadout, energy as current/max), the **town offer** (3 candidate maps by biome; pocket to keep) + held **maps**, the full **recipe book** (every craftable output + ingredient names — but NOT where ingredients come from), the **perception-gated map** (node kinds always visible; a node's identity resolves only near you, as vague flavor), **legal actions**, and post-fight **matchup lessons**. To advance, append one action to the JSON array and re-run. To travel, repeat a `{"type":"move","to":{x,y}}` action — each move steps ONE tile toward the target, so append several. **Append `--reach`** to the command (e.g. `bun run playtest <seed> '<actions>' --reach`) to see the gear-adjusted energy cost to reach each node before committing to a long walk — use it when weighing a big move.

**Also run ≥1 agent on the REAL WEB UI** (not the console): start `bun ./src/web/index.html` and drive the browser with the `agent-browser` CLI. The web has A\* pathfinding (click a far tile → it routes + previews total energy on a shaded bar) and the exact human interface — so it removes the headless single-step / no-pathfinding confound and tests true human ergonomics. Run the web agent alongside the headless-console agents; compare their experiences.

**Hard rule for agents (put this in their prompt):** learn ONLY from console output. Do **not** read `src/`, `docs/`, `.beads/`, git history, or anything else in the repo — no looking up item stats, recipes' ingredient sources, monster stats, affinities, or the "answer." Discovering how the world works by playing it *is the test*.

## The goal you give agents (don't over-specify)

Tell them: *"There is an ultimate, rare end-game artifact to obtain. Figure out how to get it. Play as many expeditions as you think reasonable."* Do NOT name it, describe it, or hint at the path. Let them find (or fail to find) it.

## Protocol

1. **Decide the fleet.** Default **3 agents**, each on a different base seed (so maps/offers differ) — and make **≥1 of them drive the real web UI** (per above) while the rest use the headless console. Scale up for a thorough pass, down for a quick check.
2. **Dispatch each agent** (parallel, in one message) with: the interface rules above, the hard no-lookups rule, the goal, and "report your playthrough: what you did, what you figured out, how far you got, where you got stuck." **Do NOT include the evaluation questions** — they must play unbiased.
3. **When an agent finishes, interrogate it with the questions** (below). Preferred: `SendMessage` the agent id so it reflects with its playthrough context intact. **If SendMessage isn't available in the harness** (it wasn't on 2026-07-06), fall back: dispatch a fresh *reflection* agent per playthrough, handing it that agent's own full playthrough report as "your lived experience" + the questions. Either way, ask *after* they play (unbiased) and keep each agent's answers. Independent judgment across the fleet is the point.
4. **Aggregate** all agents' answers + playthroughs into a findings doc at `docs/<date>-playtest-findings.md` (mirror the style of any existing `*-playtest-findings.md`): the verdict (iterate / pivot / ship), the strongest signals across agents, and concrete lever/mechanic follow-ups. File beads for the real follow-ups.

## The questions (ask verbatim, only after they've played)

Send these together, once, per agent:

1. Was it interesting?
2. Did the decisions you made actually matter — or would other choices have led to the same place?
3. Were there simple, thoughtless patterns you could repeat to win?
4. Did any novel ideas you tried have real impact?
5. Were the options available to you obvious, or did you have to discover them?
6. Was it fun for *you*?
7. Do you think it would be fun for a human player?

Ask for candid, specific answers with examples from their run — not diplomacy.

## Notes

- Movement is single-step and headless (no pathfinding), so agents spend actions traveling — that friction is real but is *not* what we're testing; don't let it dominate the findings (flag it once if it bites).
- The console is deterministic per seed; different agents on different seeds surface different maps/biomes/offers — that spread is the point.
- Keep the fleet's seeds in the findings doc so a run is reproducible.
