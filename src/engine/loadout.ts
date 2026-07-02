import type { Loadout } from "./types";

// Fresh empty loadout. A factory (not a shared constant) so no two states
// ever alias the same loadout object.
export function emptyLoadout(): Loadout {
  return {
    equipment: {
      weapon: null,
      helmet: null,
      chest: null,
      legs: null,
      boots: null,
      gloves: null,
      tools: [],
      transport: null,
      backpack: null,
    },
    food: [],
    potions: [],
  };
}
