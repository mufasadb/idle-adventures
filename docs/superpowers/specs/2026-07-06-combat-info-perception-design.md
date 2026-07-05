# Combat Info Rework — Passive Detail-Perception + Post-Fight Lessons

**Bead:** `idle-adventure-9u9.2` (epic `idle-adventure-9u9`, playtest follow-ups).
**Unblocks:** `idle-adventure-9h7` (spyglass what-if) — see §7.
**Supersedes:** **D11** ("spyglass pre-computes the exact outcome"). Record a new decision.

## 1. Problem

Three linked findings from the blind playtest:

1. **RED FLAG:** scout/spyglass returns the fully resolved outcome (`victory/hpLost/potionsUsed`) *before* you engage. You shouldn't see how a fight ends before committing — you should have to try and fail. (`reduce.scout` + the `scouted` event.)
2. The affinity / damage-type **lesson** is never taught: combat reports don't flag when an armour/weapon type interaction mattered, so players never learn the RPS system before the high-stakes boss.
3. Players can't **plan counters** from a qualitative matchup hint (damage type / countering gear) without being handed exact numbers.

## 2. Design goals

- **Information has two axes** — *range* (how far you can see) and *depth* (how much detail per tile). The bug is depth: scout grants max depth (the verdict) for free. Cap depth at qualitative; let tools grant range.
- Pre-fight: you may always learn a node's **kind**, and within range its **qualitative identity** (type/tier), enough to plan a counter — **never the fight outcome**.
- Post-fight: teach *why* it went the way it did (the RPS interaction + affinity discovery).
- Engine exposes **structured facts**; the render layer flavors them ("if you know, you know"). Keeps it testable and keeps the vibe.
- Pure, deterministic, no dead code for a future "active scout" (reintroduce if needed).

## 3. Perception model (engine)

**Fog is on *detail*, not *layout*.** Terrain and node *kinds* stay fully visible from the start (routing/topology unaffected). What's range-gated is a node's identity + matchup detail.

New pure module `src/engine/perceive.ts`:

```ts
export type PoiDetail = {
  tier: number;
  dmgType?: DmgType;        // monster only
  armourType?: ArmourType;  // monster only
  creature?: string;        // monster only
  material?: string;        // gatherable only
};
export type PerceivedPoi = { x: number; y: number; kind: NodeType; detail: PoiDetail | null };

export function perceive(grid: Grid, playerPos: Coord, tools: string[]): PerceivedPoi[];
```

- `detail` is populated **iff** the POI is within the effective detail radius; otherwise `null` (kind known, identity not).
- Effective radius = `DETAIL_RADIUS + Σ VISION_RANGE_BONUS[tool]` over equipped tools (Chebyshev).
- `detail` carries **structured facts only — never an outcome field.** Affinities are omitted (they stay discoverable; revealed post-fight, §4).
- Already-cleared POIs still report (kind + detail if in range) so the map reads consistently; callers filter by `cleared` as today.
- The sim/AI reads `perceive()` directly ("you can see more" = the structured facts); the human UI flavors it (§5).

**New levers** (`src/data/constants.ts`), replacing the scout levers:
- `DETAIL_RADIUS = 2` (Chebyshev base perception).
- `VISION_RANGE_BONUS: Record<string, number> = { spyglass: 3 }` — additive per equipped tool (data-driven like `TERRAIN_GATE`; future glasses/cartography/"tree-sniffing dog" slot in here). Spyglass → radius 5.
- **Removed:** `SCOUT_ENERGY_COST`, `SCOUT_RADIUS`, `SCOUT_TOOL`.

## 4. Post-fight lessons (teach why)

New pure helper in `src/engine/combat.ts`:

```ts
export type Matchup = {
  weaponVsHide: number | null;              // DMG_ARMOUR_MATRIX[weaponType][monsterArmour]; null if unarmed
  affinityFired: boolean;                    // a hidden affinity triggered (the discovery channel)
  armourVsAttack: "resisted" | "neutral" | "exposed"; // how the player's armour fared vs monster dmgType
};
export function explainMatchup(loadout: Loadout, monsterId: string): Matchup;
```

- `weaponVsHide` — reuse the matrix lookup already in `playerDamage`. *Was my weapon the right type?*
- `affinityFired` — the same `AFFINITIES.some(...)` test `playerDamage` runs, surfaced. **This is how affinities are discovered** — the one fact `perceive` hides pre-fight.
- `armourVsAttack` — classify the average `DMG_ARMOUR_MATRIX[monsterDmgType][pieceArmour]` over equipped armour pieces: `< 1 → "resisted"`, `> 1 → "exposed"`, else `"neutral"`. No armour → `"neutral"`.

The `fought` event gains `matchup: Matchup`. Emitted **always** (win or loss) — no stakes gate; early fights are simply where each lesson first appears. It reinforces the same facts `perceive` teased, now with outcome context.

## 5. Human presentation (render layer)

Engine returns facts; `src/render/render.ts` (+ web) maps them to vague, systematic flavor generated from the facts (new monsters get flavor for free; per-creature overrides possible later):

- **Perceived monster** (in range): `dmgType`/`armourType`/`tier` → oblique text, e.g. magic → *"an odd sheen ripples off its skin"*, plate → *"a thick, scaled hide"*, tier → size word. Out of range: *"a monster"* (kind only). Gatherable in range: material name (+ tier); out of range: *"a mining node"* etc.
- **Post-fight lessons** (0–2 salient lines from `matchup`): `weaponVsHide < 1 → "your blade skated off its hide"`; `> 1 → "you found the gap in its guard"`; `affinityFired → "something in your weapon savaged it"`; `armourVsAttack:"exposed" → "its magic tore through your plate"`; `"resisted" → "your armour turned the blows aside"`.

## 6. Teardown (no dead code)

- `Action` `{type:"scout"}` and `GameEvent` `"scouted"` — delete (`src/engine/types.ts`).
- `scout()` + `case "scout"` — delete (`src/engine/reduce.ts`).
- `candidates.push({type:"scout"})` — delete (`src/sim/legal.ts`).
- Scout button, `scouted` log line, `canScout` — replace with passive perception + hover detail (`src/web/main.ts`).
- Scout log handling in `src/sim/report.ts` if present — delete.
- `test/reduce-scout.test.ts` — delete; add `test/perceive.test.ts` and matchup tests.
- Spyglass stays a craftable tool: `TOOL_CAPABILITY.spyglass = "vision"`, `TOOL_QUALITY.spyglass = 1` (catalog invariant); it drives range via `VISION_RANGE_BONUS`.

## 7. 9h7 relationship

Deferring 9h7 was correct: this rework defines the ceiling (qualitative-only pre-fight, outcome never). Once shipped, revisit 9h7 — a "what-if" that surfaces *which gear type* would help (qualitative, e.g. "a magic weapon would bite deeper") fits this model; a what-if that surfaces a flipped *numeric outcome* does not. Re-scope 9h7 against this spec when it comes up.

## 8. Out of scope

- Active/energy-cost scout (reintroduce later if wanted; no scaffolding now).
- Bigger grid (stays 20×20).
- Per-creature bespoke flavor overrides (systematic facts→flavor is enough for the POC).
- Cartography / category-vision items ("tree-sniffing dog") — the `VISION_RANGE_BONUS` shape anticipates them; content lands later.
- Town-side `PREVIEW_FIDELITY` (a different phase, before embark) — untouched.

## 9. Testing

- `perceive`: in-range POI has `detail`, out-of-range has `null`; spyglass extends the radius; `detail` never contains an outcome field; monster vs gatherable payload shape; determinism (pure fn of grid/pos/tools).
- `explainMatchup`: right-type weapon → `weaponVsHide > 1`; wrong-type → `< 1`; affinity pairing → `affinityFired`; magic-vs-plate → `"exposed"`, ranged-vs-plate → `"resisted"`.
- `legalActions` no longer emits `scout`; exhaustive-switch consumers still compile after the union shrinks.
- `fought` event carries `matchup` (fight-reducer + combat tests).
- Render/snapshot refresh for the new log lines.
- Full gates: `bun test` + `bun run typecheck` + `bun run lint`, **and re-run `test/harness-sustainability.test.ts`** (removing scout's energy cost shifts the economy).
- Update `docs/decisions.md` (supersede D11) and `docs/balance-levers.md` (new vision levers).
