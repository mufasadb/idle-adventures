// The engine contract — single source of truth for state, actions, events.
// Lifted from the design spec §10. Pure data; no behaviour here.
import type { BiomeId, Terrain, NodeType, StationId } from "../data/constants";
import type { Matchup } from "./combat"; // type-only: erased at runtime, no import cycle

export type ItemStack = { defId: string; qty: number }; // fungible; gear referenced by defId too

export type Equipment = {
  weapon: string | null; // defId → { dmgType: melee|ranged|magic, tags:[silver|...] } in the catalog
  helmet: string | null;
  chest: string | null;
  legs: string | null;
  boots: string | null;
  gloves: string | null; // each piece's defId → { armourType: plate|light|robe, defense }
  tools: string[]; // pick, axe, fishing rod, spyglass — capabilities
  transport: string | null;
  backpack: string | null;
  panniers: string | null; // saddlebags (zhn): extra carry, only works with a beast transport
};

export type Loadout = {
  equipment: Equipment;
  food: ItemStack[];
  potions: ItemStack[];
  battleItems: ItemStack[]; // combat consumables (bzd): buff a single fight, consumed at fight start
  spares?: ItemStack[]; // spare gear packed into carry slots (82r): 1 slot per piece; expanded into expedition.carry at embark. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  ammo?: ItemStack[]; // arrows (D45): spent 1/exchange while a bow is wielded; stacks ARROW_STACK_CAP per slot (consumableSlots counts ceil); unspent ammo banks back at run end. Optional/absent = []; reads guard with `?? []`.
};

// A pocketed map (xzx): a single-use snapshot of an offered map you chose to keep.
// vintage = `runs` when pocketed — flavour only ("N runs old"), no mechanic.
export type MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number; tier?: number; affixes?: string[]; inkCount?: number };
// tier: map tier (2yn), drives generation scaling. Optional/absent = 1; read with `?? 1`.
// affixes: cartography affixes applied by inking (cxq), read as generateGrid weight
//   multipliers. Optional/absent = [] (old saves, un-inked maps); read with `?? []`.
// inkCount: how many times this map has been inked (cxq) — seeds the affix roll so
//   re-inking a domain can land a different affix. Optional/absent = 0; read with `?? 0`.

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
  ranged?: boolean; // engaged from an adjacent tile with a bow (D45). Optional/absent = false; reads guard with `?? false`.
  opener?: boolean; // ranged opener pending (D45): the FIRST exchange skips the monster's retaliation, then this clears. Optional/absent = false; reads guard with `?? false`.
};

export type Expedition = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number; // CURRENT stamina (dtv): starts at maxEnergy on embark, drained by move/gather, refilled by eating food
  hp: number; // drained by combat, refilled by potions
  loadout: Loadout;
  carry: ItemStack[]; // capped by backpack slots
  cleared: { x: number; y: number }[]; // POIs consumed this run (D24): gathered nodes; M4 adds defeated monsters
  // grid regenerated from mapSeed on demand, not stored
  maxEnergy?: number; // stamina ceiling (dtv): set to MAX_ENERGY at embark (gear-raisable later). Optional/absent = MAX_ENERGY (old saves, terse test states); reads guard with `?? MAX_ENERGY`.
  autoEat?: boolean; // "eat when hungry" (dtv): waste-free auto-eat after each spend. Set true at embark; toggle-auto-eat flips it. Optional/absent = true; reads guard with `?? true`.
  carriedMaps?: MapItem[]; // map-scroll drops carried home (8ec): each costs ONE carry slot for the run; banked into GameState.maps at run end. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  combat?: Engagement; // live engagement (si7.1). Optional/absent = not engaged; reads guard with `?? undefined` checks.
  autoQuaff?: boolean; // auto-potion at the threshold inside exchanges (si7.1, mirrors autoEat). Optional/absent = true; reads guard with `?? true`.
  mapTier?: number; // this run's map tier (2yn): set at embark from the chosen map's tier
                    // (offered map = 1, held MapItem = its tier). Optional/absent = 1.
  surveyed?: { x: number; y: number }[]; // POIs resolved at range by the survey action (54f): perceive treats these as always-in-radius. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  affixes?: string[]; // cartography affixes carried from the embarked map (cxq): fed to expeditionGrid so the in-run grid matches what was inked. Optional/absent = []; reads guard with `?? []`.
};

export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  loadout: Loadout; // town-side staging (D22): pack (M5) edits it, embark consumes it
  expedition: Expedition | null;
  runs?: number; // completed expeditions — advances the candidate-map offer so town shows FRESH maps each visit (not the same 3 forever). Optional/absent = 0 (old saves, terse test states); reads guard with `?? 0`.
  maps?: MapItem[]; // held maps (xzx): pocketed from the offer, consumed on embark. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
  stations?: StationId[]; // built home stations (ke3): non-bank permanent infra that gates deep recipes. Optional/absent = [] (old saves, pre-ke3 states); reads guard with `?? []`. Write path (buildsStation) lands in ke3.2.
};

// Loadout slots an action can target when packing.
export type LoadoutSlot =
  | "weapon"
  | "helmet"
  | "chest"
  | "legs"
  | "boots"
  | "gloves"
  | "tool"
  | "transport"
  | "backpack"
  | "panniers"
  | "food"
  | "potion"
  | "battle-item"
  | "spare" // spare gear into carry slots (82r): any gear defId, 1 slot per piece
  | "ammo"; // arrows (D45): packed like potions, but slots count ceil(units/ARROW_STACK_CAP)

export type Action =
  | { type: "craft"; recipeId: string }
  | { type: "pack"; slot: LoadoutSlot; itemId: string }
  | { type: "embark"; mapSeed: string }
  | { type: "pocket-map"; mapSeed: string }
  | { type: "ink"; mapSeed: string; inkId: string } // apply a crafted ink to a held map (cxq): rolls + writes an affix from the ink's domain
  | { type: "move"; to: { x: number; y: number } } // steps ONE tile toward target
  | { type: "gather" }
  | { type: "fight"; at?: { x: number; y: number } } // engage the monster on your tile, or run ONE exchange when engaged (si7.1); `at` = an ADJACENT live monster tile to engage at range with a wielded bow + ≥1 arrow (D45)
  | { type: "flee" } // disengage at the cost of one parting hit (si7.1)
  | { type: "quaff" } // drink one potion: mid-engagement (no exchange, si7.1) or on the map for QUAFF_ENERGY (82r)
  | { type: "use-item"; itemId: string } // use a packed battle item mid-fight (90j): manual-only, no auto-consume; adds its COMBAT_BUFF for THIS engagement, no exchange (mirrors quaff)
  | { type: "survey"; at: { x: number; y: number } } // spend SURVEY_ENERGY to resolve one far POI's detail at range with a vision tool (54f)
  | { type: "don"; itemId: string } // equip a carried gear piece into its slot, displacing the worn one to carry (82r)
  | { type: "doff"; itemId: string } // unequip a worn piece / remove a tool to carry (82r)
  | { type: "toggle-auto-quaff" } // flip auto-potion-at-threshold (si7.1)
  | { type: "eat" } // eat one food unit now → refill current energy toward max (dtv)
  | { type: "toggle-auto-eat" } // flip the waste-free "eat when hungry" auto-eat (dtv)
  | { type: "drop"; itemId: string }
  | { type: "drop-map"; mapSeed: string } // discard a carried map mid-run (8ec) — frees its slot; no re-pickup
  | { type: "return" };

// Closed set of every reason a reducer can reject an action (D30). Split out so
// callers (legalActions, the field UI, the AI) can switch exhaustively.
export type RejectionReason =
  | "not-in-town"
  | "not-offered"
  | "not-on-expedition"
  | "no-step"
  | "out-of-bounds"
  | "impassable"
  | "exhausted"
  | "no-node"
  | "already-cleared"
  | "not-gatherable"
  | "missing-tool"
  | "tool-too-weak"
  | "carry-full"
  | "not-carried"
  | "map-not-carried"
  | "no-monster"
  | "unaffordable"
  | "no-recipe"
  | "missing-station" // craft: a recipe's requires.station isn't among the built home stations (ke3.1)
  | "insufficient-materials"
  | "wrong-slot"
  | "insufficient"
  | "already-packed"
  | "no-slot"
  | "already-pocketed"
  | "engaged"
  | "not-engaged"
  | "not-worn" // doff of a defId that isn't currently equipped (82r)
  | "already-resolved"; // survey of a POI whose detail is already in focus (54f)

// Events are a render byproduct emitted by reduce. Named GameEvent (not Event)
// to avoid colliding with the DOM Event global, which engine code must not use.
// A closed discriminated union, extended per-milestone as systems land.
export type GameEvent =
  | {
      type: "embarked";
      mapSeed: string;
      biomeId: BiomeId;
      pos: { x: number; y: number };
      energy: number;
    }
  | {
      type: "moved";
      from: { x: number; y: number };
      to: { x: number; y: number };
      terrain: Terrain;
      cost: number;
      energy: number; // remaining after the step
    }
  | {
      type: "gathered";
      at: { x: number; y: number };
      kind: NodeType;
      material: string;
      qty: number;
      cost: number;
      energy: number; // remaining after the gather
    }
  | { type: "dropped"; defId: string; qty: number }
  | { type: "ate"; defId: string; restored: number; energy: number } // ate one food unit (dtv): restored energy, new current
  | { type: "auto-eat-toggled"; on: boolean } // flipped "eat when hungry" (dtv)
  | { type: "engaged"; at: { x: number; y: number }; creature: string; monsterHp: number; ranged?: boolean } // ranged (D45): engaged from an adjacent tile with a bow — the first exchange skips its retaliation
  | { type: "exchanged"; creature: string; dmgDealt: number; dmgTaken: number; monsterHp: number; hp: number; potionsUsed: number; arrowSpent?: boolean } // arrowSpent (D45): present when this exchange shot an arrow
  | { type: "fled"; creature: string; partingHit: number; hp: number }
  | { type: "quaffed"; defId: string; healed: number; hp: number; energy?: number } // energy present only when spent (out-of-combat quaff, 82r)
  | { type: "item-used"; defId: string; damageAdd: number; mitigationAdd: number } // battle item used mid-fight (90j); buff added to this engagement (also vb8's missing consumption log line)
  | { type: "surveyed"; at: { x: number; y: number }; kind: NodeType } // spyglass survey resolved a far POI's detail (54f); qualitative only
  | { type: "auto-quaff-toggled"; on: boolean }
  | { type: "donned"; defId: string; slot: LoadoutSlot; displaced: string | null; energy: number } // equipped from carry (82r)
  | { type: "doffed"; defId: string; slot: LoadoutSlot; energy: number } // unequipped to carry (82r)
  | {
      type: "fought";
      at: { x: number; y: number };
      creature: string;
      victory: boolean;
      hpLost: number;
      potionsUsed: number;
      loot: ItemStack[];
      hp: number;
      matchup: Matchup; // post-fight RPS/affinity lesson facts (9u9.2)
    }
  | { type: "crafted"; recipeId: string; output: ItemStack }
  | { type: "pocketed-map"; mapSeed: string; biomeId: BiomeId; tier: number }
  | { type: "inked"; mapSeed: string; affix: string } // an ink rolled + wrote this affix onto a held map (cxq)
  | { type: "map-dropped"; at: { x: number; y: number }; mapSeed: string; biomeId: BiomeId; hints: string[]; carried: boolean; tier: number } // humanoid kill minted a map (8ec); carried=false → pack full, left behind
  | { type: "map-discarded"; mapSeed: string } // drop-map (8ec): carried map thrown away mid-run
  | { type: "packed"; slot: LoadoutSlot; defId: string }
  | { type: "run-ended"; reason: string }
  | {
      type: "action-rejected";
      action: Action["type"];
      reason: RejectionReason; // closed union (D30)
    };
