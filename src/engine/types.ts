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

export type Expedition = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number; // from packed food; spent on move/gather
  hp: number; // drained by combat, refilled by potions
  loadout: Loadout;
  carry: ItemStack[]; // capped by backpack slots
  cleared: { x: number; y: number }[]; // POIs consumed this run (D24): gathered nodes; M4 adds defeated monsters
  // grid regenerated from mapSeed on demand, not stored
};

export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  loadout: Loadout; // town-side staging (D22): pack (M5) edits it, embark consumes it
  expedition: Expedition | null;
  runs?: number; // completed expeditions — advances the candidate-map offer so town shows FRESH maps each visit (not the same 3 forever). Optional/absent = 0 (old saves, terse test states); reads guard with `?? 0`.
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
  | { type: "move"; to: { x: number; y: number } } // steps ONE tile toward target
  | { type: "gather" }
  | { type: "fight" }
  | { type: "drop"; itemId: string }
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
  | "no-monster"
  | "unaffordable"
  | "no-recipe"
  | "insufficient-materials"
  | "wrong-slot"
  | "insufficient"
  | "already-packed"
  | "no-slot";

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
  | { type: "packed"; slot: LoadoutSlot; defId: string }
  | { type: "run-ended"; reason: string }
  | {
      type: "action-rejected";
      action: Action["type"];
      reason: RejectionReason; // closed union (D30)
    };
