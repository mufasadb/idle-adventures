# Combat Alive (si7.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make combat matter at every tier — percentage mitigation that never floors damage, tier-1 fights that cost matchup-scaled HP, a full type-spread roster in every biome, and multi-round engagements with fight/quaff/flee decisions.

**Architecture:** Pure-engine changes: `combat.ts` gains `damageTaken` (the % formula) and `strikeExchange` (one pure round); `resolveCombat` becomes a loop over `strikeExchange` (atomic API preserved for tests/forecasts). The reducer gains an `Engagement` on the expedition (`expedition.combat`), three actions (`flee`/`quaff`/`toggle-auto-quaff`), and an `engaged` rejection guard on non-combat actions. Roster/weights are data-only.

**Tech Stack:** bun (`bun test`), TypeScript strict, ESLint flat config (engine-purity boundary).

**Spec:** `docs/superpowers/specs/2026-07-06-combat-alive-design.md`
**Beads:** Task 1–2 = `idle-adventure-si7.1.1` · Task 3–4 = `si7.1.2` · Task 5 = `si7.1.3`. Strictly sequential — every task depends on the previous.

## Global Constraints

- Engine purity: nothing under `src/engine/` imports from `render`/`sim`/`web` or uses `Math.random`/`Date.now`/DOM (verified by `test/boundary.test.ts`).
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- Zero RNG in fight math — combat outcomes are pure functions of (loadout, hp, monsterId, engagement state); `legalActions` (D29) filters candidates through speculative `reduce` and must keep working.
- Exact lever values (pre-derived, verified by pinned tests): `MITIGATION_K = 6`; `MONSTER_TIER_DMG_CURVE = {1: 4, 2: 8, 3: 14, 4: 24}`; `MONSTER_TIER_HP_CURVE = {1: 8, 2: 16, 3: 28, 4: 54}`.
- Pinned invariants: Wyrm kill = full mithril plate + mithril-sword + **3** greater-potions wins / **2** dies; sustainability harness passes UN-EDITED; `wyrmfang` (×2 dragon) keeps the Wyrm farmable (≤ ~27 HP toll).
- Toll bands (bare kit vs tier-1): good matchup ≤ ~13% of `PLAYER_BASE_HP` (30), neutral ~20–30%, bad ≥ ~40%.
- Quality gates before each commit: `bun test`, `bun run typecheck`, `bun run lint`.

---

### Task 1: Percentage mitigation + curves + pinned invariant tests (bead si7.1.1, part 1)

**Files:**
- Modify: `src/data/constants.ts` (`MONSTER_TIER_HP_CURVE` :244-249, `MONSTER_TIER_DMG_CURVE` :250-256, new `MITIGATION_K` next to `CHIP_DAMAGE_MIN` :233)
- Modify: `src/engine/combat.ts` (new `damageTaken`; `resolveCombat` dmgIn :163-166)
- Test: `test/combat-toll.test.ts` (create)
- Update: existing combat-number tests that assert old curve values (`test/combat.test.ts`, `test/reduce-fight.test.ts`, `test/gear-tiers.test.ts` — expected-value updates only, never weakened assertions)

**Interfaces:**
- Consumes: existing `mitigation(loadout, dmgType)` (unchanged — still returns `D = Σ(defense ÷ matrix)`), `playerDamage`, `MONSTERS`, curves.
- Produces: `MITIGATION_K: number` lever; `damageTaken(loadout: Loadout, monsterId: string, mitigationAdd?: number): number` exported from `src/engine/combat.ts` — Tasks 3 and 4 call it for exchanges and forecasts.

- [ ] **Step 1: Write the failing toll-band + invariant tests**

Create `test/combat-toll.test.ts`:

```ts
import { test, expect } from "bun:test";
import { resolveCombat, damageTaken } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import {
  PLAYER_BASE_HP,
  CHIP_DAMAGE_MIN,
  MONSTER_TIER_DMG_CURVE,
} from "../src/data/constants";
import type { Loadout } from "../src/engine/types";

function kit(weapon: string | null, armour: Partial<Record<"helmet" | "chest" | "legs" | "boots" | "gloves", string>> = {}, potions: { defId: string; qty: number }[] = []): Loadout {
  const l = emptyLoadout();
  l.equipment.weapon = weapon;
  for (const [slot, defId] of Object.entries(armour)) (l.equipment as Record<string, unknown>)[slot] = defId;
  l.potions = potions;
  return l;
}

// Toll bands (spec §2): bare kit vs tier-1 — good ≤ ~13%, neutral 20–30%, bad ≥ 40%.
test("toll: good matchup tier-1 is cheap (sword vs fae-sprite, robe hide)", () => {
  const r = resolveCombat(kit("sword"), PLAYER_BASE_HP, "fae-sprite");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeLessThanOrEqual(0.14);
});

test("toll: neutral tier-1 costs real HP (sword vs forest-boar)", () => {
  const r = resolveCombat(kit("sword"), PLAYER_BASE_HP, "forest-boar");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeGreaterThanOrEqual(0.2);
  expect(r.hpLost / PLAYER_BASE_HP).toBeLessThanOrEqual(0.34);
});

test("toll: bad matchup tier-1 hurts but is survivable (unarmed vs forest-boar)", () => {
  const r = resolveCombat(kit(null), PLAYER_BASE_HP, "forest-boar");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeGreaterThanOrEqual(0.4);
});

// % mitigation (spec §1): armour reduces, never floors.
test("mitigation: full iron plate cuts a tier-3 melee hit ~50%, never to chip", () => {
  const plate = { helmet: "plate-helmet", chest: "plate-chest", legs: "plate-legs", boots: "plate-boots", gloves: "plate-gloves" };
  const dmgIn = damageTaken(kit("sword", plate), "ice-troll");
  const bare = MONSTER_TIER_DMG_CURVE[3]!;
  expect(dmgIn).toBeGreaterThan(CHIP_DAMAGE_MIN);
  expect(dmgIn / bare).toBeGreaterThanOrEqual(0.4);
  expect(dmgIn / bare).toBeLessThanOrEqual(0.6);
});

test("mitigation: full mithril plate caps ~60-70% reduction, never chip-locks", () => {
  const mithril = { helmet: "mithril-plate-helmet", chest: "mithril-plate-chest", legs: "mithril-plate-legs", boots: "mithril-plate-boots", gloves: "mithril-plate-gloves" };
  const dmgIn = damageTaken(kit("mithril-sword", mithril), "ice-troll");
  const bare = MONSTER_TIER_DMG_CURVE[3]!;
  expect(dmgIn).toBeGreaterThan(CHIP_DAMAGE_MIN);
  expect(1 - dmgIn / bare).toBeGreaterThanOrEqual(0.6);
  expect(1 - dmgIn / bare).toBeLessThanOrEqual(0.75);
});

// D34 gate recalibrated (spec §2 pinned invariant): 3 greater-potions win, 2 die.
const MITHRIL = { helmet: "mithril-plate-helmet", chest: "mithril-plate-chest", legs: "mithril-plate-legs", boots: "mithril-plate-boots", gloves: "mithril-plate-gloves" };
test("Wyrm gate: full mithril + mithril-sword + 3 greater-potions wins", () => {
  const r = resolveCombat(kit("mithril-sword", MITHRIL, [{ defId: "greater-potion", qty: 3 }]), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(true);
});

test("Wyrm gate: the same kit with 2 greater-potions dies", () => {
  const r = resolveCombat(kit("mithril-sword", MITHRIL, [{ defId: "greater-potion", qty: 2 }]), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(false);
});

// Farmability (spec §2 pinned invariant): wyrmfang's dragon affinity tames the repeat kill.
test("Wyrm farm: wyrmfang + mithril beats the Wyrm without potions", () => {
  const r = resolveCombat(kit("wyrmfang", MITHRIL), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(true);
  expect(r.hpLost).toBeLessThanOrEqual(27);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `bun test test/combat-toll.test.ts`
Expected: FAIL — `damageTaken` is not exported; toll numbers reflect the old curves.

- [ ] **Step 3: Add the levers**

In `src/data/constants.ts`, next to `CHIP_DAMAGE_MIN` (:233):

```ts
// % mitigation (si7.1, supersedes flat subtraction): incoming damage is scaled
// by MITIGATION_K/(K + D) where D = Σ(defense ÷ matrix). Armour REDUCES the
// toll (full iron plate ≈ −50%, mithril ≈ −70%) but never floors it to chip —
// the M7 F1 "plate floors the whole bestiary" collapse dies here.
export const MITIGATION_K = 6;
```

Replace both curves (:244-256):

```ts
export const MONSTER_TIER_HP_CURVE: Record<number, number> = {
  1: 8,
  2: 16,
  3: 28,
  4: 54, // tier-4 boss: 9 mithril-sword strikes → 8 retaliations — exactly the 3-greater-potion gate (D34 recalibrated, si7.1)
}; // monster base HP by tier
export const MONSTER_TIER_DMG_CURVE: Record<number, number> = {
  1: 4,
  2: 8,
  3: 14,
  4: 24, // ×K/(K+10) vs full mithril = 9/hit — lethal without the potion supply (si7.1)
}; // monster base damage by tier, scaled by % mitigation (MITIGATION_K) coming in.
   // Steepened at tier 1 (si7.1) so a bare-kit fight costs matchup-scaled real HP:
   // good ≈ 13% of base HP, neutral ≈ 27%, bad ≥ 40% — HP is a second run-budget.
```

- [ ] **Step 4: Implement `damageTaken` and rewire `resolveCombat`**

In `src/engine/combat.ts`, add `MITIGATION_K` to the constants import, then add after `mitigation` (:116):

```ts
// Incoming damage per hit (si7.1, % model): the monster's tier damage scaled by
// K/(K + D), floored at chip. D is the matrix-adjusted defense sum (mitigation)
// plus any battle-item mitigationAdd — temporary armour under the same curve.
export function damageTaken(loadout: Loadout, monsterId: string, mitigationAdd = 0): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const d = mitigation(loadout, monster.dmgType) + mitigationAdd;
  return Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! * (MITIGATION_K / (MITIGATION_K + d)),
  );
}
```

In `resolveCombat`, replace the `dmgIn` computation (:163-166) with:

```ts
const dmgIn = damageTaken(loadout, monsterId, buff.mitigationAdd);
```

- [ ] **Step 5: Run the new tests**

Run: `bun test test/combat-toll.test.ts`
Expected: PASS ×8. If a band assert misses, re-check the formula against the plan's derivation before touching any lever — the Global Constraints values were hand-traced to land these bands (boar: 3 strikes/2 hits ×4 = 8 HP = 27%; Wyrm: 8 retaliations ×9 = 72 vs 30 + 3×~18 waste-adjusted heals). Tune only if the trace itself was wrong, and record the final values.

- [ ] **Step 6: Reconcile existing combat tests**

Run: `bun test`
Expected: failures ONLY in tests asserting old curve numbers (`test/combat.test.ts`, `test/reduce-fight.test.ts`, `test/gear-tiers.test.ts`, possibly snapshots via sim output). Update expected VALUES to the new curves/formula (show your arithmetic in a comment where non-obvious); never delete or weaken an assertion. The sustainability harness must pass UN-EDITED (its forager routes around monsters). Snapshot diffs: eyeball then `bun test -u`.

- [ ] **Step 7: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add -A
git commit -m "si7.1: percentage mitigation (MITIGATION_K) + steepened tier curves — toll bands + Wyrm gate pinned"
```

---

### Task 2: Roster + weighted creature tables (bead si7.1.1, part 2)

**Files:**
- Modify: `src/data/constants.ts` (`Biome` type :41-44, three `creatureTable` entries, `MONSTERS` :284-302, `LOOT_TABLE` :366-381, `RECIPE` :409+)
- Modify: `src/engine/grid.ts` (creature pick — currently uniform index into an array, becomes `weightedPick`)
- Test: `test/roster.test.ts` (create)

**Interfaces:**
- Consumes: `weightedPick(table, order, roll)` from `src/engine/rng.ts` (same helper `rollMaterial` uses); Task 1's curves.
- Produces: `Biome.creatureTable: Record<string, number>` (weighted — the SHAPE CHANGE); monsters `shell-beetle`, `mirage-wisp`, `ice-crab`; materials `beetle-shell`, `wisp-essence`, `crab-shell`; recipes `plate-boots-beetle`, `fire-staff-wisp`, `ration-crab`.

- [ ] **Step 1: Write the failing tests**

Create `test/roster.test.ts`:

```ts
import { test, expect } from "bun:test";
import { BIOMES, BIOME_IDS, MONSTERS, LOOT_TABLE, RECIPE } from "../src/data/constants";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { DmgType, ArmourType } from "../src/data/constants";

test("every biome's tier-1/2 band covers the full type spread", () => {
  for (const id of BIOME_IDS) {
    const reachable = Object.keys(BIOMES[id].creatureTable).filter((c) => MONSTERS[c]!.tier <= 2);
    const dmg = new Set<DmgType>(reachable.map((c) => MONSTERS[c]!.dmgType));
    const hide = new Set<ArmourType>(reachable.map((c) => MONSTERS[c]!.armourType));
    expect(dmg.size).toBe(3); // melee + ranged + magic incoming
    expect(hide.size).toBe(3); // plate + light + robe hides
  }
});

test("every creatureTable entry is a real monster with loot feeding a recipe", () => {
  for (const id of BIOME_IDS) {
    for (const c of Object.keys(BIOMES[id].creatureTable)) {
      expect(MONSTERS[c]).toBeDefined();
      for (const drop of LOOT_TABLE[c] ?? []) {
        const feeds = Object.values(RECIPE).some((r) => r.inputs.some((i) => i.defId === drop.defId));
        const crafts = Object.values(RECIPE).some((r) => r.output.defId === drop.defId);
        expect(feeds || crafts).toBe(true); // peu rule: every part feeds the tree
      }
    }
  }
});

test("weighted spawns: the Wyrm is rare (≤ ~7% of tundra monster POIs, 300 seeds)", () => {
  let monsters = 0, wyrms = 0;
  for (let i = 0; i < 300; i++) {
    const seed = `roster-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    for (const p of generateGrid(seed, "tundra").pois) {
      if (p.kind !== "monster" || !p.creature) continue;
      monsters++;
      if (p.creature === "ancient-wyrm") wyrms++;
    }
  }
  expect(monsters).toBeGreaterThan(100); // sanity: the sample is real
  expect(wyrms / monsters).toBeLessThanOrEqual(0.09);
  expect(wyrms).toBeGreaterThan(0); // still spawns — the goal must stay findable
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/roster.test.ts`
Expected: FAIL — `creatureTable` is a `string[]` (`.filter` over `Object.keys` misbehaves / type error), new monsters missing, Wyrm at ~20%.

- [ ] **Step 3: Data — monsters, loot, recipes, weighted tables**

In `src/data/constants.ts`:

`Biome` type (:41-44): `creatureTable: Record<string, number>; // weighted monster defIds (si7.1): same shape as materialTable entries — tier-1/2 dominate, bosses rare`

Replace the three `creatureTable` entries:

```ts
// woodland
creatureTable: { "forest-boar": 5, "forest-bandit": 4, "shell-beetle": 4, "fae-sprite": 3, werewolf: 2 },
// desert
creatureTable: { "sand-raider": 5, "mirage-wisp": 4, "giant-scorpion": 3, "dust-vampire": 1 },
// tundra — wyrm 1/16 ≈ 6% of monster POIs (was 1/5): the goal is a discovery, not a doormat (si7.1)
creatureTable: { "snow-wolf": 5, "ice-crab": 4, "snow-marauder": 3, "frost-fae": 2, "ice-troll": 1, "ancient-wyrm": 1 },
```

Add to `MONSTERS` (after `snow-marauder`, keeping the comment style):

```ts
// Tier-1 spread completers (si7.1): every biome's reachable band now covers
// melee/ranged/magic incoming AND plate/light/robe hides — the matchup lesson
// has material on day one. Ordinary stats; the TYPE is the point.
"shell-beetle": { tier: 1, dmgType: "melee", armourType: "plate", category: "beast", tags: ["beast"] }, // woodland: the first "my sword skates off it" moment
"mirage-wisp": { tier: 1, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] }, // desert: early iron-sword affinity teacher
"ice-crab": { tier: 1, dmgType: "melee", armourType: "plate", category: "beast", tags: ["beast"] }, // tundra: plate hide before the troll
```

ALSO change the existing `forest-bandit` entry's `dmgType` from `"melee"` to `"ranged"` (bandits shoot — data-only), with a `// ranged (si7.1): completes woodland's incoming-type spread` comment. Without this, woodland's tier-1/2 band has melee+magic incoming but no ranged, and the spread test below fails. Check for tests asserting forest-bandit's old dmgType and update expected values.

Add to `LOOT_TABLE`:

```ts
"shell-beetle": [{ defId: "beetle-shell", qty: 2 }],
"mirage-wisp": [{ defId: "wisp-essence", qty: 2 }],
"ice-crab": [{ defId: "crab-shell", qty: 2 }],
```

Add to `RECIPE` (in the combat-drop crafts group, keeping the peu comment style):

```ts
"plate-boots-beetle": { inputs: [{ defId: "beetle-shell", qty: 2 }], output: { defId: "plate-boots", qty: 1 } }, // beetle chitin = plate without iron (si7.1)
"fire-staff-wisp": { inputs: [{ defId: "wisp-essence", qty: 1 }, { defId: "cactus-wood", qty: 2 }], output: { defId: "fire-staff", qty: 1 } }, // desert path to magic — no woodland fae needed (si7.1)
"ration-crab": { inputs: [{ defId: "crab-shell", qty: 1 }], output: { defId: "ration", qty: 2 } }, // crab meat (si7.1)
```

- [ ] **Step 4: Weighted creature pick in generation**

In `src/engine/grid.ts`, the spec roll (in `buildGrid`, the `specs` map — currently indexes `biome.creatureTable` as an array):

```ts
const creatureKeys = Object.keys(biome.creatureTable).sort(); // deterministic order, like rollMaterial
const creature =
  kind === "monster" && creatureKeys.length > 0
    ? weightedPick(biome.creatureTable, creatureKeys, rand(mapSeed, "poi-creature", i))
    : null;
```

- [ ] **Step 5: Run tests, reconcile fallout**

Run: `bun test test/roster.test.ts` → PASS ×3, then `bun test`.
Expected fallout: creature stamping shifts under every seed → snapshot regeneration (eyeball first), and seed-scan helpers (e.g. `mapWith("monster")` in `test/reduce-fight.test.ts`, the Wyrm-hunting scans in any m7/gear test) may need wider scan ranges — widen ranges, never weaken assertions. Sustainability harness must pass un-edited (foragers route around all monsters regardless of species).

- [ ] **Step 6: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add -A
git commit -m "si7.1: tier-1 roster completes the type spread per biome; creatureTable goes weighted — Wyrm properly rare"
```

---

### Task 3: Engagement model — engine (bead si7.1.2, part 1)

**Files:**
- Modify: `src/engine/types.ts` (Engagement type, `Expedition.combat`/`autoQuaff`, 3 Action variants, 2 RejectionReasons, 5 GameEvent variants)
- Modify: `src/engine/combat.ts` (`strikeExchange`; `resolveCombat` loops it)
- Modify: `src/engine/reduce.ts` (engage/exchange/flee/quaff/toggle; `engaged` guards)
- Modify: `src/sim/legal.ts` (3 new candidates)
- Test: `test/engagement.test.ts` (create); update `test/reduce-fight.test.ts` + any driver that fought atomically

**Interfaces:**
- Consumes: Task 1's `damageTaken(loadout, monsterId, mitigationAdd)`; existing `playerDamage`, `rollLoot`, `explainMatchup`, `endExpedition`, `freeLootStacks`/`addToCarry`/`freeCarryStacks`.
- Produces (Task 4 relies on these exact names):
  - `Engagement = { at: {x,y}; creature: string; monsterHp: number; moveOnWin: boolean; damageAdd: number; mitigationAdd: number; startHp: number; potionsUsed: number }` on `Expedition.combat?`.
  - `Expedition.autoQuaff?: boolean` (absent = `true`).
  - Actions `{type:"flee"}`, `{type:"quaff"}`, `{type:"toggle-auto-quaff"}`.
  - Events `engaged {at, creature, monsterHp}`, `exchanged {creature, dmgDealt, dmgTaken, monsterHp, hp, potionsUsed}`, `fled {creature, partingHit, hp}`, `quaffed {defId, healed, hp}`, `auto-quaff-toggled {on}`. `fought` stays the terminal summary (hpLost = whole engagement).
  - `strikeExchange(loadout, hp, monsterHp, monsterId, damageAdd = 0, mitigationAdd = 0, autoQuaff = true): ExchangeResult` where `ExchangeResult = { monsterHp; hp; potionsAfter; potionsUsed; dmgDealt; dmgTaken; victory; defeated }`.
  - RejectionReasons `"engaged"` (non-combat action during engagement) and `"not-engaged"` (flee/quaff outside one).

**Semantics locked by the spec (§4):**
- `fight` NOT engaged: requires a live monster on the CURRENT tile → creates the engagement (battle items consumed NOW into `damageAdd`/`mitigationAdd`; loot fit-check runs NOW, rejecting `carry-full` before any blood), emits `engaged`. No exchange on this action — the player sees the forecast first.
- `move` onto a live monster tile: same engagement creation with `moveOnWin: true`; the player does NOT move yet; no energy cost.
- `fight` WHILE engaged: one exchange via `strikeExchange` (player strike → if monster lives, retaliation → auto-quaff inside the exchange when `autoQuaff`). Emits `exchanged`; on victory also loot/map/cleared/relocation + `fought` + map events; on defeat `endExpedition` + `fought` + `run-ended`.
- `flee`: parting hit `damageTaken(loadout, creature, mitigationAdd)` BEFORE disengaging; emits `fled`; if it kills you → `endExpedition` + `run-ended` (reason "defeated"). Otherwise `combat` cleared; the monster is NOT in `cleared` — full HP next time, still blocks.
- `quaff`: engaged + potions nonempty + hp < `PLAYER_BASE_HP`; heals front-of-stack potion; no exchange.
- Guards: `move`/`gather`/`eat`/`drop`/`drop-map`/`return` reject `"engaged"` while `expedition.combat` is set (flee is always available, so no dead end — this consciously amends the "return always legal" note). The two toggles stay legal anytime.
- Loot is NOT stored on the Engagement — `rollLoot(seed, creature, at)` is deterministic in fixed inputs and carry can't change mid-engagement (everything that touches carry is `engaged`-guarded), so the victory-time roll always equals the fit-check roll.

- [ ] **Step 1: Write the failing engagement tests**

Create `test/engagement.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { damageTaken } from "../src/engine/combat";
import { PLAYER_BASE_HP } from "../src/data/constants";
import type { GameState, GameEvent } from "../src/engine/types";

function monsterMap(): { seed: string; poi: Poi } {
  for (let i = 0; i < 400; i++) {
    const seed = `eng-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "monster" && p.creature !== null);
    if (poi) return { seed, poi };
  }
  throw new Error("no monster POI in scan range");
}

function onMonster(seed: string, poi: Poi, opts: { hp?: number; potions?: { defId: string; qty: number }[] } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.potions = opts.potions ?? [];
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 300,
      hp: opts.hp ?? PLAYER_BASE_HP, loadout, carry: [], cleared: [],
    },
  };
}

const types = (evs: GameEvent[]) => evs.map((e) => e.type);

test("fight (not engaged) engages without an exchange", () => {
  const { seed, poi } = monsterMap();
  const { state, events } = reduce(onMonster(seed, poi), { type: "fight" });
  expect(types(events)).toEqual(["engaged"]);
  const combat = state.expedition!.combat!;
  expect(combat.creature).toBe(poi.creature!);
  expect(state.expedition!.hp).toBe(PLAYER_BASE_HP); // no blood yet
});

test("fight (engaged) runs exactly one exchange; loop reaches victory with loot", () => {
  const { seed, poi } = monsterMap();
  let s = reduce(onMonster(seed, poi), { type: "fight" }).state;
  let guard = 0;
  for (;;) {
    const r = reduce(s, { type: "fight" });
    s = r.state;
    expect(r.events[0]!.type).toBe("exchanged");
    if (types(r.events).includes("fought")) {
      const fought = r.events.find((e) => e.type === "fought") as Extract<GameEvent, { type: "fought" }>;
      expect(fought.victory).toBe(true);
      break;
    }
    if (++guard > 50) throw new Error("engagement never resolved");
  }
  expect(s.expedition!.combat).toBeUndefined();
  expect(s.expedition!.cleared).toContainEqual({ x: poi.x, y: poi.y });
});

test("non-combat actions reject 'engaged'; toggles stay legal", () => {
  const { seed, poi } = monsterMap();
  const s = reduce(onMonster(seed, poi), { type: "fight" }).state;
  for (const a of [{ type: "gather" }, { type: "eat" }, { type: "return" }, { type: "move", to: { x: poi.x, y: poi.y + 1 } }] as const) {
    const { events } = reduce(s, a as never);
    expect(events[0]).toMatchObject({ type: "action-rejected", reason: "engaged" });
  }
  expect(types(reduce(s, { type: "toggle-auto-eat" }).events)).toEqual(["auto-eat-toggled"]);
  expect(types(reduce(s, { type: "toggle-auto-quaff" }).events)).toEqual(["auto-quaff-toggled"]);
});

test("flee: parting hit, monster resets, tile still blocked", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi), { type: "fight" }).state;
  const expected = damageTaken(engaged.expedition!.loadout, poi.creature!, 0);
  const { state, events } = reduce(engaged, { type: "flee" });
  expect(events[0]).toMatchObject({ type: "fled", creature: poi.creature!, partingHit: expected });
  expect(state.expedition!.combat).toBeUndefined();
  expect(state.expedition!.hp).toBeCloseTo(PLAYER_BASE_HP - expected, 5);
  expect(state.expedition!.cleared).toEqual([]); // not cleared — still blocks
  const re = reduce(state, { type: "fight" }).state; // re-engaging finds FULL monster HP
  expect(re.expedition!.combat!.monsterHp).toBe(reduce(onMonster(seed, poi), { type: "fight" }).state.expedition!.combat!.monsterHp);
});

test("flee at low HP can soft-fail the run", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi, { hp: 1 }), { type: "fight" }).state;
  const { state, events } = reduce(engaged, { type: "flee" });
  expect(types(events)).toEqual(["fled", "run-ended"]);
  expect(state.phase).toBe("town");
});

test("quaff heals mid-engagement without an exchange; rejects outside one", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi, { hp: 10, potions: [{ defId: "potion", qty: 1 }] }), { type: "fight" }).state;
  const { state, events } = reduce(engaged, { type: "quaff" });
  expect(events[0]).toMatchObject({ type: "quaffed", defId: "potion", healed: 10, hp: 20 });
  expect(state.expedition!.combat!.monsterHp).toBe(engaged.expedition!.combat!.monsterHp); // no exchange
  const outside = reduce(onMonster(seed, poi, { potions: [{ defId: "potion", qty: 1 }] }), { type: "quaff" });
  expect(outside.events[0]).toMatchObject({ type: "action-rejected", reason: "not-engaged" });
});

test("move onto a live monster engages (moveOnWin) instead of resolving", () => {
  const { seed, poi } = monsterMap();
  const s = onMonster(seed, poi);
  s.expedition!.pos = { x: poi.x, y: poi.y + 1 }; // stand adjacent (may be off-map bottom edge — scan guarantees? see note below)
  if (poi.y + 1 >= 60) return; // adjacency fallback: skip pathological placement (documented)
  const { state, events } = reduce(s, { type: "move", to: { x: poi.x, y: poi.y } });
  expect(types(events)).toEqual(["engaged"]);
  expect(state.expedition!.pos).toEqual({ x: poi.x, y: poi.y + 1 }); // did not move
  expect(state.expedition!.combat!.moveOnWin).toBe(true);
});
```

(Adjacency note: if the naive `poi.y + 1` proves flaky against terrain, stand the player on the POI's tile-neighbor found via the grid — adjust mechanically, keep the assertions.)

- [ ] **Step 2: Run to verify failures**

Run: `bun test test/engagement.test.ts`
Expected: FAIL — type errors (`combat` unknown on Expedition, `flee` not an Action).

- [ ] **Step 3: Types**

In `src/engine/types.ts`:

After `MapItem` (:30):

```ts
// A live combat engagement (si7.1): combat is no longer atomic — `fight` runs
// one exchange per action, `flee`/`quaff` are the mid-fight decisions. Battle-
// item buffs are consumed at engagement START and persist here for its rounds.
export type Engagement = {
  at: { x: number; y: number };
  creature: string;
  monsterHp: number;
  moveOnWin: boolean; // walked in (relocate on victory) vs stood and fought
  damageAdd: number;
  mitigationAdd: number;
  startHp: number; // for the terminal fought event's hpLost
  potionsUsed: number; // accumulated across rounds + manual quaffs
};
```

On `Expedition` (after `carriedMaps`):

```ts
combat?: Engagement; // live engagement (si7.1). Optional/absent = not engaged; reads guard with `?? undefined` checks.
autoQuaff?: boolean; // auto-potion at the threshold inside exchanges (si7.1, mirrors autoEat). Optional/absent = true; reads guard with `?? true`.
```

`Action` union adds:

```ts
| { type: "fight" } // engage the monster on your tile, or run ONE exchange when engaged (si7.1)
| { type: "flee" } // disengage at the cost of one parting hit (si7.1)
| { type: "quaff" } // drink one potion mid-engagement, no exchange (si7.1; absorbs 82r's manual potion)
| { type: "toggle-auto-quaff" } // flip auto-potion-at-threshold (si7.1)
```

(Replace the existing bare `{ type: "fight" }` line with the commented one.)

`RejectionReason` adds `| "engaged" | "not-engaged"`.

`GameEvent` adds:

```ts
| { type: "engaged"; at: { x: number; y: number }; creature: string; monsterHp: number }
| { type: "exchanged"; creature: string; dmgDealt: number; dmgTaken: number; monsterHp: number; hp: number; potionsUsed: number }
| { type: "fled"; creature: string; partingHit: number; hp: number }
| { type: "quaffed"; defId: string; healed: number; hp: number }
| { type: "auto-quaff-toggled"; on: boolean }
```

- [ ] **Step 4: `strikeExchange` in combat.ts; `resolveCombat` loops it**

In `src/engine/combat.ts`:

```ts
export type ExchangeResult = {
  monsterHp: number;
  hp: number;
  potionsAfter: ItemStack[];
  potionsUsed: number;
  dmgDealt: number;
  dmgTaken: number; // 0 when the strike killed before retaliation
  victory: boolean;
  defeated: boolean;
};

// One combat round (si7.1): player strike → if the monster lives, retaliation →
// waste-tolerant auto-quaff at the threshold. Pure; the reducer holds the
// engagement state between rounds, resolveCombat loops this for the atomic API.
export function strikeExchange(
  loadout: Loadout,
  hp: number,
  monsterHp: number,
  monsterId: string,
  damageAdd = 0,
  mitigationAdd = 0,
  autoQuaff = true,
): ExchangeResult {
  const dmgDealt = playerDamage(loadout, monsterId) + damageAdd;
  let potions = loadout.potions.map((p) => ({ ...p }));
  let potionsUsed = 0;
  let current = hp;
  const monsterAfter = monsterHp - dmgDealt;
  let dmgTaken = 0;
  if (monsterAfter > 0) {
    dmgTaken = damageTaken(loadout, monsterId, mitigationAdd);
    current -= dmgTaken;
    if (current <= 0) current = 0; // soft-fail floor
    else if (autoQuaff && current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potions.length > 0) {
      const heal = POTION_HEAL_BY[potions[0]!.defId] ?? POTION_HEAL;
      current = Math.min(PLAYER_BASE_HP, current + heal);
      potions[0]!.qty -= 1;
      if (potions[0]!.qty <= 0) potions.shift();
      potionsUsed = 1;
    }
  }
  return {
    monsterHp: Math.max(0, monsterAfter),
    hp: current,
    potionsAfter: potions,
    potionsUsed,
    dmgDealt,
    dmgTaken,
    victory: monsterAfter <= 0,
    defeated: monsterAfter > 0 && current <= 0,
  };
}
```

Rewrite `resolveCombat`'s loop body to compose it (delete the old inline loop + potion queue):

```ts
export function resolveCombat(loadout: Loadout, hp: number, monsterId: string): CombatResult {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const buff = battleBuff(loadout.battleItems ?? []);
  let current = hp;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  let potions = loadout.potions;
  let potionsUsed = 0;
  for (;;) {
    const round = strikeExchange(
      { ...loadout, potions }, current, monsterHp, monsterId,
      buff.damageAdd, buff.mitigationAdd, true,
    );
    current = round.hp;
    monsterHp = round.monsterHp;
    potions = round.potionsAfter;
    potionsUsed += round.potionsUsed;
    if (round.victory || round.defeated) {
      return {
        victory: round.victory,
        hpAfter: current,
        hpLost: hp - current,
        potionsUsed,
        potionsAfter: potions,
        battleItemsAfter: [],
      };
    }
  }
}
```

(dmgDealt ≥ `CHIP_DAMAGE_MIN` > 0 still guarantees termination — keep that comment.)

- [ ] **Step 5: Reducer — engage, exchange, flee, quaff, toggle, guards**

In `src/engine/reduce.ts`:

Switch cases: add `"flee" → flee(state)`, `"quaff" → quaff(state)`, `"toggle-auto-quaff" → toggleAutoQuaff(state)`.

`fightAt` becomes `engage` (same call sites: `fight` on own tile with `moveOnWin=false`; `move` walk-in with `moveOnWin=true`):

```ts
// Start an engagement (si7.1, replaces atomic fightAt): the fit-check still
// runs BEFORE any blood (rejecting is free), battle items are consumed NOW and
// their buffs ride the Engagement for all its rounds. No exchange here — the
// player sees the forecast before the first swing.
function engage(
  state: GameState,
  expedition: Expedition,
  at: { x: number; y: number },
  creature: string,
  action: "fight" | "move",
  moveOnWin: boolean,
): { state: GameState; events: GameEvent[] } {
  const rolled = rollLoot(state.seed, creature, at);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  const maxStacks = freeLootStacks(expedition.loadout, expedition.carriedMaps);
  let carryWithLoot: typeof expedition.carry | null = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (carryWithLoot === null) return rejected(state, action, "carry-full");
  }
  const buff = battleBuff(expedition.loadout.battleItems ?? []);
  const monsterHp = MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]!;
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        loadout: { ...expedition.loadout, battleItems: [] }, // consumed at engagement start (bzd)
        combat: {
          at: { x: at.x, y: at.y }, creature, monsterHp, moveOnWin,
          damageAdd: buff.damageAdd, mitigationAdd: buff.mitigationAdd,
          startHp: expedition.hp, potionsUsed: 0,
        },
      },
    },
    events: [{ type: "engaged", at: { x: at.x, y: at.y }, creature, monsterHp }],
  };
}
```

`battleBuff` moves to an export from `combat.ts` OR reduce imports it — export it from `combat.ts` (add `export` to the existing function) and import in reduce. `MONSTER_TIER_HP_CURVE` + `MONSTERS` join reduce's constants import.

The `fight` case:

```ts
function fight(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "fight", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) {
    // Not engaged: engage the live monster on the CURRENT tile (as before).
    const { pos } = expedition;
    const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
    const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
    const alreadyCleared = expedition.cleared.some((c) => c.x === pos.x && c.y === pos.y);
    if (!poi || poi.kind !== "monster" || alreadyCleared || poi.creature === null) {
      return rejected(state, "fight", "no-monster");
    }
    return engage(state, expedition, pos, poi.creature, "fight", false);
  }
  // Engaged: one exchange.
  const round = strikeExchange(
    expedition.loadout, expedition.hp, combat.monsterHp, combat.creature,
    combat.damageAdd, combat.mitigationAdd, expedition.autoQuaff ?? true,
  );
  const potionsUsed = combat.potionsUsed + round.potionsUsed;
  const exchanged: GameEvent = {
    type: "exchanged", creature: combat.creature, dmgDealt: round.dmgDealt,
    dmgTaken: round.dmgTaken, monsterHp: round.monsterHp, hp: round.hp, potionsUsed,
  };
  const loadout = { ...expedition.loadout, potions: round.potionsAfter };
  const fought = (victory: boolean): GameEvent => ({
    type: "fought", at: { x: combat.at.x, y: combat.at.y }, creature: combat.creature,
    victory, hpLost: combat.startHp - round.hp, potionsUsed,
    loot: victory ? rollLoot(state.seed, combat.creature, combat.at).filter((s) => s.defId !== MAP_SCROLL_ID) : [],
    hp: round.hp, matchup: explainMatchup(expedition.loadout, combat.creature),
  });
  if (round.defeated) {
    const ended = endExpedition(state, { ...expedition, loadout });
    return { state: ended, events: [exchanged, fought(false), { type: "run-ended", reason: "defeated" }] };
  }
  if (!round.victory) {
    return {
      state: { ...state, expedition: { ...expedition, hp: round.hp, loadout, combat: { ...combat, monsterHp: round.monsterHp, potionsUsed } } },
      events: [exchanged],
    };
  }
  // Victory: apply loot/maps/cleared/relocation exactly as the old fightAt did.
  const rolled = rollLoot(state.seed, combat.creature, combat.at);
  const mapDrops = rolled.filter((s) => s.defId === MAP_SCROLL_ID);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  const maxStacks = freeLootStacks(loadout, expedition.carriedMaps);
  let carryWithLoot: typeof expedition.carry = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks)!; // fit-checked at engage; carry can't change while engaged
  }
  const carriedMaps = expedition.carriedMaps ?? [];
  let mapsAfter = carriedMaps;
  const mapEvents: GameEvent[] = [];
  if (mapDrops.length > 0) {
    const mapSeed = `${expedition.mapSeed}:drop:${combat.at.x},${combat.at.y}`;
    const biomeId = rollBiome(mapSeed);
    const carried = carryWithLoot.length + carriedMaps.length < freeCarryStacks(loadout);
    if (carried) mapsAfter = [...carriedMaps, { mapSeed, biomeId, vintage: state.runs ?? 0 }];
    mapEvents.push({ type: "map-dropped", at: { x: combat.at.x, y: combat.at.y }, mapSeed, biomeId, hints: previewHints(mapSeed, biomeId), carried });
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        pos: combat.moveOnWin ? { x: combat.at.x, y: combat.at.y } : expedition.pos,
        hp: round.hp, loadout, carry: carryWithLoot,
        cleared: [...expedition.cleared, { x: combat.at.x, y: combat.at.y }],
        carriedMaps: mapsAfter,
        combat: undefined,
      },
    },
    events: [exchanged, fought(true), ...mapEvents],
  };
}
```

`flee` / `quaff` / `toggleAutoQuaff`:

```ts
function flee(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "flee", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) return rejected(state, "flee", "not-engaged");
  // The standing price of bailing (si7.1): one parting hit BEFORE you're clear —
  // always affordable before the exchange that would kill you, never free.
  const partingHit = damageTaken(expedition.loadout, combat.creature, combat.mitigationAdd);
  const hp = Math.max(0, expedition.hp - partingHit);
  const fled: GameEvent = { type: "fled", creature: combat.creature, partingHit, hp };
  if (hp <= 0) {
    const ended = endExpedition(state, { ...expedition, combat: undefined });
    return { state: ended, events: [fled, { type: "run-ended", reason: "defeated" }] };
  }
  return { state: { ...state, expedition: { ...expedition, hp, combat: undefined } }, events: [fled] };
}

function quaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "quaff", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) return rejected(state, "quaff", "not-engaged");
  const potions = expedition.loadout.potions;
  if (potions.length === 0 || expedition.hp >= PLAYER_BASE_HP) return rejected(state, "quaff", "insufficient");
  const front = potions[0]!;
  const heal = POTION_HEAL_BY[front.defId] ?? POTION_HEAL;
  const hp = Math.min(PLAYER_BASE_HP, expedition.hp + heal);
  const next = potions.map((p) => ({ ...p }));
  next[0]!.qty -= 1;
  if (next[0]!.qty <= 0) next.shift();
  return {
    state: {
      ...state,
      expedition: {
        ...expedition, hp,
        loadout: { ...expedition.loadout, potions: next },
        combat: { ...combat, potionsUsed: combat.potionsUsed + 1 },
      },
    },
    events: [{ type: "quaffed", defId: front.defId, healed: hp - expedition.hp, hp }],
  };
}

function toggleAutoQuaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-quaff", "not-on-expedition");
  const on = !(expedition.autoQuaff ?? true);
  return { state: { ...state, expedition: { ...expedition, autoQuaff: on } }, events: [{ type: "auto-quaff-toggled", on }] };
}
```

(`POTION_HEAL`, `POTION_HEAL_BY`, `PLAYER_BASE_HP` already import or join reduce's constants import; `damageTaken`, `strikeExchange`, `battleBuff` join the combat import.)

Engaged guards — first line inside `move`, `gather`, `eat`, `drop`, `dropMap`, `returnHome` (after the phase check):

```ts
if (expedition.combat) return rejected(state, "<action-name>", "engaged");
```

- [ ] **Step 6: legal.ts candidates**

In `expeditionActions`, after the `fight` candidate:

```ts
candidates.push({ type: "flee" });
candidates.push({ type: "quaff" });
candidates.push({ type: "toggle-auto-quaff" });
```

- [ ] **Step 7: Run the engagement tests**

Run: `bun test test/engagement.test.ts`
Expected: PASS ×7.

- [ ] **Step 8: Reconcile the atomic-fight callers**

Run: `bun test`
Expected fallout, fix each without weakening assertions:
- `test/reduce-fight.test.ts`: fights now engage-then-exchange. Add a local helper and reuse it:

```ts
function fightToEnd(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = reduce(state, { type: "fight" });
  const all = [...s.events];
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 100) {
    s = reduce(s.state, { type: "fight" });
    all.push(...s.events);
  }
  return { state: s.state, events: all };
}
```

  Tests asserting the single `fought` event find it via `events.find((e) => e.type === "fought")` instead of `events[0]`.
- `test/reduce-move.test.ts` / anything walking into monsters: walk-ins now emit `engaged` — resolve with the same helper or assert the engagement itself (whichever the test's intent was).
- Harness drivers (`test/harness-*.test.ts`, `test/reach-fraction.test.ts`): they route around monsters, but a walk-in can happen — after any move, if `state.expedition?.combat`, loop `fight` to resolution (or `flee` if that was the driver's intent; keep it simple: fight to resolution).
- `test/legal.test.ts`: the D29 no-drift assertion now covers the new candidates for free; expected-action-set tests may need the three new actions added.
- `test/combat.test.ts` should pass untouched beyond Task 1's number updates (the atomic API is preserved) — if it doesn't, `strikeExchange` composition has a bug; fix the code.
- Battle-item timing: bzd tests asserting consumption may need the engage step inserted. The buffs must still apply — verify totals, not just emptiness.

- [ ] **Step 9: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add -A
git commit -m "si7.1: engagement model — fight is one exchange; flee (parting hit) + quaff + auto-quaff toggle; engaged guards"
```

---

### Task 4: Engagement surfaces — web + console + forecast (bead si7.1.2, part 2)

**Files:**
- Modify: `src/web/main.ts` (herePanel engagement branch, action buttons, log lines for new events, forecast)
- Modify: `src/web/index.html` (small CSS for the engagement panel + monster HP bar)
- Modify: `src/sim/playtest.ts` (engagement printout)
- Test: `test/render.test.ts` only if it snapshots affected output (regenerate deliberately); manual preview verification

**Interfaces:**
- Consumes: Task 3's `Engagement` (`exp.combat`), events, `damageTaken(loadout, creature, mitigationAdd)`, `playerDamage(loadout, creature)`, `MONSTER_TIER_HP_CURVE`, `MONSTERS`.
- Produces: no engine surface — UI only.

- [ ] **Step 1: Web — engagement panel**

In `src/web/main.ts` `herePanel` (or directly in `expeditionView` before `herePanel` — implementer's choice, keep it one function): when `exp.combat` is set, render the engagement INSTEAD of the normal here-panel:

```ts
function engagementPanel(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  const c = exp.combat!;
  const maxHp = MONSTER_TIER_HP_CURVE[MONSTERS[c.creature]!.tier]!;
  const dmgOut = playerDamage(exp.loadout, c.creature) + c.damageAdd;
  const dmgIn = damageTaken(exp.loadout, c.creature, c.mitigationAdd);
  const toKill = Math.ceil(c.monsterHp / dmgOut);
  const hpPool = exp.hp; // potions extend this — the forecast shows the raw race
  const toDie = Math.ceil(hpPool / dmgIn);
  const winning = toKill <= toDie;
  const canQuaff = legal.some((a) => a.type === "quaff");
  return `<div class="here monster engagement">
    <b>⚔ Engaged: ${name(c.creature)}</b>
    <div class="bar"><span>Its HP</span><div class="track"><div class="fill monster" style="width:${(c.monsterHp / maxHp) * 100}%"></div></div><b>${round(c.monsterHp)}/${maxHp}</b></div>
    <div class="forecast">you hit for <b>${round(dmgOut)}</b> · it hits for <b>${round(dmgIn)}</b> · <b class="${winning ? "good" : "over"}">${winning ? `kill in ${toKill}` : `it kills you first (~${toDie} rounds)`}</b>${exp.loadout.potions.length ? ` · ${exp.loadout.potions.reduce((n, p) => n + p.qty, 0)} potion(s) extend that` : ""}</div>
    <div class="actions">
      <button data-act="fight">⚔ Fight (1 round)</button>
      <button data-act="flee" title="disengage — take one parting hit (${round(dmgIn)})">🏃 Flee (−${round(dmgIn)} HP)</button>
      ${canQuaff ? `<button data-act="quaff">🧪 Potion</button>` : `<button disabled title="no potions, or full HP">🧪 Potion</button>`}
      <button data-act="toggle-auto-quaff">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
    </div>
  </div>`;
}
```

Call it from `expeditionView`: `${exp.combat ? engagementPanel(exp, legal) : herePanel(grid, exp, legal)}`. Imports: add `damageTaken`, `playerDamage` from `../engine/combat`, `MONSTER_TIER_HP_CURVE`, `MONSTERS` from `../data/constants`.

Update the pre-fight here-panel monster copy (:349-353): "It's static: it won't touch you unless you Fight" stays true, but the button now reads `⚔ Engage the ${name(...)}` and walking in previews the forecast. Also show a one-line pre-engagement forecast in that panel using the same `dmgOut`/`dmgIn` math (no buffs yet — battle items apply at engage; say so in the title attribute).

CSS in `src/web/index.html` next to the `.here` rules: `.fill.monster { background: #c0504d; }` and `.engagement .forecast { margin: 0.4rem 0; }` (match the file's existing style conventions).

- [ ] **Step 2: Web — log lines for the new events**

In the event-to-log translation (the `apply`/`note` path — find where `fought`/`gathered` events become log strings), add:

```ts
case "engaged": log.unshift(`⚔ engaged the ${name(e.creature)} (${e.monsterHp} HP)`); break;
case "exchanged": log.unshift(`⚔ you hit ${round(e.dmgDealt)} · it hit ${round(e.dmgTaken)} → it: ${round(e.monsterHp)} HP, you: ${round(e.hp)}`); break;
case "fled": log.unshift(`🏃 fled the ${name(e.creature)} — parting hit −${round(e.partingHit)} (HP ${round(e.hp)})`); break;
case "quaffed": log.unshift(`🧪 quaffed ${name(e.defId)} +${round(e.healed)} (HP ${round(e.hp)})`); break;
case "auto-quaff-toggled": log.unshift(`auto-potion ${e.on ? "on" : "off"}`); break;
```

(Adapt mechanically to the file's actual log-translation shape — if it's if/else on `e.type`, match that.)

- [ ] **Step 3: Console — engagement printout**

In `src/sim/playtest.ts` `printExpedition`, before the map render, when `exp.combat` is set:

```ts
if (exp.combat) {
  const c = exp.combat;
  const dmgOut = playerDamage(exp.loadout, c.creature) + c.damageAdd;
  const dmgIn = damageTaken(exp.loadout, c.creature, c.mitigationAdd);
  console.log(`\n=== ENGAGED: ${c.creature} — ${c.monsterHp} HP · you hit ${dmgOut}, it hits ${dmgIn} · actions: fight | flee | quaff | toggle-auto-quaff ===`);
}
```

(imports from `../engine/combat`.)

- [ ] **Step 4: Verify in the browser**

Start the dev server (`.claude/launch.json` config if present, else `bun run dev`/vite per package.json), embark, walk into a monster, and verify: engagement panel renders with both HP bars and the forecast; Fight advances one round; Flee disengages with the parting-hit log line; Potion enables only when damaged; auto-potion toggle flips. Take a screenshot as evidence.

- [ ] **Step 5: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint` (regenerate render snapshots deliberately if the console/expedition output is snapshotted).

```bash
git add -A
git commit -m "si7.1: engagement UI — forecast panel, fight/flee/potion buttons, console parity"
```

---

### Task 5: Docs + final verification (bead si7.1.3)

**Files:**
- Modify: `docs/decisions.md` (new D-row — next free number, D43 if e3j took D42)
- Modify: `docs/balance-levers.md` (Combat section)
- Test: full suite re-run; no code changes expected

**Interfaces:**
- Consumes: everything above. Produces: documentation only.

- [ ] **Step 1: decisions.md D-row**

Add the next D-row following the table's format: combat-alive (si7.1) — % mitigation `dmgIn = max(chip, dmg × MITIGATION_K/(K+D))` supersedes flat subtraction (fixes M7 F1 plate-floors-everything); tier curves steepened (dmg 4/8/14/24, HP 8/16/28/54) to matchup-scaled toll bands; roster completed (shell-beetle/mirage-wisp/ice-crab) + weighted `creatureTable` (Wyrm 1-in-16); atomic combat → engagements (`Expedition.combat`) with `fight`-as-one-exchange, `flee` (parting hit, monster resets), `quaff`, `autoQuaff` toggle; battle items consume at engagement start; non-combat actions reject `engaged` (amends "return always legal" — flee is the always-out). Note absorbed beads (2g7.6, 82r's manual-potion half) and the re-verified D34 Wyrm gate. Rationale: playtest v2 G1 — cite the spec `docs/superpowers/specs/2026-07-06-combat-alive-design.md`.

- [ ] **Step 2: balance-levers.md Combat section**

Update: `MITIGATION_K` (new — the armour-power dial: higher = armour matters less), curves' new values + the toll-band targets they encode, `creatureTable` now weighted (Wyrm rarity is a weight), new monster parts/recipes, engagement notes (`AUTO_POTION_THRESHOLD` now drives auto-quaff inside exchanges; flee's price = one `damageTaken` hit). Keep the "levers we most expect to tune" list current (`MITIGATION_K` joins it).

- [ ] **Step 3: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green, no code changes needed. If anything is red, a prior task left debt — fix THAT task's code, don't patch here.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "si7.1: decisions D-row + balance-levers for percentage mitigation, weighted roster, engagements"
```

(Bead closing, merge, and push are the controller's branch-finish step — not part of this task.)
