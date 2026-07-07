import type { GameState } from "../engine/types";
import { generateGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { WEAPONS } from "../data/constants";
import type { Terrain, NodeType, DmgType, ArmourType } from "../data/constants";
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

// Vague human text from perception facts. `detail === null` → kind only.
export function flavorDetail(detail: PoiDetail | null, kind: NodeType): string {
  if (detail === null) return kind === "monster" ? "a monster" : `a ${kind} node`;
  if (kind === "monster") {
    const size = SIZE_FLAVOR[detail.tier] ?? "a";
    const hide = detail.armourType ? HIDE_FLAVOR[detail.armourType] : "an unclear form";
    const tell = detail.dmgType ? `; ${DMG_FLAVOR[detail.dmgType]}` : "";
    return `${size} creature — ${hide}${tell}`;
  }
  return detail.material ?? `a ${kind} node`;
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
  const { mapSeed, pos } = state.expedition;
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
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
