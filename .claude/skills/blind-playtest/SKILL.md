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

It prints exactly what a real player sees and nothing more: current state (energy/hp/bank/loadout, energy as current/max), the **town offer** (3 candidate maps by biome; pocket to keep) + held **maps**, the full **recipe book** (every craftable output + ingredient names — but NOT where ingredients come from), the **perception-gated map** (node kinds always visible; a node's identity resolves only near you, as vague flavor), **legal actions**, and post-fight **matchup lessons**. To advance, append one action to the JSON array and re-run. **To move, YOU plan the route** (eot/D74 — routing efficiently is the game, not a solver's job): append a `{"type":"route","waypoints":[{x,y},…]}` directive — each leg walks a STRAIGHT line from the previous point (it does NOT route around walls), auto-gathering nodes it crosses, and stops at the first wall/monster/full-bag, reporting where; then re-plan the next leg around the obstacle yourself. (A single `{"type":"move","to":{x,y}}` still steps ONE tile toward the target.) **Append `--reach`** to the command (e.g. `bun run playtest <seed> '<actions>' --reach`) to see the gear-adjusted energy cost to reach each node before committing to a long walk — use it when weighing a big move.

**Also run ≥1 agent on the REAL WEB UI** (not the console): start `bun ./src/web/index.html` and drive the browser with the `agent-browser` CLI. The web uses the SAME direct-line + waypoint routing as the console `route` directive (eot/D74 — click draws a straight line, click again to add a waypoint, click a tile on the line to unwind to it; a leg crossing a wall shows a red ✗ and disables Walk; the energy bar previews walk + auto-gather cost). This is the exact human interface — run the web agent alongside the headless-console agents and compare their experiences. Routing friction is now a REAL game mechanic on both surfaces, not a harness artifact.

**Hard rule for agents (put this in their prompt):** learn ONLY from console output. Do **not** read `src/`, `docs/`, `.beads/`, git history, or anything else in the repo — no looking up item stats, recipes' ingredient sources, monster stats, affinities, or the "answer." Discovering how the world works by playing it *is the test*.

## The goal you give agents (don't over-specify)

Tell them: *"There is an ultimate, rare end-game artifact to obtain. Figure out how to get it. Play as many expeditions as you think reasonable."* Do NOT name it, describe it, or hint at the path. Let them find (or fail to find) it.

## Protocol

0. **Pre-flight: check console↔web parity FIRST (the #1 lesson).** The headless console can drift behind the game as mechanics change, and **a parity gap produces FALSE findings** — on 2026-07-06 the console mis-signposted combat (you engage by walking *onto* a monster, which it never listed) and hid the carry used/cap counter, so the headless agents "discovered" problems (combat unreachable, carry is a black box) that **did not exist in the web**. Before dispatching: skim what `bun run playtest` exposes vs what the web (`src/web/main.ts`) shows, especially for anything recently changed, and fix gaps (or note them) so agents aren't misled. A playtest is only as trustworthy as its interface fidelity.
0b. **Pre-flight: guarantee the WEB agents test the CURRENT build (2026-07-10 — this invalidated a whole run).** The web is served by bun's HMR dev server and driven through a shared, caching browser. In v5 **both** web agents ran **stale cached bundles**: one crashed on a non-bug (`slotOf` undefined), the other reported a just-shipped feature "does not exist." The headless console dodges this (fresh process per `bun run playtest` call), so console-vs-web disagreement about *whether a feature exists* is the tell. Mandatory mitigations, baked into every web agent's prompt: **(a)** start a FRESH server (`pkill -f "src/web/index.html"` first) on a **distinct `--port`** per agent (concurrent agents can't share :3000); **(b)** load with a cache-buster EVERY time — `agent-browser open "http://localhost:<port>/?cb=<random>"`; **(c)** a **build-freshness self-check before playing** — verify a known-current string is present (e.g. a recipe/label you just shipped appears in the recipe book); if it's missing, the bundle is stale — restart the server + hard-reload, don't play a ghost build. A web finding that contradicts the console on feature *existence* is a stale-bundle artifact until proven otherwise.
1. **Decide the fleet.** Default **3 agents**, each on a different base seed (so maps/offers differ). **≥1 MUST drive the real web UI** — treat it as the *primary signal* (A\* pathfinding + the true human ergonomics); the headless-console agents are cheap parallel breadth. Scale up for a thorough pass, down for a quick check.
2. **Dispatch each agent** (parallel, background is fine) with: the interface rules, the hard no-lookups rule, the goal, "report your playthrough: what you did, what you figured out, how far you got, where you got stuck," AND **1–2 targeted probe questions tied to what just shipped** (e.g. after ranged combat landed: "did you consider the bow line? why/why not?"). The generic questions come later; these directed probes were the single highest-signal output of the v3 run — a convergent 3/3 answer on the bow's invisibility drove the whole follow-up. **Do NOT include the 8 evaluation questions** — those must stay unbiased until after play. Playtests are long (20–40+ min/agent); expect **interruptions** (session limits, API overload). Runs are **resumable**: an agent stopped mid-play still has its transcript — `SendMessage` its agentId with "resume; wrap up and report from what you've experienced." Tell agents up front to keep running notes so a forced early report is still rich. Don't restart from scratch.
3. **When an agent finishes, interrogate it with the questions** (below). Preferred: `SendMessage` the agent id so it reflects with its playthrough context intact — this worked cleanly in v3 (SendMessage resumes a *completed* background agent from its transcript too, so the fallback below is rarely needed now). **If SendMessage isn't available** (it wasn't on 2026-07-06), fall back: dispatch a fresh *reflection* agent per playthrough, handing it that agent's **full, verbatim** playthrough report (don't condense — nuance lives in the specifics) as "your lived experience" + the questions. Ask *after* they play (unbiased); keep each agent's answers. Independent judgment across the fleet is the point.
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

## Notes & learnings (from the 2026-07-05, -06, -08, and -09/10 runs)

- **(v5, 2026-07-10) The web harness's stale-bundle failure is the new #1 trust risk — worse than console parity because it's SILENT and bidirectional.** Both v5 web agents ran cached bundles: one "found" a game-breaking crash, the other "found" a shipped feature missing. Neither was real. **A web claim that a feature is absent/broken, when the console shows it present/working, is a stale-bundle artifact until you reproduce it on a fresh cache-busted server.** See Protocol step 0b — the fix is prevention (fresh server + `?cb=` + a build self-check in the agent's prompt), and at synthesis, cross-check every web "critical" against a fresh manual repro before filing. This means the web agent is the primary signal for *ergonomics/fun* but NOT automatically for *"does X exist"* — the console (fresh per call) is the more reliable existence oracle.
- **(v5) A stale-bundle web agent still yields valid loop/ergonomics signal** if the loop itself ran — v5's web-B fought monsters and gave the session's deepest finding (free-return removes the turn-back call) even though its bundle lacked the newest feature. Salvage the parts that don't depend on the missing code; discount the parts that do.


- **(v3) Targeted per-agent probes beat generic questions.** After a feature ships, ask each agent directly whether it engaged with that feature and why/why-not. In v3 all three independently said they saw the bow line and skipped it for the *same* reason (its payoff was invisible vs melee's printed numbers) — a convergent verdict that generic "was it fun?" never surfaces, and it pointed straight at a ≤1-sentence fix rather than a rebalance.
- **(v3) Convergence is the signal to trust; divergence is the signal to dig.** When N blind agents reach the *same* conclusion by different routes, file it with confidence. When they split (bravo hit a coal wall in deserts, alpha found coal fine in tundra), the truth is usually a legibility gap, not a systems flaw — check the data tables before filing.
- **(v3) Runs are long and interruptible — design for resumption.** Agents will be cut off by limits/overload; `SendMessage <agentId>` resumes from transcript (even a *completed* one). Tell agents to keep incremental notes so a forced early report is still usable. Never restart a mid-run agent from scratch.

- **The web-vs-headless comparison is the whole methodology's payoff.** v1 (headless-only) produced two "critical" findings — combat unreachable, carry is a black box — that v2's web agent proved were *harness artifacts*. Without the web agent we'd have "fixed" non-problems. Never run headless-only.
- **(Superseded by eot/D74) Routing is now a REAL game mechanic on BOTH surfaces — treat routing findings as SIGNAL, not artifact.** The old warning here said single-step console movement (vs web A\*) inflated "reach"/"tedium" complaints that should be discounted. That no longer holds: neither surface auto-routes — the console `route {waypoints}` directive and the web both draw straight legs the player plans, stopping at walls to re-plan. So route friction, dead-ends, and "planning the path is tedious/fun" are legitimate findings to file, not harness noise. The one residual artifact to still discount: a bare `{"type":"move"}` spammer that hand-steps one tile at a time instead of using `route` is fighting the harness, not the game — nudge those agents to plan with `route` and re-judge. Use `--reach` to weigh a long leg before committing.
- **File console-parity gaps as their own beads.** They're the difference between a trustworthy playtest and a misleading one — fix them between runs so findings sharpen over time.
- **Reflection is a real second step, and it works even without SendMessage** — but pass the *full* playthrough to the reflection agent, and keep the fleet's judgments independent (don't let one agent's report bias another's).
- **Orchestration is context-heavy for you** (dispatch N + reflect N + synthesize). Run play agents in the background and synthesize on completion; keep reflection prompts tight.
- The console is deterministic per seed; different seeds surface different maps/biomes/offers — that spread is the point. **Keep the fleet's seeds in the findings doc** so a run is reproducible.
