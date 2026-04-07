import { EXPEDITION_CONSTANTS as C } from '../data/expeditionConstants';
import { ITEMS } from '../data/items';
import type { ExpeditionLoadout, ExpeditionMap } from '../types';

export interface APBreakdown {
  foodAP: number;
  animalBonus: number;
  mapPenalty: number;
  biomeMatchBonus: number;
  total: number;
}

export function calculateAPBreakdown(
  loadout: ExpeditionLoadout,
  map: ExpeditionMap,
  beastcraftLevel: number,
): APBreakdown {
  const foodAP = loadout.food
    .filter(Boolean)
    .reduce((sum, f) => sum + (ITEMS[f!.itemId]?.ap_value ?? 0), 0);

  const animalDef = loadout.vehicle ? ITEMS[loadout.vehicle.itemId] : null;
  const animalBonus = animalDef
    ? (animalDef.tier ?? 0) * beastcraftLevel * C.ANIMAL_AP_MULTIPLIER
    : 0;

  const hasDesertCloak = loadout.misc.some(
    (m) => m && ITEMS[m.itemId]?.tags?.includes(C.DESERT_CLOAK_TAG),
  );
  const mapPenalty =
    map.biome === C.DESERT_BIOME && !hasDesertCloak ? C.DESERT_PENALTY : 0;

  const biomeMatchBonus = 0; // TBD

  return {
    foodAP,
    animalBonus,
    mapPenalty,
    biomeMatchBonus,
    total: foodAP + animalBonus - mapPenalty + biomeMatchBonus,
  };
}
