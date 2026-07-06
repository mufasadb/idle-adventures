# Maps-as-Items — Pocketable, Stockpileable, Spent on Embark

**Bead:** `idle-adventure-xzx`. Addresses playtest F5 (no-farm cost invisible) and softens F1 (biome pursuit is RNG).

## 1. Problem

Playtest (2026-07-06): the no-farm rotation (9u9.3) is right in intent but **unsignalled** — "every return permanently rerolls maps… feels like a betrayal the first time." And biome pursuit is an RNG wall (F1): the biome you need may never be offered when you're ready. Both dissolve if **maps are tangible items you can hold and visibly spend**.

## 2. Design

Maps become items you can **pocket** and **stockpile**, and embarking a held map **consumes it** (the visible cost). A **"go nearby"** default keeps you from ever being gated.

**Data:**
- `MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number }` (`vintage` = `runs` when pocketed — flavour only, no mechanic).
- `GameState.maps?: MapItem[]` — the held collection. Optional (absent = `[]`) so old saves / terse test states still typecheck.

**Actions:**
- **`pocket-map { mapSeed }`** (new): `mapSeed` must be in the current offer (`candidateMaps(seed, runs)`); appends `{ mapSeed, biomeId, vintage: runs }` to `state.maps` (dedupe by `mapSeed`; reject `already-pocketed` if held). No cost, no cap (there's no advantage to hoarding, and the "go nearby" fallback means you're never stuck — so no gating needed).
- **`embark { mapSeed }`** (changed): valid if `mapSeed ∈ current offer` (**"go nearby"** — a fresh offered map, *not* consumed from the collection) **OR** `mapSeed ∈ state.maps` (a **held** map — **removed from `state.maps` on embark**, the visible spend). Reject `not-offered` only when it's neither. Everything else about embark (bank debit, energy, entry) is unchanged.

**The telegraph:** running a *held* map removes it from your collection in front of you; the web/console show a "spent your {biome} map" line. "Go nearby" is the free default (nothing to spend).

**Compatibility with 9u9.3 (no re-farming):** each held map is a single-use snapshot consumed once; "go nearby" runs only *currently-offered* fresh maps. You still cannot re-run a specific map, so the farm loop stays closed.

## 3. Surfaces

- **`legalActions` (`sim/legal.ts`):** town now emits `pocket-map` for each offered map not already held, and `embark` for each offered map **and** each held map. (Reduce remains the source of truth — the offered/held check lives in the reducer.)
- **Web town (`src/web/main.ts`):** the offer shows each candidate with **Embark** (go nearby) *and* **Pocket** buttons; a new **"Your maps"** section lists held maps (`{biome} · {n} runs old`) each with an **Embark ▶ (spend)** button; embarking a held one logs the spend.
- **Playtest console (`src/sim/playtest.ts`):** the TOWN block lists the offer (with "pocket mapSeed=…") and a **"Your maps (held)"** list; note that embarking a held map consumes it.

## 4. Testing

- **`reduce` (new `test/reduce-map.test.ts` or extend embark tests):**
  - `pocket-map` on an offered seed adds it to `state.maps` with `{mapSeed, biomeId, vintage=runs}`; a second pocket of the same seed → `already-pocketed`; pocketing a non-offered seed → `not-offered`.
  - `embark` on a **held** map succeeds and **removes it** from `state.maps` (length −1; that seed gone).
  - `embark` on a currently-**offered** (not held) map succeeds and **does not** touch `state.maps` ("go nearby").
  - `embark` on a seed neither offered nor held → `not-offered` (farm loop still closed).
  - Held maps survive a town→expedition→town round trip except the one consumed (banking/return doesn't drop the collection).
- **`legalActions`:** town offers `pocket-map` for un-held offers and `embark` for offered+held; a held map is embarkable even after the offer rotates (the F1 win — pocket now, run later).
- **Existing embark tests** already pull seeds from `candidateMaps` — unaffected (offered seeds still embark).
- Gates: `bun test` + `bun run typecheck` + `bun run lint`. No economy/lever change → sustainability + b91 untouched; render snapshot unaffected. Update `docs/decisions.md` (maps-as-items; extends D32/D38-era no-farm) + `docs/balance-levers.md` if a cap lever is ever added (none this pass).

## 5. Out of scope

- Map **tiers** (t0 vs higher-tier found/earned maps) and **cartography** (crafting/enhancing maps) — stays `cxq`. "t0" here just means the basic maps we already generate.
- A literal `map` loadout slot / `pack-map` step — the held-map selection + visible consumption *is* the slotting UX; no new equipment slot.
- Any change to `candidateMaps`, rotation, or the energy economy.
