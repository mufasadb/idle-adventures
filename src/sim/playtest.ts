// Blind-playtest PLAYER CONSOLE. Prints ONLY what a real player sees through the
// interface — state, the town offer + full recipe book, the PERCEPTION-GATED map
// (flavored, in-range detail only), legal actions, and post-fight matchup lessons.
// It never surfaces engine internals (loot tables, monster stats, affinities,
// where a material comes from). Drive it like `bun run play`: append one action to
// the JSON array and re-run to advance.
//   bun run playtest <seed> '[actions json]'
import { play } from "./play";
import { legalActions } from "./legal";
import { summarize } from "./report";
import { candidateMaps } from "../engine/town";
import { generateGrid, rollBiome } from "../engine/grid";
import { perceive } from "../engine/perceive";
import {
  flavorDetail,
  matchupLessons,
  TERRAIN_CHAR,
  POI_CHAR,
  PLAYER_CHAR,
} from "../render/render";
import { RECIPE, GRID_SIZE } from "../data/constants";
import type { Action, GameEvent, GameState } from "../engine/types";

const [seed, actionsArg] = process.argv.slice(2);
if (!seed) {
  console.error("usage: bun run playtest <seed> '[actions json]'");
  process.exit(1);
}
const actions: Action[] = actionsArg ? (JSON.parse(actionsArg) as Action[]) : [];
const { state, events } = play(seed, actions);

// --- events this batch (human-readable; fights include the lesson) ---
function fmtEvent(e: GameEvent): string {
  switch (e.type) {
    case "embarked": return `▶ embarked on a ${e.biomeId} map — ${e.energy} energy`;
    case "moved": return `walked to (${e.to.x},${e.to.y}) on ${e.terrain} · −${e.cost}e → ${e.energy}e`;
    case "gathered": return `gathered ${e.qty}× ${e.material} · −${e.cost}e → ${e.energy}e`;
    case "dropped": return `dropped ${e.qty}× ${e.defId}`;
    case "fought": {
      const lessons = matchupLessons(e.matchup, null);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      return (e.victory
        ? `⚔ beat it · −${e.hpLost}hp · loot ${e.loot.map((l) => `${l.qty}× ${l.defId}`).join(", ") || "none"}`
        : `☠ you were downed · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ crafted ${e.output.qty}× ${e.output.defId}`;
    case "packed": return `packed ${e.defId} → ${e.slot}`;
    case "run-ended": return `— run ended (${e.reason})`;
    case "action-rejected": return `✗ ${e.action} rejected: ${e.reason}`;
    default: return JSON.stringify(e);
  }
}

console.log("=== EVENTS (this batch) ===");
if (events.length === 0) console.log("(none)");
for (const e of events) console.log(fmtEvent(e));

// --- you ---
const s = summarize(state);
console.log("\n=== YOU ===");
console.log(`phase: ${s.phase} · runs completed: ${state.runs ?? 0}`);
if (s.expedition) console.log(`energy: ${s.expedition.energy} · hp: ${s.expedition.hp} · pos (${s.expedition.pos.x},${s.expedition.pos.y}) · nodes cleared: ${s.expedition.cleared}`);
console.log(`bank: ${s.bank.map((i) => `${i.qty}× ${i.defId}`).join(", ") || "(empty)"}`);
// Show the ACTIVE loadout: on an expedition the equipped gear lives on
// expedition.loadout (state.loadout is the town plan, empty mid-run).
const active = state.expedition?.loadout ?? s.loadout;
const eq = active.equipment;
const worn = [eq.weapon, eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves, eq.transport, eq.backpack, eq.panniers, ...eq.tools].filter(Boolean);
console.log(`equipped: ${worn.join(", ") || "(nothing)"} · food: ${active.food.map((f) => `${f.qty}× ${f.defId}`).join(", ") || "none"} · potions: ${active.potions.map((p) => `${p.qty}× ${p.defId}`).join(", ") || "none"}${active.battleItems?.length ? ` · battle: ${active.battleItems.map((b) => `${b.qty}× ${b.defId}`).join(", ")}` : ""}`);

if (s.phase === "town") printTown(state);
else printExpedition(state);

console.log("\n=== LEGAL ACTIONS (what you can do now) ===");
for (const a of legalActions(state)) console.log(JSON.stringify(a));

function printTown(st: GameState): void {
  console.log("\n=== TOWN ===");
  const offer = candidateMaps(st.seed, st.runs ?? 0);
  console.log("Maps on offer (choose one to embark; you can't return to a past one):");
  for (const m of offer) console.log(`  • ${m.preview.headline}  →  embark mapSeed="${m.mapSeed}"`);
  const affordable = new Set(
    legalActions(st).filter((a) => a.type === "craft").map((a) => (a as { recipeId: string }).recipeId),
  );
  console.log("\nRecipe book (every craftable output + its ingredients; where to FIND ingredients is for you to discover):");
  const ids = Object.keys(RECIPE).sort((a, b) => (affordable.has(a) ? 0 : 1) - (affordable.has(b) ? 0 : 1));
  for (const id of ids) {
    const r = RECIPE[id]!;
    const ing = r.inputs.map((i) => `${i.qty}× ${i.defId}`).join(" + ");
    console.log(`  ${affordable.has(id) ? "✓" : "·"} ${r.output.qty}× ${r.output.defId}  ←  ${ing}`);
  }
}

function printExpedition(st: GameState): void {
  const exp = st.expedition!;
  const grid = generateGrid(exp.mapSeed, rollBiome(exp.mapSeed));
  const seen = new Map(perceive(grid, exp.pos, exp.loadout.equipment.tools).map((p) => [`${p.x},${p.y}`, p]));
  const cleared = new Set(exp.cleared.map((c) => `${c.x},${c.y}`));
  console.log("\n=== MAP (▲ you · letters = node kinds · detail only resolves near you) ===");
  const rows: string[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    let row = "";
    for (let x = 0; x < GRID_SIZE; x++) {
      const k = `${x},${y}`;
      if (exp.pos.x === x && exp.pos.y === y) row += PLAYER_CHAR;
      else if (cleared.has(k)) row += "·";
      else if (seen.has(k)) row += POI_CHAR[seen.get(k)!.kind];
      else row += TERRAIN_CHAR[grid.terrain[y]![x]!];
    }
    rows.push(row);
  }
  console.log(rows.join("\n"));
  const nearby = [...seen.values()].filter((p) => p.detail && !cleared.has(`${p.x},${p.y}`));
  if (nearby.length) {
    console.log("\nWhat you can make out nearby:");
    for (const p of nearby) console.log(`  (${p.x},${p.y}) ${flavorDetail(p.detail, p.kind)}`);
  }
}
