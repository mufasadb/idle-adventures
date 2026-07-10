import type { GameState } from "../engine/types";
import { expeditionGrid } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { WEAPONS, ARMOUR, FOOD, FOOD_ENERGY, ENERGY_PER_FOOD, POTION, POTION_HEAL, POTION_HEAL_BY, COMBAT_BUFF, TOOL_CAPABILITY, TOOL_QUALITY, TOOL_PURPOSE, ENERGY_CAP_BONUS, BACKPACK_SLOTS, TRANSPORT_CARRY, TRANSPORT_MULTIPLIER, TERRAIN_GATE, TERRAIN_COST, PANNIERS_SLOTS, INKS, AFFIX_EFFECTS, MATERIAL_TIER, TENT_FOOD_MULTIPLIER, RECIPE, NODE_TOOL } from "../data/constants";
import type { Terrain, NodeType, DmgType, ArmourType, GatherableNodeType } from "../data/constants";
import type { PoiDetail } from "../engine/perceive";
import type { Matchup } from "../engine/combat";

// Dumb view: state → string. The grid is REGENERATED from mapSeed (D14) —
// render holds no state and makes no decisions.

// --- Perception flavor (9u9.2): turn structured facts into vague, learn-the-
// vocabulary text. NEVER numbers or the fight outcome. New monsters get flavor
// for free (generated from facts); per-creature overrides can land later.
const DMG_FLAVOR: Record<DmgType, string> = {
  melee: "it shifts its weight to strike",
  ranged: "it keeps its distance, wary",
  magic: "an odd sheen ripples off its skin",
};
const HIDE_FLAVOR: Record<ArmourType, string> = {
  plate: "a thick, scaled hide",
  light: "a lean, quick frame",
  robe: "a soft, unarmoured shape",
};
const SIZE_FLAVOR = ["", "a small", "a fair-sized", "a large", "a towering"]; // by tier 1-4

// Weapon-class mechanical hint (57l, playtest v3): ONE clause saying what a
// weapon class DOES — all three blind agents abandoned the bow line because
// its payoff was invisible while melee's numbers print in every fight log.
// Qualitative matrix character + the ranged verb; never numbers. Data-driven
// off WEAPONS.dmgType so future weapons get a hint for free.
const WEAPON_CLASS_HINT: Record<DmgType, string> = {
  melee: "melee — steady steel; strongest against soft, unarmoured hides",
  ranged: "ranged — strike FIRST from a tile away (needs arrows; empty quiver = a club); flies true against soft hides, blunted by plate",
  magic: "magic — burns through plate and scale, fizzles against soft robes",
};
export function weaponHint(defId: string): string | null {
  const w = WEAPONS[defId];
  return w ? WEAPON_CLASS_HINT[w.dmgType] : null;
}

// Item-constant tooltip (vb8): a one-line, DATA-DRIVEN description of what an
// item does, for the web `title=` on every item chip. Numbers ARE allowed here
// (the game is a deterministic math puzzle; hiding constants only pushes the
// math into notebook reverse-engineering — playtest v3 §5, web precedent: fight
// forecasts already print numbers). Inks stay VAGUE though — the cxq legibility
// rule keeps the material spoiler in the affix NAME, not the recipe/tooltip.
// Console does NOT use this (blind-playtest discovery pressure stays).
// wzk (early-game legibility): the range-extenders read as inert names in blind
// play — a transport looked like pure carry, terrain gear like jargon. These two
// helpers state the MOVEMENT benefit, reading the movement levers (never hardcoded
// numbers) so new gear/terrain gets legible for free.
function terrainGearNote(defId: string): string | null {
  const notes: string[] = [];
  for (const terrain of Object.keys(TERRAIN_GATE) as Terrain[]) {
    const g = TERRAIN_GATE[terrain]?.[defId];
    if (!g) continue;
    if (g.enable !== undefined) notes.push(`crosses ${terrain} (∞→${g.enable})`);
    else if (g.discount !== undefined) notes.push(`${terrain} ${TERRAIN_COST[terrain]}→${TERRAIN_COST[terrain] - g.discount}`);
  }
  return notes.length ? notes.join(", ") : null;
}
function transportSpeedNote(defId: string): string | null {
  const mult = TRANSPORT_MULTIPLIER[defId];
  if (!mult) return null;
  const faster = (Object.entries(mult) as [Terrain, number][]).filter(([, m]) => m > 1).map(([t, m]) => `×${m} on ${t}`);
  return faster.length ? `${faster.join(", ")} speed` : null;
}

// Concise range/logistics benefit for the craft book (wzk): blind players never
// hovered the describe() tooltip, so the range-extenders' payoff was invisible at
// craft time. Returns a short inline label for movement/carry/food gear, or null
// for items whose value is already obvious (weapons carry weaponHint; raw mats).
export function logisticsEffect(defId: string): string | null {
  if (ENERGY_CAP_BONUS[defId]) return `+${ENERGY_CAP_BONUS[defId]} max energy`;
  if (defId === "tent") return `food +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%`;
  const terr = terrainGearNote(defId);
  if (terr) return terr;
  if (defId in TRANSPORT_CARRY) {
    const speed = transportSpeedNote(defId);
    return speed ? `${speed}, +${TRANSPORT_CARRY[defId]} carry` : `+${TRANSPORT_CARRY[defId]} carry`;
  }
  if (defId in BACKPACK_SLOTS) return `${BACKPACK_SLOTS[defId]} carry slots`;
  return null;
}

// egd: the material an affix favours, for the ink confirmation. Material-specific
// (user call): the ink names the boosted material AND keeps the affix label, so
// applying it both pays off and teaches the "of gleaming = mithril" vocabulary.
// Returns the highest-weighted material defId, or null (unknown / material-less).
export function affixMaterialHint(affix: string): string | null {
  const mul = AFFIX_EFFECTS[affix]?.materialWeightMul;
  if (!mul) return null;
  const top = Object.entries(mul).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

export function describe(defId: string): string {
  const w = WEAPONS[defId];
  if (w) return `weapon · ${w.damage} ${w.dmgType} dmg — ${WEAPON_CLASS_HINT[w.dmgType]}`;
  const a = ARMOUR[defId];
  if (a) return `${a.slot} armour · ${a.defense} defense · ${a.armourType}`;
  if (FOOD.includes(defId)) return `food · restores ${FOOD_ENERGY[defId] ?? ENERGY_PER_FOOD} energy per unit`;
  if (POTION.includes(defId)) return `potion · heals ${POTION_HEAL_BY[defId] ?? POTION_HEAL} HP`;
  const buff = COMBAT_BUFF[defId];
  if (buff) {
    const parts = [buff.damageAdd ? `+${buff.damageAdd} dmg` : "", buff.mitigationAdd ? `+${buff.mitigationAdd} mitigation` : ""].filter(Boolean);
    return `battle item · ${parts.join(", ")} for one fight`;
  }
  if (ENERGY_CAP_BONUS[defId]) return `gear · +${ENERGY_CAP_BONUS[defId]} max energy`;
  // wzk: terrain gear before the generic tool branch — raft/waders/ice-cleats/
  // climbing-pick are TOOL_CAPABILITY entries, but their VALUE is the terrain
  // discount, not the "ford/wade/trek" jargon word.
  const terr = terrainGearNote(defId);
  if (terr) return `gear · ${terr}`;
  if (defId in TOOL_CAPABILITY) {
    const cap = TOOL_CAPABILITY[defId]!;
    const q = TOOL_QUALITY[defId];
    if (defId === "tent") return `tool · camp — food restores +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%`;
    // gate-legibility (playtest 2026-07-09 #1): kit-tools are unmarked keys — say
    // what door each opens (field cooking/brewing, the forge, node-tier vision).
    const purpose = TOOL_PURPOSE[cap];
    return `tool · ${cap}${q ? ` (tier ${q})` : ""}${purpose ? ` — ${purpose}` : ""}`;
  }
  if (defId in BACKPACK_SLOTS) return `backpack · ${BACKPACK_SLOTS[defId]} carry slots`;
  if (defId in TRANSPORT_CARRY) {
    const speed = transportSpeedNote(defId); // wzk: name the speed benefit, not only carry
    return `transport · ${speed ? `${speed} · ` : ""}carries ${TRANSPORT_CARRY[defId]} slots`;
  }
  if (defId in PANNIERS_SLOTS) return `panniers · +${PANNIERS_SLOTS[defId]} carry slots (needs a mount)`;
  if (defId in INKS) return `a cartographer's ink — apply to a held map to coax out a tendency`;
  const tier = MATERIAL_TIER[defId];
  return tier ? `tier-${tier} crafting material` : "a crafting material";
}

// gate-legibility (playtest 2026-07-09 #1): a locked recipe/craft-reject must NAME
// the gate, not say "you lack something." Reads RECIPE[id].requires and returns the
// human "needs …" clause (station + tools joined with " + "), or null for a recipe
// with no gate. `terrain` gates are field-craft-only; call `recipeTerrainGate` for
// that clause where the current tile is known.
export function recipeGateHint(recipeId: string): string | null {
  const req = RECIPE[recipeId]?.requires;
  if (!req) return null;
  const parts: string[] = [];
  if (req.station) parts.push(req.station);
  if (req.tools) parts.push(...req.tools);
  return parts.length ? `needs ${parts.join(" + ")}` : null;
}

// The terrain a field recipe must be crafted on/adjacent to (river for water-vial),
// or null. Kept separate: it's only a "gate" when the player isn't already there.
export function recipeTerrainGate(recipeId: string): Terrain | null {
  return RECIPE[recipeId]?.requires?.terrain ?? null;
}

// gate-legibility (playtest 2026-07-09 #1): a gather `missing-tool` reject must name
// the tool KIND (capability) the node wants — "needs a knife", not "no tool". Reads
// NODE_TOOL[kind] (a capability string that reads as a noun: pick/axe/knife). Herb
// nodes need no tool → null.
export function nodeToolHint(kind: GatherableNodeType): string | null {
  const cap = NODE_TOOL[kind];
  return cap ? `needs a ${cap}` : null;
}

// gate-legibility (playtest 2026-07-09 #1, node tier/reach visibility): a surveyed /
// in-vision node should read its MATERIAL TIER at range so players can plan which
// veins are worth the trek — an agent mined ~12 nodes fishing for silver, then
// trekked 50 tiles to learn a node was tier-2. Fed the PERCEIVED tier (range-gated
// via perceive), so tier stays honest to what you can actually see. tier 1 → null
// (no signpost needed). NOT for monsters (their size is flavored separately).
export function nodeTierNote(detail: PoiDetail | null): string | null {
  if (!detail || detail.creature) return null; // null or a monster detail
  return detail.tier > 1 ? `tier ${detail.tier} — needs a tier-${detail.tier} tool` : null;
}

const MAGNITUDE_SUFFIX: Record<NodeType, Record<number, string>> = {
  mining: { 2: "cluster", 3: "cave" },
  wood:   { 2: "stand", 3: "grove" },
  herb:   { 2: "patch", 3: "thicket" },
  animal: { 2: "herd", 3: "warren" },
  monster: {},
};

// Vague human text from perception facts. `detail === null` → kind only.
export function flavorDetail(detail: PoiDetail | null, kind: NodeType): string {
  if (detail === null) return kind === "monster" ? "a monster" : `a ${kind} node`;
  if (kind === "monster") {
    const size = SIZE_FLAVOR[detail.tier] ?? "a";
    const hide = detail.armourType ? HIDE_FLAVOR[detail.armourType] : "an unclear form";
    const tell = detail.dmgType ? `; ${DMG_FLAVOR[detail.dmgType]}` : "";
    return `${size} creature — ${hide}${tell}`;
  }
  const mat = detail.material ?? `a ${kind} node`;
  const suffix = detail.magnitude ? MAGNITUDE_SUFFIX[kind]?.[detail.magnitude] : undefined;
  return suffix ? `${mat} ${suffix}` : mat;
}

// 0-2 salient post-fight lessons; empty when nothing notable happened. `weaponId`
// is part of the interface for callers that flavor per-weapon later.
export function matchupLessons(matchup: Matchup, _weaponId: string | null): string[] {
  const out: string[] = [];
  if (matchup.affinityFired) out.push("something in your weapon savaged it");
  if (matchup.weaponVsHide !== null && matchup.weaponVsHide < 1) out.push("your weapon skated off its hide");
  else if (matchup.weaponVsHide !== null && matchup.weaponVsHide > 1) out.push("you found the gap in its guard");
  if (matchup.armourVsAttack === "exposed") out.push("its attacks tore through your armour");
  else if (matchup.armourVsAttack === "resisted") out.push("your armour turned the blows aside");
  return out.slice(0, 2);
}

export const TERRAIN_CHAR: Record<Terrain, string> = {
  river: "~",
  mud: ",",
  plains: ".",
  ice: "*",
  mountain: "^",
};

export const POI_CHAR: Record<NodeType, string> = {
  mining: "O",
  wood: "T",
  herb: "H",
  animal: "A",
  monster: "X",
};

export const PLAYER_CHAR = "@";

export function render(state: GameState): string {
  if (!state.expedition) return "(town)";
  const { pos } = state.expedition;
  const grid = expeditionGrid(state.expedition);
  return renderGridText(grid, pos);
}

export function renderGridText(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  return grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          if (pos && pos.x === x && pos.y === y) return PLAYER_CHAR;
          const kind = poiAt.get(`${x},${y}`);
          return kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
        })
        .join(""),
    )
    .join("\n");
}

// HTML twin of renderGridText: same tile walk, CSS classes instead of chars.
// Styling lives in the web page; this stays a pure string serialization.
export function renderGridHtml(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  const cols = grid.terrain[0]?.length ?? 0;
  const tiles = grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          const kind = poiAt.get(`${x},${y}`);
          const isPlayer = pos !== undefined && pos.x === x && pos.y === y;
          const classes = `tile terrain-${terrain}${kind ? ` poi poi-${kind}` : ""}${isPlayer ? " player" : ""}`;
          const char = isPlayer ? PLAYER_CHAR : kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
          return `<div class="${classes}">${char}</div>`;
        })
        .join(""),
    )
    .join("");
  return `<div class="grid" style="display: grid; grid-template-columns: repeat(${cols}, 1.5rem);">${tiles}</div>`;
}
