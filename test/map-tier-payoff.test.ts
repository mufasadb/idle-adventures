// Map-tier PAYOFF measurement (zpm.4, map-economy spec §④ — "verify higher tiers
// pay out better loot/items"). NOT a pass/fail balance gate: a REPORT (console.log)
// that QUANTIFIES the T1-vs-T3 (and T5) difference on the SAME biome, so the
// decision to tune (or not) is grounded in numbers. The companion climb harness
// (map-tier-climb / map-climb.test.ts) proves the loop is reachable; this proves
// it's worth climbing.
//
// The value proxies are deliberately simple and generation-side (no combat sim):
//   • POI count               — POI_DENSITY_BY_TIER (more nodes = more haul)
//   • gathered-material value  — Σ over gatherable POIs of value(material) × yield,
//                                where value() ranks tiered/gated materials higher
//                                (MATERIAL_MAP_TIER_WEIGHT membership + MATERIAL_GATE)
//                                and yield rides NODE_MAGNITUDE_YIELD[magnitude].
//   • monster tier + HP        — Σ MONSTER_TIER_HP_CURVE[tier] over monster POIs
//                                (difficulty axis; higher-tier monsters carry the
//                                richer LOOT_TABLE drops too).
// These are ORDINAL proxies for "is the climb felt", not economy-accurate prices.
import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid } from "../src/engine/grid";
import {
  MATERIAL_MAP_TIER_WEIGHT, MATERIAL_GATE, NODE_MAGNITUDE_YIELD, GATHER_YIELD,
  BIOME_IDS,
} from "../src/data/constants";
import type { BiomeId, GatherableNodeType } from "../src/data/constants";
import { MONSTERS, MONSTER_TIER_HP_CURVE, LOOT_TABLE } from "../src/data/combat";

// Ordinal value of one unit of a gathered material. Base 1; +1 if it's a tiered
// material (appears in MATERIAL_MAP_TIER_WEIGHT — coal/iron/mithril climb); +2 if
// it's access-GATED (needs a hardened tool — the "stronger availability" tail the
// user wants). Tuned only to RANK materials, not to price them.
function materialValue(defId: string): number {
  let v = 1;
  if (defId in MATERIAL_MAP_TIER_WEIGHT) v += 1;
  if (defId in MATERIAL_GATE) v += 2;
  return v;
}

type Metrics = {
  pois: number;
  gatherNodes: number;
  monsters: number;
  gatheredValue: number; // Σ materialValue × GATHER_YIELD[kind] × NODE_MAGNITUDE_YIELD[mag]
  gatedShare: number;    // fraction of gatherable POIs whose material is access-gated
  monsterHp: number;     // Σ MONSTER_TIER_HP_CURVE[tier]
  maxMonsterTier: number;
  richNodes: number;     // magnitude ≥ 2 gatherable nodes
};

function measure(grid: Grid): Metrics {
  let gatherNodes = 0, monsters = 0, gatheredValue = 0, gated = 0, monsterHp = 0, maxTier = 0, rich = 0;
  for (const p of grid.pois) {
    if (p.kind === "monster") {
      monsters++;
      const t = MONSTERS[p.creature!]?.tier ?? 1;
      monsterHp += MONSTER_TIER_HP_CURVE[t] ?? 0;
      maxTier = Math.max(maxTier, t);
    } else if (p.material) {
      gatherNodes++;
      const mag = p.magnitude ?? 1;
      if (mag >= 2) rich++;
      const yieldQty = (GATHER_YIELD[p.kind as GatherableNodeType] ?? 1) * (NODE_MAGNITUDE_YIELD[mag] ?? 1);
      gatheredValue += materialValue(p.material) * yieldQty;
      if (p.material in MATERIAL_GATE) gated++;
    }
  }
  return {
    pois: grid.pois.length,
    gatherNodes, monsters, gatheredValue,
    gatedShare: gatherNodes ? gated / gatherNodes : 0,
    monsterHp, maxMonsterTier: maxTier, richNodes: rich,
  };
}

// Average the metrics over N seeds whose base biome is `biomeId`, generating each
// at the given tier. Same seed set across tiers (via the biome filter) so T1 vs Tn
// is an apples-to-apples comparison of the SAME maps at different tiers.
function averageForBiome(biomeId: BiomeId, tier: number, seeds: string[]): Metrics {
  const acc: Metrics = { pois: 0, gatherNodes: 0, monsters: 0, gatheredValue: 0, gatedShare: 0, monsterHp: 0, maxMonsterTier: 0, richNodes: 0 };
  for (const s of seeds) {
    const m = measure(generateGrid(s, biomeId, tier));
    acc.pois += m.pois; acc.gatherNodes += m.gatherNodes; acc.monsters += m.monsters;
    acc.gatheredValue += m.gatheredValue; acc.gatedShare += m.gatedShare;
    acc.monsterHp += m.monsterHp; acc.maxMonsterTier += m.maxMonsterTier; acc.richNodes += m.richNodes;
  }
  const n = seeds.length;
  return {
    pois: acc.pois / n, gatherNodes: acc.gatherNodes / n, monsters: acc.monsters / n,
    gatheredValue: acc.gatheredValue / n, gatedShare: acc.gatedShare / n,
    monsterHp: acc.monsterHp / n, maxMonsterTier: acc.maxMonsterTier / n, richNodes: acc.richNodes / n,
  };
}

// Seeds whose base biome is `biomeId` (so the SAME maps compare across tiers).
function seedsForBiome(biomeId: BiomeId, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 6000; i++) {
    const s = `payoff-${i}`;
    if (rollBiome(s) === biomeId) out.push(s);
  }
  return out;
}

test("payoff report: T1 vs T3 vs T5 on the same biome (value, difficulty, richness)", () => {
  const N = 40;
  const lines: string[] = [];
  // Snapshot for the report footer — asserted below to keep the measurement honest.
  const t1Values: Record<string, number> = {};
  const t3Values: Record<string, number> = {};

  for (const biomeId of BIOME_IDS) {
    const seeds = seedsForBiome(biomeId, N);
    const t1 = averageForBiome(biomeId, 1, seeds);
    const t3 = averageForBiome(biomeId, 3, seeds);
    const t5 = averageForBiome(biomeId, 5, seeds);
    t1Values[biomeId] = t1.gatheredValue;
    t3Values[biomeId] = t3.gatheredValue;
    const vMul = t1.gatheredValue ? t3.gatheredValue / t1.gatheredValue : 0;
    const hpMul = t1.monsterHp ? t3.monsterHp / t1.monsterHp : 0;
    lines.push(
      `[payoff:${biomeId}] (avg of ${seeds.length} same-biome seeds)\n` +
      `  POIs:          T1 ${t1.pois.toFixed(1)}  T3 ${t3.pois.toFixed(1)}  T5 ${t5.pois.toFixed(1)}\n` +
      `  gathered-value:T1 ${t1.gatheredValue.toFixed(1)}  T3 ${t3.gatheredValue.toFixed(1)}  T5 ${t5.gatheredValue.toFixed(1)}   (T3 = ${vMul.toFixed(2)}× T1)\n` +
      `  rich nodes≥2:  T1 ${t1.richNodes.toFixed(1)}  T3 ${t3.richNodes.toFixed(1)}  T5 ${t5.richNodes.toFixed(1)}\n` +
      `  gated share:   T1 ${(100 * t1.gatedShare).toFixed(0)}%  T3 ${(100 * t3.gatedShare).toFixed(0)}%  T5 ${(100 * t5.gatedShare).toFixed(0)}%\n` +
      `  monster HP Σ:  T1 ${t1.monsterHp.toFixed(0)}  T3 ${t3.monsterHp.toFixed(0)}  T5 ${t5.monsterHp.toFixed(0)}   (T3 = ${hpMul.toFixed(2)}× T1)\n` +
      `  max mon tier:  T1 ${t1.maxMonsterTier.toFixed(1)}  T3 ${t3.maxMonsterTier.toFixed(1)}  T5 ${t5.maxMonsterTier.toFixed(1)}`,
    );
  }
  console.log("\n" + lines.join("\n\n") + "\n");

  // Structural sanity (not a tuning gate, just "the measurement isn't broken"):
  // every biome pays out strictly MORE gathered-value at T3 than T1, and no biome
  // pays LESS — if this reddens, the tier levers regressed and the report is the diff.
  for (const biomeId of BIOME_IDS) {
    expect(t3Values[biomeId]!).toBeGreaterThan(t1Values[biomeId]!);
  }
}, 30000);

// A crude "expected loot value" per monster tier, from the fixed LOOT_TABLE, to
// sanity-check that higher-tier monsters (which higher map tiers add) also carry
// richer drops — the "stronger item availability" the user asked about. Reported,
// not gated.
test("payoff report: monster loot richness rises with tier", () => {
  // Rank each monster's fixed loot by (qty × a rough part-value): boss/gated parts
  // are worth more. Proxy only — value() ranks, doesn't price.
  const lootValue = (creature: string): number => {
    const entries = LOOT_TABLE[creature] ?? [];
    let v = 0;
    for (const e of entries) v += (e.qty ?? 1) * (e.chance ?? 1) * (MONSTERS[creature]?.tier ?? 1);
    return v;
  };
  const byTier = new Map<number, number[]>();
  for (const [creature, m] of Object.entries(MONSTERS)) {
    const arr = byTier.get(m.tier) ?? [];
    arr.push(lootValue(creature));
    byTier.set(m.tier, arr);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const avgByTier = tiers.map((t) => {
    const arr = byTier.get(t)!;
    return { tier: t, avg: arr.reduce((s, x) => s + x, 0) / arr.length };
  });
  console.log(
    "\n[payoff:loot] avg fixed-loot value by monster tier: " +
    avgByTier.map((a) => `T${a.tier}=${a.avg.toFixed(1)}`).join("  ") + "\n",
  );
  // The tier-4 boss must out-value the tier-1 pool (its drops craft the endgame gear).
  const t1 = avgByTier.find((a) => a.tier === 1)!.avg;
  const t4 = avgByTier.find((a) => a.tier === 4)!.avg;
  expect(t4).toBeGreaterThan(t1);
});
