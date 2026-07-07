# On-map item use (82r reframed) — quaff anywhere + don/doff gear

**Date:** 2026-07-07 · **Bead:** idle-adventure-82r (reframed as the on-map item-use umbrella) · **Status:** approved-by-delegation (user stepped away mid-brainstorm and said "run with it; worst case we unwind the commit")

## Why

82r's written scope was "don/doff gear + manual potion". si7.1's engagement model absorbed manual potion *in combat* (fights are now round-by-round: `fight` = one exchange; `flee`/`quaff` are mid-fight decisions). Brainstorming revealed the user's actual mental model: **using items on the map** — drinking a potion between fights, using the spyglass, etc. `quaff` still rejects `not-engaged` outside combat (reduce.ts), so healing between fights is impossible. This spec reframes 82r as the umbrella and ships two increments:

1. **Quaff anywhere** — drink a potion out of combat; it "should just cost energy" (user's words).
2. **Don/doff gear** — pack spare gear at town, swap ANY equipment slot mid-run (user chose "Everything"), don looted gear too.

Deferred to child beads (not designed solo): deliberate battle-item use (today they auto-consume at fight start), active spyglass survey.

## User decisions captured before they left

- Spares source: "into carry slots, but could be loot too" → pack spares at town; looted gear donnable.
- Swap scope: "Everything" — all Equipment slots including tools/transport/backpack/panniers.
- Cost model: "it should just cost energy" — no exotic gating; on-map item use spends energy.

## Decisions made by the agent (flag for review)

- **D-A1** Out-of-combat quaff costs `QUAFF_ENERGY` (new lever, 2 — about one step). In-combat quaff is UNCHANGED (free of energy; its cost is engagement tempo, and si7.1 combat balance was calibrated around it).
- **D-A2** Don/doff costs `DON_DOFF_ENERGY` (new lever, 2) and is rejected while engaged (`engaged`) — the agency is *pre-fight* prep, not mid-fight armour swapping.
- **D-A3** Gear in carry takes **1 slot per piece** (stack cap 1), consistent with tools costing 1 slot each. Implemented as `stackCapOf(defId)`: gear → 1, everything else → `STACK_CAP`. Keeps `usedSlots` (counts stacks) correct with zero changes.
- **D-A4** No unpack for spares — mirrors the existing "no unpack" convention for consumables (pack.ts header).
- **D-A5** Capacity rule for don/doff: build the full candidate (equipment + carry), reject `carry-full` if `usedSlots(candidate) > carryCap(candidate.equipment)`. This makes backpack/transport/panniers swaps safe with no special cases — e.g. you cannot doff the horse if the panniers capacity it enables is holding your loot (drop things first). Emergent, correct, no forced-drop rules.

## Design

### A. Quaff anywhere (engine)

`quaff` in `reduce.ts`: when NOT engaged, no longer reject `not-engaged`; instead require `energy ≥ QUAFF_ENERGY` (else `exhausted`) and spend it. Same potion FIFO + heal math as in-combat. `quaffed` event gains optional `energy?: number` (present only when energy was spent — out-of-combat).

### B. Don/doff gear

**Types (`types.ts`):**
- `Loadout.spares?: ItemStack[]` — optional, `?? []` default (old saves / terse test states).
- `LoadoutSlot` gains `"spare"`.
- `Action` gains `{ type: "don"; itemId: string }` and `{ type: "doff"; itemId: string }`.
- `RejectionReason` gains `"not-worn"`.
- `GameEvent` gains `{ type: "donned"; defId; slot; displaced: string | null; energy }` and `{ type: "doffed"; defId; slot; energy }`.

**Catalog (`catalog.ts`):** `isGearSlot(slot)` / gear = slotOf(defId) ∈ {weapon, helmet, chest, legs, boots, gloves, tool, transport, backpack, panniers}. `validForSlot("spare", defId)` = defId is gear.

**Carry (`carry.ts`):** `stackCapOf(defId)` (gear → 1, else `STACK_CAP`); `addToCarry` uses it instead of raw `STACK_CAP`. `consumableSlots` adds spare units (1 slot per unit, like tools).

**Pack (`pack.ts`):** `slot === "spare"` → addConsumable into `loadout.spares`, capacity via `consumableSlots`, affordability via `reservedQty` (and `reserveLoadout` includes spares).

**Embark (`reduce.ts`):** expand `loadout.spares` into `expedition.carry` as per-unit stacks; expedition loadout's `spares` cleared (no double slot-count).

**Don (`reduce.ts`):** expedition + not engaged + energy ≥ cost + itemId in carry (`not-carried`) + gear (`wrong-slot`). Tools: reject `already-packed` if worn; append to `tools`. Single slots: displaced occupant returns to carry. Candidate capacity check per D-A5.

**Doff (`reduce.ts`):** itemId worn in some slot or in `tools`, else `not-worn`; same engaged/energy/capacity checks; slot goes null (or tool removed), piece added to carry.

**Legality (`sim/legal.ts`):** candidates only — don for each carried gear stack; doff for each worn piece and tool. reduce stays the source of truth (D29).

**Banking:** nothing to do — `endExpedition` already banks `carry`, so spares/doffed gear return to the bank, and worn equipment already returns via the loadout path.

### C. Surfaces

- **Web (`main.ts`):** fmt() cases for `donned`/`doffed` (+ energy suffix on out-of-combat `quaffed`). Potion button in the un-engaged expedition panel (next to Eat), enabled when `quaff` is legal. "don" buttons on carried gear stacks, "doff" buttons on worn pieces/tools (`data-don` / `data-doff` wiring, mirroring `data-drop`).
- **Console (`sim/playtest.ts`):** legal-action JSON list picks the new actions up automatically. Also lands **si7.4**: a new `slots: X/Y used` line (new line — never reshape existing lines) and a monster-tile suffix hint "(step onto it to fight — needs a free loot slot)" following the existing tierHint suffix pattern.

### D. Levers (constants.ts + balance-levers.md + decisions.md D37)

- `QUAFF_ENERGY = 2` — energy to drink a potion OUTSIDE combat (in-combat quaff costs no energy).
- `DON_DOFF_ENERGY = 2` — energy to swap/don/doff one piece of gear on the map.

## Testing

New `test/don-doff.test.ts`: pack-spare validation (wrong-slot for non-gear, insufficient vs bank, no-slot at capacity), embark seeds carry per-unit, don/doff round-trip (displacement, tools add/remove), engaged rejection, exhausted rejection, backpack-doff `carry-full` when overloaded, horse-doff `carry-full` when panniers hold loot, gear stacks cap at 1. Quaff-anywhere: out-of-combat quaff heals + spends energy; exhausted rejection; in-combat path unchanged. Update any test asserting quaff `not-engaged`. Combat-affecting? Quaff heal amounts unchanged → balance tables should be unaffected; run `sim:tables` check via the staleness gate anyway.

## Out of scope (child beads)

- Deliberate battle-item use (un-auto-consume; a "use battle item" choice).
- Active spyglass survey (spend energy to reveal at range) — overlaps 2g7.4a.
- Any si7.6 breadth content (magic, thrown potions, etc.).
