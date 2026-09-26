# Combat Info Perception Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the exact pre-fight scout forecast with passive, range-gated qualitative perception, and teach the RPS/affinity lesson in the post-fight report.

**Architecture:** A new pure `perceive.ts` returns per-POI structured detail only within an effective radius (base + tool bonuses); the scout action/event/levers are torn out entirely. A new pure `explainMatchup` in `combat.ts` returns structured matchup facts that the `fought` event carries. The render layer maps facts → vague flavor. Engine stays the source of truth (sim/AI read facts); the human UI flavors them.

**Tech Stack:** TypeScript, bun (`bun test`), ESLint flat config (engine-purity boundary).

## Global Constraints

- Engine is pure: `reduce(state, action) → {state, events}`, seed in state, no DOM / `Math.random` / `Date.now`, no imports from `render`/`sim`/`web`. Lint-enforced; `test/boundary.test.ts`. `src/engine/perceive.ts` imports only `src/engine/**` + `src/data/**`.
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- Engine exposes **structured facts, never a fight outcome**, in perception. Flavor lives in `src/render`/`src/web`.
- No dead code for a future "active scout" — remove it cleanly.
- Gates for every task: `bun test` + `bun run typecheck` + `bun run lint` green before commit.

---

### Task 1: Tear out the scout action, event, and levers

**Files:**
- Modify: `src/engine/types.ts` (remove `{type:"scout"}` from `Action`; remove the `scouted` `GameEvent` variant)
- Modify: `src/engine/reduce.ts` (remove `case "scout"`, the `scout()` fn, now-unused imports)
- Modify: `src/sim/legal.ts:50` (remove the scout candidate)
- Modify: `src/web/main.ts` (remove `scouted` fmt case:96, `canScout`:306, scout button:355)
- Modify: `src/data/constants.ts` (remove `SCOUT_ENERGY_COST`/`SCOUT_RADIUS`/`SCOUT_TOOL`; change `TOOL_CAPABILITY.spyglass` `"scout"→"vision"`)
- Delete: `test/reduce-scout.test.ts`

**Interfaces:**
- Produces: no `scout` action or `scouted` event anywhere; spyglass remains a craftable tool with capability `"vision"`.

- [ ] **Step 1: Delete the scout test.** Run: `git rm test/reduce-scout.test.ts`.

- [ ] **Step 2: Remove the action + event from `src/engine/types.ts`.** Delete the line `  | { type: "scout" }` (line 69). Delete the entire `scouted` variant block (lines 138-152, from `  | {` through the `}[];` and closing `}` of that variant).

- [ ] **Step 3: Remove scout from the reducer.** In `src/engine/reduce.ts`: delete the `case "scout":\n      return scout(state);` lines (33-34). Delete the whole `function scout(...) { ... }` (lines 327-375). In the `../data/constants` import (line 12), remove `MONSTERS, MONSTER_TIER_HP_CURVE, MONSTER_TIER_DMG_CURVE, SCOUT_ENERGY_COST, SCOUT_RADIUS, SCOUT_TOOL` (each is used only by `scout()` — verified). Keep `PLAYER_BASE_HP` and the rest.

- [ ] **Step 4: Remove the sim candidate.** In `src/sim/legal.ts`, delete line 50 `  candidates.push({ type: "scout" });`.

- [ ] **Step 5: Remove the web scout UI.** In `src/web/main.ts`: delete the `case "scouted":` line (96); delete `const canScout = legal.some((a) => a.type === "scout");` (306); delete the scout button `${canScout ? \`<button data-act="scout">🔭 Scout</button>\` : ""}` (355).

- [ ] **Step 6: Remove the levers.** In `src/data/constants.ts`, delete `SCOUT_ENERGY_COST`, `SCOUT_RADIUS`, `SCOUT_TOOL` (lines ~348-350). Change the spyglass capability from `spyglass: "scout"` to `spyglass: "vision"` in `TOOL_CAPABILITY` (update the trailing comment to "vision range; NODE_TOOL never asks for it").

- [ ] **Step 7: Run the gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: all green (scout fully gone; nothing references the removed symbols). If `tsc` flags an unreachable `scouted` case or unused import, remove it.

- [ ] **Step 8: Commit.**

```bash
git add -A
git commit -m "9u9.2: tear out the scout action/event/levers (supersedes D11 forecast)"
```

---

### Task 2: Perception levers + pure `perceive.ts`

**Files:**
- Modify: `src/data/constants.ts` (add `DETAIL_RADIUS`, `VISION_RANGE_BONUS`)
- Create: `src/engine/perceive.ts`
- Test: `test/perceive.test.ts`

**Interfaces:**
- Consumes: `Grid`/`Poi` (`src/engine/grid.ts`), `Coord` (`src/engine/move.ts`), `MONSTERS`, `MATERIAL_TIER`, `NodeType`, `DmgType`, `ArmourType`.
- Produces:
  - `DETAIL_RADIUS: number`, `VISION_RANGE_BONUS: Record<string, number>`.
  - `type PoiDetail = { tier: number; dmgType?: DmgType; armourType?: ArmourType; creature?: string; material?: string }`
  - `type PerceivedPoi = { x: number; y: number; kind: NodeType; detail: PoiDetail | null }`
  - `perceive(grid: Grid, playerPos: Coord, tools: string[]): PerceivedPoi[]`

- [ ] **Step 1: Add the levers.** In `src/data/constants.ts`, near the map levers (after `FOOD_REACH_MIN`), add:

```ts
// Perception (9u9.2): node KIND is always visible; a node's qualitative identity
// (species/material/tier/dmg+armour type — never the fight outcome) resolves only
// within this Chebyshev radius of the player. Tools in VISION_RANGE_BONUS widen it
// (data-driven like TERRAIN_GATE; future glasses/cartography/scent items slot in).
export const DETAIL_RADIUS = 2;
export const VISION_RANGE_BONUS: Record<string, number> = { spyglass: 3 }; // spyglass → radius 5
```

- [ ] **Step 2: Write the failing test.** Create `test/perceive.test.ts`:

```ts
import { test, expect } from "bun:test";
import { perceive } from "../src/engine/perceive";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { DETAIL_RADIUS } from "../src/data/constants";

const cheby = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test("perceive: kind is always present; detail only within DETAIL_RADIUS", () => {
  const seed = "perceive-1";
  const grid = generateGrid(seed, rollBiome(seed));
  const at = grid.pois[0]!; // stand on the first POI
  const seen = perceive(grid, { x: at.x, y: at.y }, []);
  expect(seen.length).toBe(grid.pois.length);
  for (const p of seen) {
    const src = grid.pois.find((g) => g.x === p.x && g.y === p.y)!;
    expect(p.kind).toBe(src.kind); // kind always known
    if (cheby(at, p) <= DETAIL_RADIUS) expect(p.detail).not.toBeNull();
    else expect(p.detail).toBeNull();
  }
});

test("perceive: detail carries facts (tier + type/identity), never an outcome", () => {
  const seed = "perceive-2";
  const grid = generateGrid(seed, rollBiome(seed));
  const monster = grid.pois.find((p) => p.kind === "monster")!;
  const seen = perceive(grid, { x: monster.x, y: monster.y }, []);
  const m = seen.find((p) => p.x === monster.x && p.y === monster.y)!;
  expect(m.detail).not.toBeNull();
  expect(m.detail!.tier).toBeGreaterThan(0);
  expect(m.detail!.dmgType).toBeDefined();
  expect(m.detail!.armourType).toBeDefined();
  expect(m.detail!.creature).toBe(monster.creature!);
  // no outcome fields ever
  expect((m.detail as Record<string, unknown>).victory).toBeUndefined();
  expect((m.detail as Record<string, unknown>).hpLost).toBeUndefined();
});

test("perceive: spyglass extends the detail radius", () => {
  const seed = "perceive-3";
  const grid = generateGrid(seed, rollBiome(seed));
  // A POI just outside base radius but inside spyglass radius from some tile.
  const origin = grid.entry;
  const far = grid.pois.find((p) => {
    const d = cheby(origin, p);
    return d > DETAIL_RADIUS && d <= DETAIL_RADIUS + 3;
  });
  if (!far) return; // seed-dependent; the two asserts below only run when one exists
  const bare = perceive(grid, origin, []).find((p) => p.x === far.x && p.y === far.y)!;
  const glass = perceive(grid, origin, ["spyglass"]).find((p) => p.x === far.x && p.y === far.y)!;
  expect(bare.detail).toBeNull();
  expect(glass.detail).not.toBeNull();
});
```

- [ ] **Step 3: Run, verify fail.** Run: `bun test test/perceive.test.ts`. Expected: FAIL (`perceive` not found).

- [ ] **Step 4: Implement.** Create `src/engine/perceive.ts`:

```ts
// Passive, range-gated perception (9u9.2). Pure: node KIND is always visible;
// a node's qualitative identity resolves only within the effective detail radius
// (DETAIL_RADIUS + equipped VISION_RANGE_BONUS). Returns STRUCTURED FACTS ONLY —
// never a fight outcome, never the hidden affinity (discovered post-fight).
import { DETAIL_RADIUS, VISION_RANGE_BONUS, MONSTERS, MATERIAL_TIER } from "../data/constants";
import type { NodeType, DmgType, ArmourType } from "../data/constants";
import type { Grid } from "./grid";
import type { Coord } from "./move";

export type PoiDetail = {
  tier: number;
  dmgType?: DmgType;
  armourType?: ArmourType;
  creature?: string;
  material?: string;
};
export type PerceivedPoi = { x: number; y: number; kind: NodeType; detail: PoiDetail | null };

export function visionRadius(tools: string[]): number {
  let r = DETAIL_RADIUS;
  for (const t of tools) r += VISION_RANGE_BONUS[t] ?? 0;
  return r;
}

export function perceive(grid: Grid, playerPos: Coord, tools: string[]): PerceivedPoi[] {
  const radius = visionRadius(tools);
  return grid.pois.map((p) => {
    const inRange = Math.max(Math.abs(p.x - playerPos.x), Math.abs(p.y - playerPos.y)) <= radius;
    if (!inRange) return { x: p.x, y: p.y, kind: p.kind, detail: null };
    let detail: PoiDetail;
    if (p.kind === "monster" && p.creature) {
      const m = MONSTERS[p.creature]!;
      detail = { tier: m.tier, dmgType: m.dmgType, armourType: m.armourType, creature: p.creature };
    } else {
      const tier = p.material ? (MATERIAL_TIER[p.material] ?? 1) : 1;
      detail = { tier, ...(p.material ? { material: p.material } : {}) };
    }
    return { x: p.x, y: p.y, kind: p.kind, detail };
  });
}
```

- [ ] **Step 5: Run, verify pass + boundary.** Run: `bun test test/perceive.test.ts test/boundary.test.ts`. Expected: PASS (pure, engine-only imports).

- [ ] **Step 6: Commit.**

```bash
git add src/data/constants.ts src/engine/perceive.ts test/perceive.test.ts
git commit -m "9u9.2: passive range-gated perceive() + vision levers"
```

---

### Task 3: `explainMatchup` + `fought` event carries `matchup`

**Files:**
- Modify: `src/engine/combat.ts` (add `Matchup` type + `explainMatchup`)
- Modify: `src/engine/types.ts` (add `matchup` to the `fought` event)
- Modify: `src/engine/reduce.ts:293-302` (populate `matchup` in the `fought` event)
- Test: `test/combat.test.ts`

**Interfaces:**
- Consumes: `Loadout`, `MONSTERS`, `WEAPONS`, `ARMOUR`, `DMG_ARMOUR_MATRIX`, `AFFINITIES` (all in `combat.ts` already), `ARMOUR_SLOTS`.
- Produces:
  - `type Matchup = { weaponVsHide: number | null; affinityFired: boolean; armourVsAttack: "resisted" | "neutral" | "exposed" }`
  - `explainMatchup(loadout: Loadout, monsterId: string): Matchup`
  - `fought` event gains `matchup: Matchup`.

- [ ] **Step 1: Write the failing test.** Append to `test/combat.test.ts`:

```ts
import { explainMatchup } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";

function loadoutWith(patch: Partial<ReturnType<typeof emptyLoadout>["equipment"]>) {
  const l = emptyLoadout();
  Object.assign(l.equipment, patch);
  return l;
}

test("explainMatchup: right-type weapon beats the hide (>1), wrong-type glances (<1)", () => {
  // fire-staff (magic) vs ice-troll (plate): magic→plate = 1.5 (>1)
  expect(explainMatchup(loadoutWith({ weapon: "fire-staff" }), "ice-troll").weaponVsHide).toBeGreaterThan(1);
  // bow (ranged) vs ice-troll (plate): ranged→plate = 0.5 (<1)
  expect(explainMatchup(loadoutWith({ weapon: "bow" }), "ice-troll").weaponVsHide).toBeLessThan(1);
});

test("explainMatchup: affinity pairing fires", () => {
  // silver-sword (silver) vs werewolf (werewolf tag) → affinity
  expect(explainMatchup(loadoutWith({ weapon: "silver-sword" }), "werewolf").affinityFired).toBe(true);
  expect(explainMatchup(loadoutWith({ weapon: "sword" }), "werewolf").affinityFired).toBe(false);
});

test("explainMatchup: armour class vs incoming damage type classifies", () => {
  // plate chest vs ranged (ancient-wyrm is magic, use ice-troll=melee / sand-raider=ranged)
  // sand-raider = ranged; plate→ranged matrix 0.5 (<1) → resisted
  expect(explainMatchup(loadoutWith({ chest: "plate-chest" }), "sand-raider").armourVsAttack).toBe("resisted");
  // plate vs magic (dust-vampire=magic): plate→magic 1.5 (>1) → exposed
  expect(explainMatchup(loadoutWith({ chest: "plate-chest" }), "dust-vampire").armourVsAttack).toBe("exposed");
  // no armour → neutral
  expect(explainMatchup(emptyLoadout(), "sand-raider").armourVsAttack).toBe("neutral");
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/combat.test.ts`. Expected: FAIL (`explainMatchup` not found).

- [ ] **Step 3: Implement `explainMatchup`.** In `src/engine/combat.ts`, add after `mitigation(...)`:

```ts
export type Matchup = {
  weaponVsHide: number | null; // matrix multiplier of weapon type vs monster hide; null if unarmed
  affinityFired: boolean; // a hidden affinity triggered (the discovery channel)
  armourVsAttack: "resisted" | "neutral" | "exposed"; // how the player's armour fared vs monster dmgType
};

// Post-fight lesson facts (9u9.2). Pure — the render layer flavors these into
// "your blade skated off its hide" etc. Teaches the RPS system + affinity by playing.
export function explainMatchup(loadout: Loadout, monsterId: string): Matchup {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const weaponVsHide = weapon
    ? DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : null;
  const affinityFired = AFFINITIES.some(
    (a) => monster.tags.includes(a.monsterTag) && (weapon?.tags ?? []).includes(a.itemTag),
  );
  // Average how each equipped armour piece's class fares vs the incoming dmg type.
  let sum = 0, n = 0;
  for (const slot of ARMOUR_SLOTS) {
    const pieceId = loadout.equipment[slot];
    if (pieceId === null) continue;
    const piece = ARMOUR[pieceId];
    if (!piece) continue;
    sum += DMG_ARMOUR_MATRIX[monster.dmgType][piece.armourType];
    n += 1;
  }
  const armourVsAttack: Matchup["armourVsAttack"] =
    n === 0 ? "neutral" : sum / n < 1 ? "resisted" : sum / n > 1 ? "exposed" : "neutral";
  return { weaponVsHide, affinityFired, armourVsAttack };
}
```

- [ ] **Step 4: Add `matchup` to the `fought` event.** In `src/engine/types.ts`, inside the `fought` variant, add after `hp: number;`:

```ts
      matchup: import("./combat").Matchup;
```

(Or add `import type { Matchup } from "./combat";` at the top of `types.ts` and use `matchup: Matchup;` — match the file's existing import style. NOTE: `combat.ts` imports types from `types.ts`; a `import type` back-reference is fine — TS erases type-only imports so there's no runtime cycle.)

- [ ] **Step 5: Populate it in the reducer.** In `src/engine/reduce.ts`, import `explainMatchup` alongside `resolveCombat, rollLoot` (line 7). In `fightAt`, the `fought` event object (lines 293-302), add:

```ts
    matchup: explainMatchup(expedition.loadout, creature),
```

- [ ] **Step 6: Run, verify pass.** Run: `bun test test/combat.test.ts test/reduce-fight.test.ts`. Expected: PASS. If `reduce-fight.test.ts` asserts the exact `fought` event shape, add the `matchup` field to its expected object(s).

- [ ] **Step 7: Full gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: green.

- [ ] **Step 8: Commit.**

```bash
git add src/engine/combat.ts src/engine/types.ts src/engine/reduce.ts test/combat.test.ts test/reduce-fight.test.ts
git commit -m "9u9.2: explainMatchup + fought event carries matchup facts"
```

---

### Task 4: Render flavor — pure `flavorDetail` + `matchupLessons`

**Files:**
- Modify: `src/render/render.ts` (add two pure flavor functions)
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `PoiDetail` (`src/engine/perceive.ts`), `Matchup` (`src/engine/combat.ts`).
- Produces:
  - `flavorDetail(detail: PoiDetail | null, kind: NodeType): string` — vague human text (kind-only when `detail` is null).
  - `matchupLessons(matchup: Matchup, weaponId: string | null): string[]` — 0-2 salient lesson lines.

- [ ] **Step 1: Write the failing test.** Append to `test/render.test.ts`:

```ts
import { flavorDetail, matchupLessons } from "../src/render/render";

test("flavorDetail: null detail gives kind-only text; monster detail is vague, no numbers", () => {
  expect(flavorDetail(null, "monster")).toBe("a monster");
  const txt = flavorDetail({ tier: 3, dmgType: "magic", armourType: "plate", creature: "ice-troll" }, "monster");
  expect(txt).not.toMatch(/\d/); // no exact numbers leak
  expect(txt.length).toBeGreaterThan(0);
});

test("matchupLessons: surfaces affinity + weapon-vs-hide + armour result", () => {
  const l = matchupLessons({ weaponVsHide: 0.5, affinityFired: true, armourVsAttack: "exposed" }, "bow");
  expect(l.length).toBeGreaterThan(0);
  expect(l.join(" ")).toMatch(/savaged|something/i); // affinity line present
  const none = matchupLessons({ weaponVsHide: 1, affinityFired: false, armourVsAttack: "neutral" }, "sword");
  expect(none.length).toBe(0); // nothing notable → no noise
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/render.test.ts`. Expected: FAIL (functions not found).

- [ ] **Step 3: Implement.** In `src/render/render.ts`, add:

```ts
import type { PoiDetail } from "../engine/perceive";
import type { Matchup } from "../engine/combat";
import type { DmgType, ArmourType, NodeType } from "../data/constants";

const DMG_FLAVOR: Record<DmgType, string> = {
  melee: "it moves to strike",
  ranged: "it keeps its distance",
  magic: "an odd sheen ripples off its skin",
};
const HIDE_FLAVOR: Record<ArmourType, string> = {
  plate: "a thick, scaled hide",
  light: "a lean, quick frame",
  robe: "a soft, unarmoured shape",
};
const SIZE_FLAVOR = ["", "a small", "a fair-sized", "a large", "a towering"]; // by tier 1-4

// Vague, learn-the-vocabulary text from perception facts. Never numbers/outcome.
export function flavorDetail(detail: PoiDetail | null, kind: NodeType): string {
  if (detail === null) return kind === "monster" ? "a monster" : `a ${kind} node`;
  if (kind === "monster") {
    const size = SIZE_FLAVOR[detail.tier] ?? "a";
    return `${size} creature — ${detail.armourType ? HIDE_FLAVOR[detail.armourType] : "unclear form"}; ${detail.dmgType ? DMG_FLAVOR[detail.dmgType] : ""}`.trim();
  }
  return detail.material ?? `a ${kind} node`;
}

// 0-2 salient post-fight lessons; empty when nothing notable happened.
export function matchupLessons(matchup: Matchup, weaponId: string | null): string[] {
  const out: string[] = [];
  if (matchup.affinityFired) out.push("something in your weapon savaged it");
  if (matchup.weaponVsHide !== null && matchup.weaponVsHide < 1) out.push("your weapon skated off its hide");
  else if (matchup.weaponVsHide !== null && matchup.weaponVsHide > 1) out.push("you found the gap in its guard");
  if (matchup.armourVsAttack === "exposed") out.push("its attacks tore through your armour");
  else if (matchup.armourVsAttack === "resisted") out.push("your armour turned the blows aside");
  return out.slice(0, 2);
}
```

(If `test/render.test.ts` calls with `weaponId` unused inside, that's fine — it's part of the interface for the web caller. Keep the param.)

- [ ] **Step 4: Run, verify pass.** Run: `bun test test/render.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/render/render.ts test/render.test.ts
git commit -m "9u9.2: render flavor for perception detail + post-fight lessons"
```

---

### Task 5: Web integration — perceive-gated map + hover + post-fight lessons

**Files:**
- Modify: `src/web/main.ts` (compute `perceive`; gate tile tooltips + here-panel by detail; render fought lessons)
- Modify: `test/__snapshots__/render.test.ts.snap` if the render snapshot shifts (via `--update-snapshots`)

**Interfaces:**
- Consumes: `perceive` (Task 2), `flavorDetail`/`matchupLessons` (Task 4), `PerceivedPoi`.

- [ ] **Step 1: Import the new helpers.** In `src/web/main.ts`, add imports for `perceive` from `../engine/perceive` and `flavorDetail, matchupLessons` from `../render/render`.

- [ ] **Step 2: Compute perception in `expeditionView`.** After `const grid = generateGrid(...)` (line 304), add:

```ts
  const perceived = new Map(
    perceive(grid, exp.pos, exp.loadout.equipment.tools).map((p) => [`${p.x},${p.y}`, p]),
  );
```

- [ ] **Step 3: Gate the tile tooltip by detail.** Replace the `title` expression (lines 327-329) so out-of-range POIs show only their kind:

```ts
    const per = poi ? perceived.get(k) : undefined;
    const title = poi
      ? (per && per.detail ? flavorDetail(per.detail, poi.kind) : (poi.kind === "monster" ? "a monster" : `a ${poi.kind} node`))
      : grid.terrain[y]![x]!;
```

- [ ] **Step 4: Flavor the here-panel monster line.** In `herePanel` (the `poi.kind === "monster"` branch, ~lines 281-289), replace the explicit `tier ${m.tier}, ${m.dmgType} damage, ${m.armourType} hide` with the flavored perception (you are on the tile, so it's always in range):

```ts
  if (poi.kind === "monster" && poi.creature) {
    const per = perceive(grid, exp.pos, exp.loadout.equipment.tools).find((p) => p.x === poi.x && p.y === poi.y);
    const desc = flavorDetail(per?.detail ?? null, "monster");
    return `<div class="here monster">
      <b>Here:</b> a <b>${name(poi.creature!)}</b> — <i>${desc}</i>.
      It's static: it won't touch you unless you Fight. You can just walk past it.
      ${canFight ? `<button data-act="fight">⚔ Fight the ${name(poi.creature!)}</button>` : `<span class="warn">can't fight (bag full for its loot?)</span>`}
    </div>`;
  }
```

(`herePanel(grid, exp, legal)` already receives `grid`+`exp`; use them. If its signature lacks `exp`, thread it through — the call site is line 352.)

- [ ] **Step 5: Render post-fight lessons.** In the `fmt` `fought` case (lines 93-95), append the lessons to the victory/defeat line:

```ts
    case "fought": {
      const lessons = matchupLessons(e.matchup, /*weaponId*/ null);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      return (e.victory
        ? `⚔ beat the ${name(e.creature)} · −${round(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
        : `☠ the ${name(e.creature)} downed you · run ends, haul kept`) + tail;
    }
```

- [ ] **Step 6: Typecheck + lint.** Run: `bun run typecheck && bun run lint`. Expected: green (no `scout`/`scouted` references remain; new imports resolve).

- [ ] **Step 7: Full test + snapshot refresh.** Run: `bun test`. If a render snapshot changed, run `bun test --update-snapshots` and inspect `git diff test/__snapshots__` to confirm only log-text/tooltip flavor changed.

- [ ] **Step 8: Manual smoke (optional but recommended).** Run the web build per the project's run path and confirm: distant monsters read "a monster", nearby ones show flavor, a spyglass in the loadout widens the reveal, and a fight prints a lesson line.

- [ ] **Step 9: Commit.**

```bash
git add src/web/main.ts test/__snapshots__
git commit -m "9u9.2: web — perceive-gated map/here-panel + post-fight lessons"
```

---

### Task 6: Docs + bead

**Files:**
- Modify: `docs/decisions.md` (supersede D11)
- Modify: `docs/balance-levers.md` (perception levers)

- [ ] **Step 1: Supersede D11.** In `docs/decisions.md`, add a new decision entry (next Dnn) recording: spyglass no longer pre-computes the fight outcome; perception is passive, range-gated, qualitative-only; spyglass grants vision *range*. Note it supersedes D11.

- [ ] **Step 2: Document the levers.** In `docs/balance-levers.md`, add `DETAIL_RADIUS`, `VISION_RANGE_BONUS` (and remove the retired `SCOUT_*` entries if listed).

- [ ] **Step 3: Re-run the sustainability harness.** Run: `bun test test/harness-sustainability.test.ts`. Expected: PASS (scout's energy cost is gone; confirm the economy still holds).

- [ ] **Step 4: Commit + close the bead.**

```bash
git add docs/decisions.md docs/balance-levers.md
git commit -m "9u9.2: decisions (supersede D11) + balance-levers for perception"
bd close idle-adventure-9u9.2 --reason="Passive detail-perception + post-fight lessons shipped; scout forecast removed. Plan: 2026-07-06-combat-info-perception.md"
```

---

## Self-Review

**Spec coverage:**
- §3 perception model (perceive.ts, levers, structured facts, spyglass range) → Tasks 1 (levers removal), 2. ✓
- §4 post-fight lessons (explainMatchup, fought.matchup) → Task 3. ✓
- §5 human presentation (flavorDetail, matchupLessons) → Tasks 4, 5. ✓
- §6 teardown (action/event/reducer/legal/web/tests/spyglass capability) → Task 1. ✓
- §9 testing (perceive, explainMatchup, legal no scout, fought carries matchup, snapshot, sustainability, docs) → Tasks 2,3,5,6. ✓

**Placeholder scan:** No TBD/TODO; all steps carry concrete code or exact edits. The one seed-dependent early-return in the perceive spyglass test is intentional and commented. ✓

**Type consistency:** `PoiDetail`/`PerceivedPoi`/`perceive` identical across Tasks 2, 4, 5. `Matchup`/`explainMatchup` identical across Tasks 3, 4. `flavorDetail(detail, kind)` / `matchupLessons(matchup, weaponId)` identical across Tasks 4, 5. `fought.matchup` added in Task 3, consumed in Task 5. ✓
