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

0. **Pre-flight: check console↔web parity FIRST (the #1 lesson).** The headless console can drift behind the game as mechanics change, and **a parity gap produces FALSE findings** — on 2026-07-06 the console mis-signposted combat (you engage by walking *onto* a monster, which it never listed) and hid the carry used/cap counter, so the headless agents "discovered" problems (combat unreachable, carry is a black box) that **did not exist in the web**. Before dispatching: skim what `bun run playtest` exposes vs what the web (`src/web/main.ts`) shows, especially for anything recently changed, and fix gaps (or note them) so agents aren't misled. A playtest is only as trustworthy as its interface fidelity.
1. **Decide the fleet.** Default **3 agents**, each on a different base seed (so maps/offers differ). **≥1 MUST drive the real web UI** — treat it as the *primary signal* (A\* pathfinding + the true human ergonomics); the headless-console agents are cheap parallel breadth. Scale up for a thorough pass, down for a quick check.
2. **Dispatch each agent** (parallel, background is fine) with: the interface rules, the hard no-lookups rule, the goal, and "report your playthrough: what you did, what you figured out, how far you got, where you got stuck." **Do NOT include the evaluation questions** — they must play unbiased.
3. **When an agent finishes, interrogate it with the questions** (below). Preferred: `SendMessage` the agent id so it reflects with its playthrough context intact. **If SendMessage isn't available** (it wasn't on 2026-07-06), fall back: dispatch a fresh *reflection* agent per playthrough, handing it that agent's **full, verbatim** playthrough report (don't condense — nuance lives in the specifics) as "your lived experience" + the questions. Ask *after* they play (unbiased); keep each agent's answers. Independent judgment across the fleet is the point.
4. **Aggregate — and EXPLICITLY compare interfaces (the highest-value step).** Before trusting any finding, cross-check it: **a complaint only the headless agents hit is suspect** (likely a console-parity or single-step-movement artifact, not a game problem) — confirm it against the web agent before filing it. Write a findings doc at `docs/<date>-playtest-findings.md` that leads with the **web-vs-headless comparison** (what's real vs artifact), then the verdict (iterate / pivot / ship), the convergent signals, and concrete follow-ups. File beads for the *real* ones; file separate beads for any console-parity gaps you found (so the next playtest is cleaner).

## The questions (ask verbatim, only after they've played)

Send these together, once, per agent:

1. Was it interesting?
2. Did the decisions you made actually matter — or would other choices have led to the same place?
3. Were there simple, thoughtless patterns you could repeat to win?
4. Did any novel ideas you tried have real impact?
5. Were the options available to you obvious, or did you have to discover them?
6. Was it fun for *you*?
7. Do you think it would be fun for a human player?
8. **If you could change 1–3 things to make it more fun, what would they be (ranked)?**

Ask for candid, specific answers with examples from their run — not diplomacy.

*How they've performed:* Q2 (decisions mattering) and Q3 (thoughtless patterns) are the workhorses — they consistently surface on-rails / grind problems. Q8 (ranked fixes) was added after v2 because agents *spontaneously* produced ranked fix-lists that were the single most actionable output — make it explicit. Q4 (novelty) is the weakest, but its *answers* ("novelty had nowhere to land") are still diagnostic, so keep it. Q7 forces the "would a human bounce?" judgment that agents otherwise soften.

## Notes & learnings (from the 2026-07-05 and -06 runs)

- **The web-vs-headless comparison is the whole methodology's payoff.** v1 (headless-only) produced two "critical" findings — combat unreachable, carry is a black box — that v2's web agent proved were *harness artifacts*. Without the web agent we'd have "fixed" non-problems. Never run headless-only.
- **Console single-step movement (no pathfinding) inflates "reach"/"tedium" complaints.** It's a harness artifact — the web agent + the `--reach` query counterbalance it. Discount headless-only tedium/reach gripes in the synthesis; don't file them as game findings.
- **File console-parity gaps as their own beads.** They're the difference between a trustworthy playtest and a misleading one — fix them between runs so findings sharpen over time.
- **Reflection is a real second step, and it works even without SendMessage** — but pass the *full* playthrough to the reflection agent, and keep the fleet's judgments independent (don't let one agent's report bias another's).
- **Orchestration is context-heavy for you** (dispatch N + reflect N + synthesize). Run play agents in the background and synthesize on completion; keep reflection prompts tight.
- The console is deterministic per seed; different seeds surface different maps/biomes/offers — that spread is the point. **Keep the fleet's seeds in the findings doc** so a run is reproducible.
