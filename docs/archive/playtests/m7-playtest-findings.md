# M7 Playtest Findings (agent hammer-test, 2026-07-05)

Two subagents stress-tested the build: one drove long headless multi-run games (economy/progression), one drove the live browser UI. Recorded here because `bd create` is currently blocked (beads DB has pending schema migrations v49→v53 it won't auto-apply on a remote-synced clone — needs the designated migrator). Convert these to beads once that's resolved.

## Status: the three big findings are FIXED (2026-07-05)

- **Map rotation (D32)** — candidate maps now rotate with `GameState.runs`; 100% of seeds reach iron/coal/mithril within ~30 visits (first mithril map by ~run 4). Blocker resolved.
- **Combat rebalance** — `MONSTER_TIER_DMG_CURVE` {1:2,2:5,3:11} + `HP_CURVE` {1:6,2:14,3:28}; iron `plate-*` cut to Σ6, steel Σ10, mithril Σ15. Iron-plated tier-3 is now brutal-but-survivable (both potions, ~5 HP), steel tames it, mithril trivializes — the climb pays off.
- **Monster blocking (D33)** — walking into a live monster forces the fight; A* routes around them. Routing-past is now a choice.
- **Food** — foraging OR hunting → rations (robust in every biome); committed sustainability stress test (15 all-tundra runs).

Remaining open: the food 0-energy dead-loop safety net (below), plus minors. Original findings kept below for the record.

## Blockers / majors (original — top 3 now fixed above)

- **[BLOCKER — FIXED] Candidate maps never rotate — tech tree unreachable for ~92% of seeds.** `candidateMaps(seed)` always returns the same 3 maps (`${seed}:map:{0,1,2}`, no run counter), so a seed's whole world is 3 fixed maps forever. Measured over 5000 seeds: only **70.6%** can ever craft an iron-pick, **40.4%** steel-pick, **8.0%** can ever mine mithril. Full mithril plate — the designed climax — is impossible for 92% of seeds. Cause: mithril is tundra-only at weight 1 (~0.24 nodes per 3-map world) and also needs coal (39.7% of seeds have none). *Fix options:* rotate/refresh candidate maps across runs (a world bigger than 3 maps); guarantee biome/coal/mithril coverage; raise mithril/coal weights + POI_DENSITY; or an alternate route to top-tier materials.

- **[MAJOR] Iron plate already trivializes combat — the coal→steel→mithril climb has no payoff.** T1 iron plate (iron-ore only, ~2 runs) floors every monster incl. both tier-3s to the chip-damage floor (ice-troll leaves you at 23/30). Steel/mithril buy ~+2 HP per tier against enemies already trivial; the affinity pull (silver↔werewolf) is moot because plain plate already wins. Violates the intent "early game requires choices; only hard-won top gear trivializes." *Fix:* steepen `MONSTER_TIER_DMG_CURVE`/`HP_CURVE` (esp. tier 3, now 7/24), and/or cut early `plate-*` defense so iron doesn't floor T3.

- **[MAJOR] Food soft-lock: 0-energy dead loop.** Packed food burns at embark (D23) and isn't banked back. Gather no herb/hide + bank none → every future embark is 0 energy, and a 0-energy expedition's only legal action is Return. Permanent, unrecoverable. Slips past the "legalActions never empty" invariant. *Fix:* reject/strongly-warn embark at 0 energy; a town forage fallback; a small energy floor; or refund unused food. (Partly overlaps existing bead `idle-adventure-4s4` "warn on zero-food embark".)

- **[MAJOR, tooling] The running `bun run web` server serves STALE code.** Bun bundles `index.html` once at startup and didn't pick up later edits — :3000 showed the OLD UI (raw names, 3-map chooser, no right-click). Fix: restart `bun run web` after web edits (HMR doesn't fire for edits made before the server started).

## Feature request (user)

- **Monsters should block movement / force a fight to pass.** Walking through a live monster tile should force combat, so routing around is a real choice. Proposed: A* avoids live-monster tiles; deliberately moving onto one triggers the fight (win = take tile + loot; lose = soft-fail). Decide interaction with the standalone `fight` action + legalActions; record as a decision.

## Minor / polish

- Loadout panel + slot/bank tooltips leaked raw defIds — **fixed** 2026-07-05 (all wrapped in `name()`).
- "a ore vein" / "a animal" article grammar — **fixed** (a/an).
- Cleared monster tile read as "worked-out node" — **fixed** (branches on monster).
- `chosenMap` re-rolls on refresh (Math.random, not persisted) — the about-to-embark biome can silently change. *Fix:* persist or derive from seed.
- Tundra generation is very ice-heavy (a rolled map was 98% ice) — flat, hard-to-read terrain; worth a glance at tundra terrain weights / noise banding.

## Positive

- **Engine is rock-solid.** 820,000 uniformly-random legal-action steps across 1000+ seeds: zero crashes, zero invariant violations (energy≥0, hp≥0, no NaN, carry within slotCap, in-bounds), and `legalActions` never drifted from `reduce` nor returned empty.
- Full UI loop verified live end-to-end (pack → embark → path-preview → walk (L/R/Walk) → mine/forage → tier-lock → monster panel → fight w/ auto-potion → return → craft → persistence → new-game). No console errors; no case where the UI offered something `reduce` rejected.
