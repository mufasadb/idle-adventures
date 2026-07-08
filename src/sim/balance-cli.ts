// CLI for the balance sim (dbc): parse argv, call balance.ts, render pretty or
// --json. `run` is exported (pure in/out) so tests never need a subprocess;
// the import.meta.main block is the only side-effectful line. --write (tables)
// regenerates docs/balance/tables.{json,md} — see test/balance-tables.test.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { KIT_PRESETS, resolveKit, simFight, simReach, simTables, mapTierReport } from "./balance";
import type { FightReport, ReachReport, TableData, MapTierReport, KitSpec } from "./balance";
import { harvestFractionReport } from "./harvest";
import { candidateMaps } from "../engine/town";
import type { ItemStack } from "../engine/types";

type Flags = { kit: string; overrides: KitSpec; vs?: string; seed?: string; json: boolean; write: boolean };

function parseStacks(v: string): ItemStack[] {
  return v.split(",").map((part) => {
    const [defId, qty] = part.split(":");
    if (!defId || !qty || !Number.isFinite(Number(qty))) throw new Error(`bad stack spec "${part}" — use defId:qty[,defId:qty]`);
    return { defId, qty: Number(qty) };
  });
}

function parseFlags(rest: string[]): Flags {
  const f: Flags = { kit: "bare", overrides: {}, json: false, write: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    const next = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`flag ${a} needs a value`);
      return v;
    };
    if (a === "--json") f.json = true;
    else if (a === "--write") f.write = true;
    else if (a === "--kit") f.kit = next();
    else if (a === "--vs") f.vs = next();
    else if (a === "--seed") f.seed = next();
    else if (a === "--weapon") f.overrides.weapon = next();
    else if (a === "--armour") f.overrides.armour = next().split(",");
    else if (a === "--tools") f.overrides.tools = next().split(",");
    else if (a === "--transport") f.overrides.transport = next();
    else if (a === "--potions") f.overrides.potions = parseStacks(next());
    else if (a === "--battle-items") f.overrides.battleItems = parseStacks(next());
    else throw new Error(`unknown flag: ${a}`);
  }
  return f;
}

function renderFight(r: FightReport): string {
  const rows = r.rounds.map((x) => `  ${String(x.round).padStart(3)} │ you hit ${String(x.dmgDealt).padStart(5)} │ it hit ${String(x.dmgTaken).padStart(5)} │ it: ${String(x.monsterHp).padStart(5)} hp │ you: ${String(x.hp).padStart(5)} hp${x.quaffed ? " 🧪" : ""}`);
  return [
    `fight vs ${r.monster} (tier ${r.tier})`,
    `round │ dealt │ taken │ monster │ you`,
    ...rows,
    r.victory ? `verdict: VICTORY — hpLost ${r.hpLost} (${r.hpLostPct}%), potions ${r.potionsUsed}, ${r.rounds.length} rounds` : `verdict: DEFEAT after ${r.rounds.length} rounds (potions ${r.potionsUsed})`,
  ].join("\n");
}

function renderReach(r: ReachReport): string {
  const rows = r.pois.map((p) => `  (${String(p.x).padStart(2)},${String(p.y).padStart(2)}) ${p.kind.padEnd(7)} ${(p.what ?? "—").padEnd(16)} ${p.cost === null ? "  unreachable" : `${String(p.cost).padStart(6)}e  ${p.capacities}x capacity`}`);
  return [
    `reach on ${r.mapSeed} (${r.biomeId}) from (${r.entry.x},${r.entry.y})`,
    ...rows,
    `summary: ${r.summary.reachable}/${r.summary.pois} reachable · farthest ${r.summary.farthestCost}e = ${r.summary.farthestCapacities}x capacity`,
  ].join("\n");
}

export function renderTablesMd(d: TableData): string {
  const kitNames = Object.keys(d.kits);
  const toll = [
    `| monster (tier) | ${kitNames.join(" | ")} |`,
    `|---|${kitNames.map(() => "---").join("|")}|`,
    ...Object.keys(d.tolls).map((m) => {
      const cells = kitNames.map((k) => {
        const c = d.tolls[m]![k]!;
        return c.victory ? `${c.hpLost} (${c.hpLostPct}%)` : `✗ dead r${c.rounds}`;
      });
      return `| ${m} (${d.monsters[m]!.tier}) | ${cells.join(" | ")} |`;
    }),
  ];
  const mit = [
    `| kit | melee | ranged | magic |`,
    `|---|---|---|---|`,
    ...kitNames.map((k) => `| ${k} | ${d.mitigation[k]!.melee}% | ${d.mitigation[k]!.ranged}% | ${d.mitigation[k]!.magic}% |`),
  ];
  return [
    `<!-- ${d._generated} -->`,
    `# Balance tables`,
    ``,
    `Raw fight tolls (no potions) per kit — cell = hpLost (of ${d.levers.PLAYER_BASE_HP} base HP). ✗ = defeat.`,
    ``,
    ...toll,
    ``,
    `## Damage reduction by armour kit (MITIGATION_K = ${d.levers.MITIGATION_K})`,
    ``,
    ...mit,
    ``,
  ].join("\n");
}

export function renderTierTableMd(r: MapTierReport): string {
  const header = `| tier | avg POI count | bosses present |`;
  const sep = `|---|---|---|`;
  const rows = r.rows.map((row) => `| ${row.tier} | ${row.poiCount} | ${row.bosses.length ? row.bosses.join(", ") : "—"} |`);
  return [
    `## Map tier scaling`,
    ``,
    `Average POI count and boss presence per tier (sampled across all biomes).`,
    ``,
    header,
    sep,
    ...rows,
    ``,
  ].join("\n");
}

const USAGE = [
  `usage: bun run sim <fight|reach|tables|harvest> [flags]`,
  `  fight    --kit <${Object.keys(KIT_PRESETS).join("|")}> [--weapon --armour a,b --potions defId:qty --battle-items defId:qty] --vs <monsterId> [--json]`,
  `  reach    --kit <...> [--tools a,b --transport t] --seed <mapSeed> [--json]`,
  `  tables   [--json] [--write]   (--write regenerates docs/balance/tables.{md,json})`,
  `  harvest  [--seed <tier>] [--json]   (--seed selects map tier, default 3; samples 5 maps with a tier-food pemmican loadout)`,
].join("\n");

export function run(argv: string[]): { code: number; output: string } {
  try {
    const [cmd, ...rest] = argv;
    if (!cmd) return { code: 1, output: USAGE };
    const flags = parseFlags(rest);
    if (cmd === "fight") {
      if (!flags.vs) throw new Error("fight needs --vs <monsterId>");
      const report = simFight(resolveKit(flags.kit, flags.overrides), flags.vs);
      return { code: 0, output: flags.json ? JSON.stringify(report, null, 2) : renderFight(report) };
    }
    if (cmd === "reach") {
      if (!flags.seed) throw new Error("reach needs --seed <mapSeed>");
      const report = simReach(resolveKit(flags.kit, flags.overrides), flags.seed);
      return { code: 0, output: flags.json ? JSON.stringify(report, null, 2) : renderReach(report) };
    }
    if (cmd === "tables") {
      const data = simTables();
      const tierData = mapTierReport();
      if (flags.write) return writeTables(data, tierData);
      if (flags.json) return { code: 0, output: JSON.stringify({ tables: data, tiers: tierData }, null, 2) };
      return { code: 0, output: renderTablesMd(data) + "\n" + renderTierTableMd(tierData) };
    }
    if (cmd === "harvest") {
      const tier = Number(flags.seed ?? 3); // --seed reused as tier selector for this view
      const maps = Array.from({ length: 5 }, (_, i) => candidateMaps("hf", i)[0]!.mapSeed);
      const rep = harvestFractionReport(
        { tools: ["pick", "knife", "canteen", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "pemmican", qty: 6 }] },
        tier,
        maps,
      );
      if (flags.json) return { code: 0, output: JSON.stringify(rep, null, 2) };
      const output =
        `harvest@T${tier}: avg ${(100 * rep.avg).toFixed(0)}% over ${rep.rows.length} maps\n` +
        rep.rows.map((r) => `  ${r.mapSeed}: ${r.cleared}/${r.total} (${(100 * r.fraction).toFixed(0)}%)`).join("\n");
      return { code: 0, output };
    }
    return { code: 1, output: `unknown command: ${cmd}\n${USAGE}` };
  } catch (e) {
    return { code: 1, output: e instanceof Error ? e.message : String(e) };
  }
}

// Regenerates the checked-in balance surface. Byte-stable: no timestamps, all
// numbers pre-rounded in balance.ts, plain JSON.stringify ordering.
// tables.{json,md} = combat data only (staleness gate pins to renderTablesMd).
// tier-table.json = map-tier scaling data (separate artifact, separate gate).
function writeTables(data: TableData, tierData: MapTierReport): { code: number; output: string } {
  mkdirSync("docs/balance", { recursive: true });
  writeFileSync("docs/balance/tables.json", JSON.stringify(data, null, 2) + "\n");
  writeFileSync("docs/balance/tables.md", renderTablesMd(data));
  writeFileSync("docs/balance/tier-table.json", JSON.stringify(tierData, null, 2) + "\n");
  return { code: 0, output: "wrote docs/balance/tables.json + docs/balance/tables.md + docs/balance/tier-table.json" };
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  console.log(r.output);
  process.exitCode = r.code;
}
