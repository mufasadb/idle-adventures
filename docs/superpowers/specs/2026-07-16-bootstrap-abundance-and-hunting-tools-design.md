# Bootstrap Abundance + Hunting-Tool Identity — Design

**Date:** 2026-07-16
**Decision row:** D83 (add on land)
**Origin:** blind playtest 2026-07-15 (`docs/2026-07-15-playtest-findings.md`, F1) — 3/3 blind agents on both surfaces failed to reliably bootstrap their first tool because flint/deadwood are rare, unsignposted rolls in the generic `herb` forage node. This spec makes the bootstrap materials abundant on low-tier maps and, in the same pass, gives the animal-node "hunting" economy a proper tool identity (a trap + a knife) and removes the vestigial `steel-knife` tier.

**Non-negotiables honored:** engine stays pure; no magic numbers in engine logic (all values are named levers in `src/data/`); items remain `{defId, qty}` over the code-side catalog. Balance surfaces changed ⇒ `bun run sim:tables` regen (enforced by `test/balance-tables.test.ts`); every recipe input stays sourced (`7dt` content-invariant); a `decisions.md` D83 row + `balance-levers.md` updates land with the change.

---

## Part A — Bootstrap materials abundant on T1, tapering with tier

**Problem.** In `BIOMES[*].materialTable.herb`, flint/deadwood are minority rolls (woodland forest-herb 7 vs deadwood 3 / flint 2; tundra flint just 1). A fresh player rarely rolls them and can't tell which "H" node holds them, so the first tool is discovered by accident (or never).

**Change.** Bump the **base** herb weights for `flint`/`deadwood` (the base table *is* the T1 table — `tierProfile` is identity at T1) so ~40% of T1 forage yields a tool-material, then add taper rows to `MATERIAL_MAP_TIER_WEIGHT` so higher tiers drift back toward today's scarcity (starter materials shouldn't crowd out higher-value forage deep in).

Proposed base weights (all in `src/data/constants.ts` `BIOMES`):

| Biome | herb table (after) | flint+deadwood share |
|---|---|---|
| woodland | `forest-herb 7, deadwood 6, flint 5, berries 4, desert-sage 2, ice-moss 1, thistle 1` | 11/26 ≈ 42% |
| desert | `desert-sage 7, flint 5, deadwood 5, forest-herb 2, berries 1, ice-moss 1` | 10/21 ≈ 48% |
| tundra | `ice-moss 7, deadwood 5, flint 4, desert-sage 2, thistle 2, berries 1, forest-herb 1` | 9/22 ≈ 41% |

Taper rows (add to `MATERIAL_MAP_TIER_WEIGHT`):

```
flint:    { 2: 0.5, 3: 0.3, 4: 0.2, 5: 0.2 },
deadwood: { 2: 0.5, 3: 0.3, 4: 0.2, 5: 0.2 },
```

**Lever note.** The ~40% share is a dial. `MATERIAL_MAP_TIER_WEIGHT` multiplies the base weight per tier; at T1 it's identity, so the base weights above are exactly the T1 experience. Document both in `balance-levers.md` under the `BIOMES[*]` weights and the `MATERIAL_MAP_TIER_WEIGHT` entries.

**Out of scope (deliberately).** The *marker-legibility* half of F1 (all forage nodes share one "H" glyph, so you can't see which holds flint at range) is NOT addressed here — this spec fixes **supply**, not signposting. Abundance alone means a fresh player hits a tool-material within the first forage trip by sheer density. If post-change playtest still shows discovery friction, a distinct forage-node marker is a separate follow-up (tracked as its own bead).

---

## Part B — Combat loot: NO change

Fightable monsters keep every `LOOT_TABLE` drop (werewolf-pelt, boar-hide, scorpion-carapace, wolf-pelt, beetle-shell, crab-shell, rich-venison, hatchling-scale, …). The "peu" fight-for-power design (§4.2) stands. This section exists to make explicit that an earlier exploration ("beasts drop nothing") was **rejected** — a creature you can fight stays fightable for its parts.

---

## Part C — Hunting gets a real tool identity (trap + knife)

**Intent.** The passive `animal` nodes are the "hunted things." Today they need only the generic `knife` capability. Make hunting a deliberate two-tool activity: you need a **trap** to catch the animal and a **knife** to take its parts.

### C1 — Animal nodes require BOTH a trap and a knife (AND)

Add an **additive secondary-tool lever** rather than making `NODE_TOOL` polymorphic (keeps the change contained and the speed model unchanged):

```ts
// src/data/constants.ts
// A gatherable node kind may require a SECOND capability IN ADDITION to NODE_TOOL[kind].
// Absent = no extra requirement. The primary NODE_TOOL still drives gather SPEED;
// the secondary is a pure binary gate (present or the node is unworkable).
export const NODE_SECONDARY_TOOL: Partial<Record<GatherableNodeType, string>> = {
  animal: "trap", // you need a trap to catch it (NODE_TOOL[animal]="knife" skins it)
};
```

- `NODE_TOOL[animal]` stays `"knife"` (primary → speed via `TOOL_SPEED`, per existing model).
- Reducer `gather()` (`src/engine/reduce.ts`): after the existing `toolSpeedFor(...)` primary check, if `NODE_SECONDARY_TOOL[kind]` is set, verify a tool with that capability is equipped; if missing, reject with `missing-tool` (same `RejectionReason` — no new union member).
- **Both must be present** to work the node. Missing either → the combined copy below. (No speed contribution from the trap; it's binary.)
- `legalActions` and the route/preview cost path get this for free via speculative `reduce` (D29) — no separate legality logic. Verify the reach/preview cost helper (`gatherCost` and the sim `--reach`) still resolve, since they run before the secondary check; the secondary gate only flips *workable*, not cost.

### C2 — Reject copy

`src/render/render.ts` — the animal-node `missing-tool` case names both tools with the requested flavor:

> **"you'll need both a trap to trap the animal and a knife to alleviate it of its parts."**

`nodeToolHint(kind)` / `nodeGateNote` (used by console `printExpedition` and the web nearby-node line) must surface the same combined text so both surfaces telegraph it identically (console-parity discipline). When the player holds one of the two, the hint should still name the *missing* one (e.g. has knife, lacks trap → "needs a trap to catch it") — keep it specific, mirroring the existing per-node tool hints.

### C3 — The new `trap` tool

- **defId `trap`**, capability `"trap"` (`TOOL_CAPABILITY["trap"] = "trap"`). Reusable, one bag slot (a tool; `slotOf` derives tool → 1 slot).
- **Recipe** (`src/data/crafting.ts`): `trap ← 1 deadwood + 1 flint` — stone-age-craftable right alongside the knife (`knife ← 1 flint`), so the hunting economy opens as early as the tool economy. Both come from the now-abundant Part A forage.
- No `TOOL_SPEED` entry needed (binary gate, not a speed tool) — but if `TOOL_SPEED` requires an entry for every capability tool, add `trap` at neutral (1.0) speed; confirm against `constants.test` assertions.
- **Name is a lever.** `trap` is the chosen defId; "snare"/"bear-trap"/"trapper's-kit" are cosmetic alternatives — if renamed, update the catalog + recipe + reject copy together.

### C4 — All hides uniform (no knife tiering)

Every `animal` material needs just the base knife (+ trap). No material sits behind a higher knife tier. This is enforced by Part D removing the only tiered knife gates (`drake-hide`, `seal` → `steel-knife`).

---

## Part D — Remove the steel-knife tier

`steel-knife` is only ever a recipe *output* — no recipe or node uses it as a required tool except the two `MATERIAL_GATE` rows. Remove it cleanly:

- **Delete** the `steel-knife` recipe (`crafting.ts`), `TOOL_CAPABILITY["steel-knife"]`, and any `TOOL_SPEED["steel-knife"]` entry.
- **Delete both `MATERIAL_GATE` rows** it gated: `drake-hide` and `seal`.
- **`seal`** → now huntable with the base trap+knife (stays in the tundra `animal` table; `blubber-stew` unaffected).
- **`drake-hide` → a new fight** (D-below). Remove `drake-hide` from the **desert** and **tundra** `animal` material tables. Its six recipes (`pemmican`, `large-pack`, `map-case`, `studded-chest`, `studded-legs`, `drake-oil`) are unchanged and stay sourced via the new monster.

### D1 — New monster `drake` (sources drake-hide)

drake-hide is "too high up" to be a hunted node; it becomes a combat drop.

- **`src/data/combat.ts` MONSTERS:** `drake: { tier: 2, dmgType: "melee", armourType: "light", category: "beast", tags: ["dragon"] }` — the `dragon` tag keeps `drake-oil`'s "affinity vs dragon" theme coherent (and makes it wyrmbane-vulnerable, acceptable flavor at T2).
- **`LOOT_TABLE`:** `drake: [{ defId: "drake-hide", qty: 2 }]`.
- **Placement:** add `drake` to the **desert** and **tundra** `creatureTable` (the two biomes that carried drake-hide) at an ordinary T2-ish weight (propose weight `3`, in line with other mid-tier entries). It is a normal biome creature, NOT a boss — it goes in `creatureTable`, not `MAP_TIER_CREATURE_ADD`.
- **Stats/biome are the one genuinely new content knob** — light hide + melee is the default; plate hide or desert-only are easy alternatives if the fight should read differently. Whatever ships must keep `test/balance-tables.test.ts` green (regen tables).

---

## Consequences & test surface

- **Balance regen:** `LOOT_TABLE`, `MONSTERS`, `BIOMES` material/creature tables all change ⇒ run `bun run sim:tables --write` and land the regenerated `test/balance-tables` fixtures.
- **Content invariant (`7dt`, if landed / otherwise manual):** every recipe input sourced — verify drake-hide (new monster), seal (base hunt), and that no recipe still points at `steel-knife`.
- **`constants.test` capability assertion:** "every listed gate/secondary tool's capability matches a node's tool" — the new `trap` capability + `NODE_SECONDARY_TOOL` must satisfy whatever invariant guards `NODE_TOOL`/`MATERIAL_GATE`. Extend that test to cover `NODE_SECONDARY_TOOL`.
- **Console ↔ web parity:** the combined trap+knife reject copy must appear identically in `src/sim/playtest.ts` (via `nodeToolHint`) and `src/web/main.ts`. A parity gap here would mislead the next playtest (the #1 lesson from prior runs).
- **New reducer branch:** the secondary-tool check in `gather()` needs a unit test (has-knife-no-trap rejects; has-both works; has-trap-no-knife rejects) plus a legality test (the AND flows through `legalActions`/speculative reduce).
- **Bootstrap re-validation:** after landing, this is the fix under bead `ksu` — a follow-up blind playtest should confirm a fresh player reaches the first tool in a small number of runs.

## Levers introduced / changed (for `balance-levers.md`)
- `BIOMES[*].materialTable.herb` — flint/deadwood base weights raised (Part A).
- `MATERIAL_MAP_TIER_WEIGHT.flint` / `.deadwood` — new taper rows (Part A).
- `NODE_SECONDARY_TOOL` — new lever: a node kind's second required capability (Part C1).
- `trap` tool + recipe — new catalog entry (Part C3).
- `steel-knife` — removed (Part D); `MATERIAL_GATE` loses `drake-hide`/`seal`.
- `drake` monster + `LOOT_TABLE`/`creatureTable` entries (Part D1).

## Explicitly out of scope
- Forage-node marker legibility (separate follow-up if abundance alone doesn't close discovery).
- Trap as a consumable (rejected — reusable tool, simplest faithful model).
- Any change to combat loot / the peu shortcut design (Part B).
- Map-economy payoff (F2 / bead `93d`) — separate work.
