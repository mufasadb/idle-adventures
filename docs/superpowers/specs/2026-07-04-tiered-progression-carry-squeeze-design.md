# Tiered Progression + Firm Carry Squeeze — Design

> **⚠ Partially superseded (D78, 2026-07-11, `idle-adventure-3du`).** The **quality == tier** mechanic below — a numeric `MATERIAL_TIER` ladder where a tool's `TOOL_QUALITY` doubled as both the gather-cost divisor and the tier a material demanded — is **retired**. Progression is now a path/tree of **explicit gates**: `MATERIAL_GATE` (an any-of unlocking-tool list per material, mirroring `RECIPE.requires`) carries ACCESS, and `TOOL_SPEED` carries only the cost divisor. The gating BEHAVIOUR (coal needs an iron pick, mithril the steel pick, …) is preserved byte-for-byte — only the numeric-ladder framing is gone. Read the "can't mine coal until you have an iron pick" intent below as a `MATERIAL_GATE` edge, not a tier comparison. The carry-squeeze half of this spec stands.

**Date:** 2026-07-04
**Status:** Design approved (brainstorm), implemented; progression half superseded by D78 (see note above).
**Motivation:** M7 feel-assessment (`docs/m7-feel-assessment.md`) findings F1 (best gear trivializes combat with no climb behind it), F2 (carry squeeze too soft), F4 (first upgrade too slow / undifferentiated). This is the M7 → iterate pass.

**User calls that frame this design:**
- Best gear *should* trivialize combat — that's fine **as long as it's hard and slow to earn**. Early game, before full gear, must require choices.
- Make the climb hard via **cost + gating/tiering**, not by changing combat math. Concretely: "can't mine coal until you have an iron pick."
- Gate crafting the same way across **all** verticals (gear, tools, consumables, transport, backpack).
- Depth: a **gated tier ladder, no smelting** (keep D10 instant craft). Squeeze: **firm** (STACK_CAP ~5, packs 3/5/7). Scope: **everything**.

---

## 1. The spine — a gather-tool **tier gate** (the one new mechanic)

Today `TOOL_QUALITY` only scales gather *cost*. We reinterpret each tool's quality as its **tier**, and gate gathering on it. This single mechanic enforces the entire tech tree with **no processing/smelting step** — you can't craft steel gear because you can't mine coal, because you don't yet have an iron pick.

- **New lever `MATERIAL_TIER: Record<string, number>`** (material defId → tier; absent = tier 1).
- **`gather` gains a tier check.** After the existing node-type → required-capability check and the "do you hold a tool with that capability" check, compare the **best held tool's quality** for that capability against the node's `MATERIAL_TIER[material]`. If `bestToolTier < materialTier` → reject.
- **New `RejectionReason: "tool-too-weak"`** (added to the closed union, D30).
- **`legalActions` gets this for free** — it filters candidates through speculative `reduce` (D29), so a locked node simply isn't offered `gather`. No parallel logic, no drift.
- **UX intent:** a locked node is *visible but not workable* — you see the coal, you know you need a better pick. That is the pull up the ladder. `tool-too-weak` is distinct from `missing-tool` (no tool of the type at all) so the UI/AI can say "needs a better pick" vs "needs a pick."

`TOOL_QUALITY` keeps its second job (gather cost divisor), so a higher-tier tool also mines faster — tier and speed rise together, which reads naturally.

---

## 2. The ladders

All tiers are gated **implicitly** by §1: a recipe becomes reachable only once you can mine/gather its inputs. No recipe needs an explicit "requires tool X" field — the gather gate on its inputs does that job.

### 2.1 Ore / fuel (mining) — the backbone
| Material | Tier | Gated behind | Biome weighting |
|----------|------|--------------|-----------------|
| copper-ore, iron-ore | 1 | basic pick | desert (copper), desert/woodland (iron) |
| **coal** *(new)* | 2 | iron-pick | desert + tundra mining tables |
| silver-ore | **2** *(was ungated)* | iron-pick | tundra (best) |
| **mithril-ore** *(new)* | 3 | steel-pick | tundra (rare), desert (rarer) |

Silver moving to T2 makes the werewolf-affinity silver-sword a mid-climb reward rather than a turn-1 option.

### 2.2 Gather tools (tiered; quality == max tier gatherable)
| Line | T1 | T2 | T3 |
|------|----|----|----|
| pick | pick (q1) | iron-pick (q2) | **steel-pick (q3)** |
| axe  | axe (q1)  | iron-axe (q2)  | **steel-axe (q3)** |
| knife| knife (q1)| **steel-knife (q2)** | — |

New tiered gatherables to give axe/knife a reason to climb (§2.1 symmetry): **ironwood-log** (T2, wood, needs iron-axe), **drake-hide** (T2, animal, needs steel-knife). Each tool tier is crafted from the previous tier's newly-unlocked material (e.g. steel-pick needs coal → needs iron-pick first).

### 2.3 Weapons (melee full ladder; ranged/magic get one upgrade to keep type choice)
| Type | T1 | T2 | T3 |
|------|----|----|----|
| melee | sword (dmg 3), iron-sword (dmg 3, `iron` tag → fae affinity) | steel-sword (dmg 4), silver-sword (dmg 3, `silver` → werewolf) | **mithril-sword (dmg 6)** |
| ranged | bow (dmg 3) | composite-bow (dmg 4) | — |
| magic | fire-staff (dmg 3) | inferno-staff (dmg 4) | — |

Damage scales **modestly** (3→4→6) so armour type still matters even against a tier-up weapon.

### 2.4 Armour — keep all 3 **types** (matrix choice stays alive early), tier the **defense**
Existing `plate-*` / `light-*` / `robe-*` defIds stay as **tier 1** (no churn). Add higher tiers as new defIds:

| Type | T1 (existing) | T2 | T3 |
|------|---------------|----|----|
| plate | plate-* (def 2/3/2/1/1) | steel-plate-* (+1 each) | **mithril-plate-* (+2 over T1)** |
| light | light-* | studded-* (+1 each) | — |
| robe  | robe-*  | enchanted-* (+1 each) | — |

Full **mithril plate is the combat trivializer** (F1) — deliberately kept, because it sits at the top of the longest climb: basic pick → iron-pick → mine coal → steel gear/steel-pick → mine mithril → mithril plate. Light/robe get 2 tiers — enough to stay competitive by matchup early, without a full T3.

### 2.5 Consumables / transport / backpack ("everything")
| Line | T1 | T2 | Lever change |
|------|----|----|--------------|
| food | ration (10 energy) | **trail-ration (20 energy)** | **new `FOOD_ENERGY: Record<string,number>`** replaces flat `ENERGY_PER_FOOD` (kept as the default) |
| potion | potion (heal 10) | **greater-potion (heal 20)** | **new `POTION_HEAL_BY: Record<string,number>`** replaces flat `POTION_HEAL` (kept as default) |
| transport | horse (÷1.5) | **wagon (÷2.0)** | add `wagon` to `TRANSPORT_MULTIPLIER` |
| backpack | starter (3), leather (5) | **large-pack (7)** | see §3 |

Progression **earns slot efficiency**: trail-ration packs 20 energy per item, so a better-fed player fights the squeeze — a reward, by design. T2 consumables are gated by a T2 input (e.g. trail-ration cooked over **coal**; greater-potion needs **silver-ore**), so they too sit behind the iron-pick.

---

## 3. The carry squeeze (F2 fix)

- `STACK_CAP`: 10 → **5**.
- `BACKPACK_SLOTS`: starter **3**, leather **5**, **large-pack 7** (new).
- `BASE_CARRY_SLOTS`: unchanged (2).

Now one food stack holds 5 rations (50 energy), not 100; materials cap at 5/stack so a real haul opens more slots; and food-vs-loot plus backpack tier become live per-run decisions. `ENERGY_PER_FOOD` default stays 10 (revisit during tuning — with a 50-energy food stack, ice-heavy tundra genuinely wants two food stacks or a horse).

---

## 4. Explicitly NOT in scope

- **No change to combat mitigation math** — trivialization stays; it is gated by the climb, per the user's call.
- **No ore→bar smelting / processing step** — the gather gate is the whole tech tree (D10 instant craft preserved).
- **No new action types** — the tier gate rides inside `gather`; no `smelt`/`process` action.
- **No transport-carry bonus / saddlebags** — wagon only changes move cost.

---

## 5. Levers & files touched (summary)

- `src/data/constants.ts`: `STACK_CAP`, `BACKPACK_SLOTS`, new `MATERIAL_TIER`, reuse `TOOL_QUALITY` as tier, new materials (coal, mithril-ore, ironwood-log, drake-hide), new tools/weapons/armour defIds + `TOOL_CAPABILITY`/`TOOL_QUALITY` entries, `BIOMES[*].materialTable` (add coal/mithril/ironwood/drake), new `FOOD_ENERGY` + `POTION_HEAL_BY`, `TRANSPORT_MULTIPLIER.wagon`, expanded `RECIPE` tree.
- `src/engine/types.ts`: add `"tool-too-weak"` to `RejectionReason`.
- `src/engine/reduce.ts` (gather) + `src/engine/tools.ts`: the tier check; `embark`/consumable use read `FOOD_ENERGY`/`POTION_HEAL_BY`.
- `src/engine/combat.ts`: reads new armour/weapon defIds (data-only; no logic change).
- Tests + M1/M3 generation snapshots will churn (new materials in tables) — expected.

## 6. Implementation shape — 4 sequential phases (one plan)

1. **Carry squeeze** — §3. Small, independent, high-signal. Land first.
2. **Gather-tool tier gate + ore/fuel + tool ladder** — §1, §2.1, §2.2. The spine.
3. **Gear tiers** — §2.3, §2.4. Depends on phase 2's materials.
4. **Consumable / transport / backpack tiers** — §2.5. Per-item energy/heal levers.

Each phase is independently testable and committable, so it can be executed and reviewed at checkpoints.
