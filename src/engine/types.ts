// The engine contract — single source of truth for state, actions, events.
// Lifted from the design spec §10. Pure data; no behaviour here.
import type { BiomeId, Terrain, NodeType } from "../data/constants";
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
};

// A pocketed map (xzx): a single-use snapshot of an offered map you chose to keep.
// vintage = `runs` when pocketed — flavour only ("N runs old"), no mechanic.
export type MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number };

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
};

export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  loadout: Loadout; // town-side staging (D22): pack (M5) edits it, embark consumes it
  expedition: Expedition | null;
  runs?: number; // completed expeditions — advances the candidate-map offer so town shows FRESH maps each visit (not the same 3 forever). Optional/absent = 0 (old saves, terse test states); reads guard with `?? 0`.
  maps?: MapItem[]; // held maps (xzx): pocketed from the offer, consumed on embark. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
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
  | "battle-item";

export type Action =
  | { type: "craft"; recipeId: string }
  | { type: "pack"; slot: LoadoutSlot; itemId: string }
  | { type: "embark"; mapSeed: string }
  | { type: "pocket-map"; mapSeed: string }
  | { type: "move"; to: { x: number; y: number } } // steps ONE tile toward target
  | { type: "gather" }
  | { type: "fight" } // engage the monster on your tile, or run ONE exchange when engaged (si7.1)
  | { type: "flee" } // disengage at the cost of one parting hit (si7.1)
  | { type: "quaff" } // drink one potion mid-engagement, no exchange (si7.1; absorbs 82r's manual potion)
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
  | "insufficient-materials"
  | "wrong-slot"
  | "insufficient"
  | "already-packed"
  | "no-slot"
  | "already-pocketed"
  | "engaged"
  | "not-engaged";

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
  | { type: "engaged"; at: { x: number; y: number }; creature: string; monsterHp: number }
  | { type: "exchanged"; creature: string; dmgDealt: number; dmgTaken: number; monsterHp: number; hp: number; potionsUsed: number }
  | { type: "fled"; creature: string; partingHit: number; hp: number }
  | { type: "quaffed"; defId: string; healed: number; hp: number }
  | { type: "auto-quaff-toggled"; on: boolean }
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
  | { type: "pocketed-map"; mapSeed: string; biomeId: BiomeId }
  | { type: "map-dropped"; at: { x: number; y: number }; mapSeed: string; biomeId: BiomeId; hints: string[]; carried: boolean } // humanoid kill minted a map (8ec); carried=false → pack full, left behind
  | { type: "map-discarded"; mapSeed: string } // drop-map (8ec): carried map thrown away mid-run
  | { type: "packed"; slot: LoadoutSlot; defId: string }
  | { type: "run-ended"; reason: string }
  | {
      type: "action-rejected";
      action: Action["type"];
      reason: RejectionReason; // closed union (D30)
    };
