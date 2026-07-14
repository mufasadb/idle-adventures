// Shared loot/recipe item shape (465: extracted from constants.ts so both the combat
// loot tables and the crafting recipes can reference it without one importing the other).
export type ItemStackSpec = { defId: string; qty: number; chance?: number }; // chance ∈ (0,1): drop probability, rolled per-encounter (LOOT_TABLE only); absent = always drops
