# Balance Sim CLI (dbc) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `bun run sim` CLI that mechanically derives fight traces, reach anatomy, and the sweep toll tables from the pure engine — with checked-in table artifacts a test forces back in sync whenever combat data/math changes.

**Architecture:** Two sim-layer files: `src/sim/balance.ts` (pure computation returning plain data objects — kits, `simFight`, `simReach`, `simTables`) and `src/sim/balance-cli.ts` (argv parsing + pretty/JSON rendering + `--write` artifact generation, exporting a testable `run(argv)`). Artifacts live in `docs/balance/`; `test/balance-tables.test.ts` regenerates and deep-equals them.

**Tech Stack:** bun (runtime + `bun test`), TypeScript strict, no new dependencies (hand-rolled argv parsing; `node:fs` for `--write`).

**Spec:** `docs/superpowers/specs/2026-07-07-balance-sim-cli-design.md` · **Bead:** `idle-adventure-dbc` (both tasks).

## Global Constraints

- The sim layer may import the engine; the engine must not change AT ALL in this feature (no `src/engine/` or `src/data/` edits except the Task 2 pointer COMMENTS — comments only, zero code).
- Every command computes a plain data object first; rendering (pretty or `--json`) is a separate pure function of that object.
- Regeneration must be byte-stable: no timestamps, no locale formatting, numbers rounded to 1 decimal via a shared helper, JSON via `JSON.stringify(data, null, 2)`.
- Kit presets: `bare` (`sword`, no armour) · `iron` (`iron-sword` + plate-helmet/chest/legs/boots/gloves) · `steel` (`steel-sword` + steel-plate-*) · `mithril` (`mithril-sword` + mithril-plate-*).
- Fail fast on unknown ids, naming the valid set in the error message.
- Quality gates before each commit: `bun test && bun run typecheck && bun run lint`.

---

### Task 1: Core computation + CLI (bead dbc, part 1)

**Files:**
- Create: `src/sim/balance.ts`
- Create: `src/sim/balance-cli.ts`
- Modify: `package.json` (add `"sim": "bun run src/sim/balance-cli.ts"` to scripts)
- Test: `test/balance-sim.test.ts` (create)

**Interfaces:**
- Consumes (all existing): `strikeExchange`, `resolveCombat`, `battleBuff`, `mitigation` from `src/engine/combat.ts`; `costToReach` from `src/engine/reach.ts`; `generateGrid`, `rollBiome` from `src/engine/grid.ts`; `emptyLoadout` from `src/engine/loadout.ts`; `MONSTERS`, `WEAPONS`, `ARMOUR`, `TOOL_CAPABILITY`, `TRANSPORT_MULTIPLIER`, `POTION`, `BATTLE_ITEM`, `MONSTER_TIER_HP_CURVE`, `MONSTER_TIER_DMG_CURVE`, `PLAYER_BASE_HP`, `MAX_ENERGY`, `MITIGATION_K`, `CHIP_DAMAGE_MIN`, `AUTO_POTION_THRESHOLD`, `POTION_HEAL_BY`, `AFFINITY_MULTIPLIER` from `src/data/constants.ts`; `ItemStack`, `Loadout` types.
- Produces (Task 2 relies on): `simTables(): TableData` and `renderTablesMd(data: TableData): string` and `run(argv: string[]): { code: number; output: string }` (with `--write` handled in Task 2).

- [ ] **Step 1: Write the failing tests**

Create `test/balance-sim.test.ts`:

```ts
import { test, expect } from "bun:test";
import { resolveKit, simFight, simReach, KIT_PRESETS } from "../src/sim/balance";
import { run } from "../src/sim/balance-cli";
import { resolveCombat } from "../src/engine/combat";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { PLAYER_BASE_HP } from "../src/data/constants";

test("resolveKit: mithril preset is full mithril plate + mithril-sword", () => {
  const l = resolveKit("mithril");
  expect(l.equipment.weapon).toBe("mithril-sword");
  expect([l.equipment.helmet, l.equipment.chest, l.equipment.legs, l.equipment.boots, l.equipment.gloves]).toEqual([
    "mithril-plate-helmet", "mithril-plate-chest", "mithril-plate-legs", "mithril-plate-boots", "mithril-plate-gloves",
  ]);
  expect(l.potions).toEqual([]);
});

test("resolveKit: overrides replace preset fields", () => {
  const l = resolveKit("mithril", { weapon: "wyrmfang", potions: [{ defId: "greater-potion", qty: 3 }] });
  expect(l.equipment.weapon).toBe("wyrmfang");
  expect(l.equipment.chest).toBe("mithril-plate-chest"); // armour untouched by a weapon override
  expect(l.potions).toEqual([{ defId: "greater-potion", qty: 3 }]);
});

test("resolveKit: unknown ids fail fast naming the valid set", () => {
  expect(() => resolveKit("adamantium")).toThrow(/valid: .*mithril/);
  expect(() => resolveKit("bare", { weapon: "lightsaber" })).toThrow(/valid: /);
  expect(() => resolveKit("bare", { potions: [{ defId: "coffee", qty: 1 }] })).toThrow(/valid: /);
});

// The composition can't drift from the engine: simFight's verdict must equal
// resolveCombat's for every kit × monster × potion combination we sweep.
test("simFight matches resolveCombat across kits × monsters × potions", () => {
  const monsters = ["forest-boar", "giant-scorpion", "ice-troll", "ancient-wyrm"];
  const potionSets: { defId: string; qty: number }[][] = [[], [{ defId: "greater-potion", qty: 3 }]];
  for (const kitName of Object.keys(KIT_PRESETS)) {
    for (const m of monsters) {
      for (const potions of potionSets) {
        const kit = resolveKit(kitName, { potions });
        const report = simFight(kit, m);
        const atomic = resolveCombat(kit, PLAYER_BASE_HP, m);
        expect({ victory: report.victory, hpLost: report.hpLost, potionsUsed: report.potionsUsed })
          .toEqual({ victory: atomic.victory, hpLost: atomic.hpLost, potionsUsed: atomic.potionsUsed });
        expect(report.rounds.length).toBeGreaterThan(0);
      }
    }
  }
});

test("simReach: every POI reported; on-foot all reachable; strip out-ranges one tank", () => {
  const seed = "sim-reach-0";
  const report = simReach(resolveKit("bare"), seed);
  const grid = generateGrid(seed, rollBiome(seed));
  expect(report.summary.pois).toBe(grid.pois.length);
  expect(report.summary.reachable).toBe(report.summary.pois); // e3j: POIs sample walkable tiles, one component
  expect(report.summary.farthestTanks).toBeGreaterThan(1); // e3j: the strip out-ranges one energy tank
  const costs = report.pois.map((p) => p.cost!);
  expect([...costs].sort((a, b) => a - b)).toEqual(costs); // sorted ascending
});

test("CLI: fight smoke, json roundtrip, unknown monster exits 1", () => {
  const pretty = run(["fight", "--kit", "bare", "--vs", "forest-boar"]);
  expect(pretty.code).toBe(0);
  expect(pretty.output).toContain("forest-boar");
  expect(pretty.output.toLowerCase()).toContain("victory");
  const json = run(["fight", "--kit", "mithril", "--potions", "greater-potion:3", "--vs", "ancient-wyrm", "--json"]);
  expect(json.code).toBe(0);
  const parsed = JSON.parse(json.output);
  expect(parsed.victory).toBe(true); // the pinned Wyrm gate, via the CLI
  expect(parsed.potionsUsed).toBe(3);
  const bad = run(["fight", "--kit", "bare", "--vs", "nonsense"]);
  expect(bad.code).toBe(1);
  expect(bad.output).toContain("valid:");
  const noCmd = run([]);
  expect(noCmd.code).toBe(1);
  expect(noCmd.output).toContain("usage");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/balance-sim.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `src/sim/balance.ts`**

```ts
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
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  PLAYER_BASE_HP,
  MAX_ENERGY,
  MITIGATION_K,
  CHIP_DAMAGE_MIN,
  AUTO_POTION_THRESHOLD,
  POTION_HEAL_BY,
  AFFINITY_MULTIPLIER,
} from "../data/constants";
import type { DmgType, NodeType } from "../data/constants";
import type { ItemStack, Loadout } from "../engine/types";
import { emptyLoadout } from "../engine/loadout";
import { strikeExchange, battleBuff, mitigation } from "../engine/combat";
import { generateGrid, rollBiome } from "../engine/grid";
import { costToReach } from "../engine/reach";

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export type KitSpec = {
  weapon?: string;
  armour?: string[];
  tools?: string[];
  transport?: string;
  potions?: ItemStack[];
  battleItems?: ItemStack[];
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
  for (const piece of spec.armour ?? []) {
    known(piece, ARMOUR, "armour piece");
    l.equipment[ARMOUR[piece]!.slot] = piece;
  }
  for (const t of spec.tools ?? []) {
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
```

- [ ] **Step 4: Implement `src/sim/balance-cli.ts`**

```ts
// CLI for the balance sim (dbc): parse argv, call balance.ts, render pretty or
// --json. `run` is exported (pure in/out) so tests never need a subprocess;
// the import.meta.main block is the only side-effectful line. --write (tables)
// lands in the artifacts step of this feature.
import { KIT_PRESETS, resolveKit, simFight, simReach, simTables, round1 } from "./balance";
import type { FightReport, ReachReport, TableData, KitSpec } from "./balance";
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
  const rows = r.pois.map((p) => `  (${String(p.x).padStart(2)},${String(p.y).padStart(2)}) ${p.kind.padEnd(7)} ${(p.what ?? "—").padEnd(16)} ${p.cost === null ? "  unreachable" : `${String(p.cost).padStart(6)}e  ${p.tanks}x tank`}`);
  return [
    `reach on ${r.mapSeed} (${r.biomeId}) from (${r.entry.x},${r.entry.y})`,
    ...rows,
    `summary: ${r.summary.reachable}/${r.summary.pois} reachable · farthest ${r.summary.farthestCost}e = ${r.summary.farthestTanks}x tank`,
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

const USAGE = [
  `usage: bun run sim <fight|reach|tables> [flags]`,
  `  fight  --kit <${Object.keys(KIT_PRESETS).join("|")}> [--weapon --armour a,b --potions defId:qty --battle-items defId:qty] --vs <monsterId> [--json]`,
  `  reach  --kit <...> [--tools a,b --transport t] --seed <mapSeed> [--json]`,
  `  tables [--json] [--write]   (--write regenerates docs/balance/tables.{md,json})`,
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
      if (flags.write) return writeTables(data); // Task 2 wires this
      return { code: 0, output: flags.json ? JSON.stringify(data, null, 2) : renderTablesMd(data) };
    }
    return { code: 1, output: `unknown command: ${cmd}\n${USAGE}` };
  } catch (e) {
    return { code: 1, output: e instanceof Error ? e.message : String(e) };
  }
}

// Task 2 replaces this stub with the real artifact writer.
function writeTables(_data: TableData): { code: number; output: string } {
  return { code: 1, output: "--write not wired yet (Task 2)" };
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  console.log(r.output);
  process.exitCode = r.code;
}
```

Add to `package.json` scripts: `"sim": "bun run src/sim/balance-cli.ts",`

- [ ] **Step 5: Run the tests**

Run: `bun test test/balance-sim.test.ts`
Expected: PASS ×6 (the Wyrm CLI roundtrip passes because the 3-potion gate is pinned engine behavior).

- [ ] **Step 6: Try it by hand (sanity, not a gate)**

Run: `bun run sim fight --kit bare --vs forest-boar` → round table + `VICTORY — hpLost 8 (26.7%)`.
Run: `bun run sim tables | head -20` → the toll matrix renders.

- [ ] **Step 7: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/sim/balance.ts src/sim/balance-cli.ts package.json test/balance-sim.test.ts
git commit -m "dbc: balance sim CLI — fight/reach/tables composing the pure engine"
```

---

### Task 2: Persisted artifacts + staleness test + pointer comments (bead dbc, part 2)

**Files:**
- Modify: `src/sim/balance-cli.ts` (real `writeTables`)
- Create: `docs/balance/tables.json` + `docs/balance/tables.md` (generated — never hand-edited)
- Modify: `package.json` (add `"sim:tables": "bun run src/sim/balance-cli.ts tables --write"`)
- Modify: `src/data/constants.ts` + `src/engine/combat.ts` (pointer COMMENTS only — zero code)
- Modify: `docs/working-on-this-codebase.md` (one bullet under Harness invariants)
- Test: `test/balance-tables.test.ts` (create)

**Interfaces:**
- Consumes: `simTables(): TableData`, `renderTablesMd(data)` from Task 1.
- Produces: the committed artifacts + the staleness gate. Nothing downstream.

- [ ] **Step 1: Write the failing staleness test**

Create `test/balance-tables.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { simTables } from "../src/sim/balance";

// The committed tables are the citable balance surface. Any change to monsters,
// combat-affecting items, or the combat math shifts simTables() output — this
// test goes red until you regenerate: `bun run sim:tables` (then commit the
// docs/balance/ diff; reviewing it IS reviewing the balance change).
test("committed balance tables are current — run `bun run sim:tables` after combat changes", () => {
  const committed = JSON.parse(readFileSync("docs/balance/tables.json", "utf8"));
  expect(simTables()).toEqual(committed);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/balance-tables.test.ts`
Expected: FAIL — `docs/balance/tables.json` doesn't exist.

- [ ] **Step 3: Wire the real `writeTables`**

In `src/sim/balance-cli.ts`, replace the stub (imports at top: `import { mkdirSync, writeFileSync } from "node:fs";`):

```ts
// Regenerates the checked-in balance surface. Byte-stable: no timestamps, all
// numbers pre-rounded in balance.ts, plain JSON.stringify ordering.
function writeTables(data: TableData): { code: number; output: string } {
  mkdirSync("docs/balance", { recursive: true });
  writeFileSync("docs/balance/tables.json", JSON.stringify(data, null, 2) + "\n");
  writeFileSync("docs/balance/tables.md", renderTablesMd(data));
  return { code: 0, output: "wrote docs/balance/tables.json + docs/balance/tables.md" };
}
```

Add to `package.json` scripts: `"sim:tables": "bun run src/sim/balance-cli.ts tables --write",`

- [ ] **Step 4: Generate the artifacts; test goes green**

Run: `bun run sim:tables` → `wrote docs/balance/tables.json + docs/balance/tables.md`
Run: `bun test test/balance-tables.test.ts` → PASS.
Eyeball `docs/balance/tables.md`: bare-vs-boar should read `8 (26.7%)`, mithril column ≈60–70% reduction, Wyrm row ✗ for bare/iron.
Run `bun run sim:tables` AGAIN and `git status` — the files must be unchanged (byte-stability check).

- [ ] **Step 5: Pointer comments (comments only — no code changes)**

One line at each site, matching this template: `// ⚠ balance surface: changing this requires \`bun run sim:tables\` (test/balance-tables.test.ts enforces)`

- `src/data/constants.ts`: immediately above `MITIGATION_K`, `MONSTER_TIER_HP_CURVE`, `MONSTER_TIER_DMG_CURVE`, `MONSTERS`, `WEAPONS`, `ARMOUR`, `AFFINITIES`, `COMBAT_BUFF`.
- `src/engine/combat.ts`: one line appended to the header comment block.
- `docs/working-on-this-codebase.md`, under "Harness invariants", add: `- test/balance-tables.test.ts — the committed docs/balance/ tables must match simTables(); red means a combat-affecting change landed without \`bun run sim:tables\`. Regenerate and commit the table diff — reading that diff is how a tuning change gets reviewed.`

- [ ] **Step 6: Gates + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (comments don't disturb lint; the boundary test is unaffected — no new engine imports).

```bash
git add -A
git commit -m "dbc: checked-in balance tables + staleness test + pointer comments at every combat-affecting site"
```
