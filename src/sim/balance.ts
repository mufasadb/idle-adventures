// Balance sim (dbc): mechanical derivation of fight/reach/toll numbers by
// composing the PURE engine — the same resolveCombat/strikeExchange/costToReach
// the game runs, so these numbers cannot drift from reality. Data objects only;
// rendering lives in balance-cli.ts.
import {
  MONSTERS,
  WEAPONS,
  ARMOUR,
  TOOL_CAPABILITY,
  TRANSPORT_MULTIPLIER,
  POTION,
  BATTLE_ITEM,
  AMMO,
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  PLAYER_BASE_HP,
  MAX_ENERGY,
  MITIGATION_K,
  CHIP_DAMAGE_MIN,
  AUTO_POTION_THRESHOLD,
  POTION_HEAL_BY,
  AFFINITY_MULTIPLIER,
  BIOME_IDS,
  MAP_TIER_MAX,
  MAP_TIER_CREATURE_ADD,
} from "../data/constants";
import type { DmgType, NodeType, BiomeId } from "../data/constants";
import type { ItemStack, Loadout } from "../engine/types";
import { emptyLoadout } from "../engine/loadout";
import { strikeExchange, battleBuff, mitigation } from "../engine/combat";
import { generateGrid, rollBiome } from "../engine/grid";
import { costToReach } from "../engine/reach";

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export type MapTierRow = {
  tier: number;
  poiCount: number; // average POI count across sampled seeds × biomes (rounded)
  bosses: string[]; // distinct boss creature defIds present at this tier (across biomes), sorted
};
export type MapTierReport = { rows: MapTierRow[] };

// Per-tier balance report: samples N seeds per tier across all biomes, sums POI
// counts, and collects distinct boss creatures added by MAP_TIER_CREATURE_ADD.
// Pure: deterministic seeds derived from tier/index, no Math.random.
const MAP_TIER_REPORT_SEEDS = 5;
export function mapTierReport(): MapTierReport {
  const rows: MapTierRow[] = [];
  for (let tier = 1; tier <= MAP_TIER_MAX; tier++) {
    let totalPois = 0;
    let sampleCount = 0;
    const bossSet = new Set<string>();

    // Collect bosses from MAP_TIER_CREATURE_ADD for this tier (across all biomes)
    for (const biomeId of BIOME_IDS as readonly BiomeId[]) {
      const adds = MAP_TIER_CREATURE_ADD[biomeId]?.[tier];
      if (adds) {
        for (const defId of Object.keys(adds)) {
          bossSet.add(defId);
        }
      }
    }

    // Sample grids to get actual POI counts
    for (let s = 0; s < MAP_TIER_REPORT_SEEDS; s++) {
      for (const biomeId of BIOME_IDS as readonly BiomeId[]) {
        const seed = `balance-tier${tier}-s${s}`;
        const grid = generateGrid(seed, biomeId, tier);
        totalPois += grid.pois.length;
        sampleCount++;
      }
    }

    const avgPois = Math.round(totalPois / sampleCount);
    rows.push({
      tier,
      poiCount: avgPois,
      bosses: Array.from(bossSet).sort(),
    });
  }
  return { rows };
}


export type KitSpec = {
  weapon?: string;
  armour?: string[];
  tools?: string[];
  transport?: string;
  potions?: ItemStack[];
  battleItems?: ItemStack[];
  ammo?: ItemStack[]; // arrows (D45): a bow kit needs ammo or playerDamage degrades it to a club
};

// Named kits are SIM FIXTURES (tooling shorthand), not game levers — they live
// here, not in src/data. The sweep (simTables) iterates exactly these.
export const KIT_PRESETS: Record<string, KitSpec> = {
  bare: { weapon: "sword", armour: [] },
  iron: { weapon: "iron-sword", armour: ["plate-helmet", "plate-chest", "plate-legs", "plate-boots", "plate-gloves"] },
  steel: { weapon: "steel-sword", armour: ["steel-plate-helmet", "steel-plate-chest", "steel-plate-legs", "steel-plate-boots", "steel-plate-gloves"] },
  mithril: { weapon: "mithril-sword", armour: ["mithril-plate-helmet", "mithril-plate-chest", "mithril-plate-legs", "mithril-plate-boots", "mithril-plate-gloves"] },
};

function known(id: string, table: Record<string, unknown> | string[], what: string): void {
  const ok = Array.isArray(table) ? table.includes(id) : id in table;
  if (!ok) {
    const valid = (Array.isArray(table) ? table : Object.keys(table)).sort().join(", ");
    throw new Error(`unknown ${what}: ${id} (valid: ${valid})`);
  }
}

export function resolveKit(name: string, overrides: KitSpec = {}): Loadout {
  const preset = KIT_PRESETS[name];
  if (!preset) throw new Error(`unknown kit: ${name} (valid: ${Object.keys(KIT_PRESETS).sort().join(", ")})`);
  const spec: KitSpec = { ...preset, ...overrides };
  const l = emptyLoadout();
  if (spec.weapon) {
    known(spec.weapon, WEAPONS, "weapon");
    l.equipment.weapon = spec.weapon;
  }
  // Copies, not aliases: spec.armour/tools may be the KIT_PRESETS entry itself
  // (spread above is shallow) — iterating a copy keeps that preset read-only.
  for (const piece of (spec.armour ?? []).slice()) {
    known(piece, ARMOUR, "armour piece");
    l.equipment[ARMOUR[piece]!.slot] = piece;
  }
  for (const t of (spec.tools ?? []).slice()) {
    known(t, TOOL_CAPABILITY, "tool");
    l.equipment.tools.push(t);
  }
  if (spec.transport) {
    known(spec.transport, TRANSPORT_MULTIPLIER, "transport");
    l.equipment.transport = spec.transport;
  }
  for (const s of spec.potions ?? []) known(s.defId, POTION, "potion");
  l.potions = (spec.potions ?? []).map((s) => ({ ...s }));
  for (const s of spec.battleItems ?? []) known(s.defId, BATTLE_ITEM, "battle item");
  l.battleItems = (spec.battleItems ?? []).map((s) => ({ ...s }));
  for (const s of spec.ammo ?? []) known(s.defId, AMMO, "ammo");
  l.ammo = (spec.ammo ?? []).map((s) => ({ ...s }));
  return l;
}

export type FightRound = { round: number; dmgDealt: number; dmgTaken: number; monsterHp: number; hp: number; quaffed: boolean };
export type FightReport = {
  monster: string;
  tier: number;
  rounds: FightRound[];
  victory: boolean;
  hpLost: number;
  hpLostPct: number;
  potionsUsed: number;
};

// Mirrors resolveCombat's composition exactly (buff consumed up front, autoQuaff
// on) but records every round. The equivalence is pinned by test.
export function simFight(loadout: Loadout, monsterId: string): FightReport {
  known(monsterId, MONSTERS, "monster");
  const monster = MONSTERS[monsterId]!;
  const buff = battleBuff(loadout.battleItems ?? []);
  let hp = PLAYER_BASE_HP;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  let potions = loadout.potions;
  let potionsUsed = 0;
  const rounds: FightRound[] = [];
  for (let round = 1; ; round++) {
    const r = strikeExchange({ ...loadout, potions }, hp, monsterHp, monsterId, buff.damageAdd, buff.mitigationAdd, true);
    rounds.push({ round, dmgDealt: round1(r.dmgDealt), dmgTaken: round1(r.dmgTaken), monsterHp: round1(r.monsterHp), hp: round1(r.hp), quaffed: r.potionsUsed > 0 });
    hp = r.hp;
    monsterHp = r.monsterHp;
    potions = r.potionsAfter;
    potionsUsed += r.potionsUsed;
    if (r.victory || r.defeated) {
      const hpLost = PLAYER_BASE_HP - hp;
      return { monster: monsterId, tier: monster.tier, rounds, victory: r.victory, hpLost, hpLostPct: round1((100 * hpLost) / PLAYER_BASE_HP), potionsUsed };
    }
  }
}

export type ReachRow = { x: number; y: number; kind: NodeType; what: string | null; cost: number | null; tanks: number | null };
export type ReachReport = {
  mapSeed: string;
  biomeId: string;
  entry: { x: number; y: number };
  pois: ReachRow[];
  summary: { pois: number; reachable: number; farthestCost: number; farthestTanks: number };
};

export function simReach(loadout: Loadout, mapSeed: string): ReachReport {
  const biomeId = rollBiome(mapSeed);
  const grid = generateGrid(mapSeed, biomeId);
  const cost = costToReach(grid.terrain, grid.entry, loadout.equipment.transport, loadout.equipment.tools);
  const pois: ReachRow[] = grid.pois
    .map((p) => {
      const c = cost[p.y]![p.x]!;
      const finite = Number.isFinite(c);
      return { x: p.x, y: p.y, kind: p.kind, what: p.creature ?? p.material, cost: finite ? round1(c) : null, tanks: finite ? round1(c / MAX_ENERGY) : null };
    })
    .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const finiteCosts = pois.filter((p) => p.cost !== null).map((p) => p.cost!);
  const farthestCost = finiteCosts.length ? Math.max(...finiteCosts) : 0;
  return {
    mapSeed,
    biomeId,
    entry: grid.entry,
    pois,
    summary: { pois: pois.length, reachable: finiteCosts.length, farthestCost, farthestTanks: round1(farthestCost / MAX_ENERGY) },
  };
}

export type TollCell = { victory: boolean; hpLost: number; hpLostPct: number; rounds: number };
export type TableData = {
  _generated: string;
  levers: {
    MITIGATION_K: number;
    MONSTER_TIER_HP_CURVE: Record<number, number>;
    MONSTER_TIER_DMG_CURVE: Record<number, number>;
    PLAYER_BASE_HP: number;
    CHIP_DAMAGE_MIN: number;
    AUTO_POTION_THRESHOLD: number;
    POTION_HEAL_BY: Record<string, number>;
    AFFINITY_MULTIPLIER: number;
  };
  kits: Record<string, { weapon: string | null; armour: string[] }>;
  monsters: typeof MONSTERS;
  tolls: Record<string, Record<string, TollCell>>; // monsterId (tier-then-name order) → kit → cell
  mitigation: Record<string, Record<DmgType, number>>; // kit → incoming dmgType → % reduction
};

const DMG_TYPES: DmgType[] = ["melee", "ranged", "magic"];

// The sweep: raw tolls (NO potions — the unassisted cost of each fight) for
// every monster × named kit, plus each kit's % damage reduction by dmg type.
// Persisted to docs/balance/ by `bun run sim:tables`; test/balance-tables.test.ts
// forces regeneration whenever combat data/math changes.
export function simTables(): TableData {
  const kits: TableData["kits"] = {};
  const tolls: TableData["tolls"] = {};
  const mit: TableData["mitigation"] = {};
  const kitLoadouts = new Map<string, Loadout>();
  for (const name of Object.keys(KIT_PRESETS)) {
    const l = resolveKit(name);
    kitLoadouts.set(name, l);
    kits[name] = { weapon: l.equipment.weapon, armour: (KIT_PRESETS[name]!.armour ?? []).slice() };
    const m: Record<DmgType, number> = { melee: 0, ranged: 0, magic: 0 };
    for (const t of DMG_TYPES) m[t] = round1(100 * (1 - MITIGATION_K / (MITIGATION_K + mitigation(l, t))));
    mit[name] = m;
  }
  const monsterIds = Object.keys(MONSTERS).sort((a, b) => MONSTERS[a]!.tier - MONSTERS[b]!.tier || a.localeCompare(b));
  for (const m of monsterIds) {
    const row: Record<string, TollCell> = {};
    for (const name of Object.keys(KIT_PRESETS)) {
      const r = simFight(kitLoadouts.get(name)!, m);
      row[name] = { victory: r.victory, hpLost: round1(r.hpLost), hpLostPct: r.hpLostPct, rounds: r.rounds.length };
    }
    tolls[m] = row;
  }
  return {
    _generated: "GENERATED by `bun run sim:tables` — do not edit. Combat data/math changed? Re-run it; test/balance-tables.test.ts enforces.",
    levers: {
      MITIGATION_K,
      MONSTER_TIER_HP_CURVE,
      MONSTER_TIER_DMG_CURVE,
      PLAYER_BASE_HP,
      CHIP_DAMAGE_MIN,
      AUTO_POTION_THRESHOLD,
      POTION_HEAL_BY,
      AFFINITY_MULTIPLIER,
    },
    kits,
    monsters: MONSTERS,
    tolls,
    mitigation: mit,
  };
}
