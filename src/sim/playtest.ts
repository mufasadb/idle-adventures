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
import { localMap, mapEpithet } from "../engine/town";
import { expeditionGrid } from "../engine/grid";
import { recipeOutputQty } from "../engine/craft";
import { wornPieces } from "../engine/pack";
import { toolSpeedFor } from "../engine/tools";
import { perceive } from "../engine/perceive";
import {
  flavorDetail,
  matchupLessons,
  weaponHint,
  logisticsEffect,
  enhancementHint,
  recipeGateHint,
  nodeToolHint,
  affixMaterialHint,
  TERRAIN_CHAR,
  POI_CHAR,
  PLAYER_CHAR,
} from "../render/render";
import { RECIPE, MAP_WIDTH, MAP_HEIGHT, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, AFFIX_EFFECTS, TOOL_CAPABILITY, TOOL_PURPOSE, TENT_FOOD_MULTIPLIER } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import { moveCostBreakdown } from "../engine/move";
import { usedSlots, carryCap, mapCarryCap } from "../engine/carry";
import { costToReach } from "../engine/reach";
import { damageTaken, playerDamage, wieldsRanged } from "../engine/combat";
import type { Action, GameEvent, GameState } from "../engine/types";

// Optional `--reach` flag: an OPT-IN query that prints the gear-adjusted energy
// cost to reach each node (one Dijkstra covers the whole map) — run it only when
// weighing a long walk, so the default render stays cheap.
const rawArgs = process.argv.slice(2);
const reachFlag = rawArgs.includes("--reach");
const [seed, actionsArg] = rawArgs.filter((a) => a !== "--reach");
if (!seed) {
  console.error("usage: bun run playtest <seed> '[actions json]' [--reach]");
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
    case "ate": return `🍖 ate ${e.defId} · +${e.restored}e → ${e.energy}e`;
    case "auto-eat-set": return e.defId ? `🍴 auto-eat food set to ${e.defId}` : `🍴 auto-eat off`;
    case "fought": {
      const lessons = matchupLessons(e.matchup, null);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      const ff = e.rounds ? ` ⏩ (${e.rounds} rounds)` : ""; // 67e: auto-finish collapsed the fight
      return (e.victory
        ? `⚔ beat it${ff} · −${e.hpLost}hp · loot ${e.loot.map((l) => `${l.qty}× ${l.defId}`).join(", ") || "none"}`
        : `☠ you were downed${ff} · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ ${e.where === "field" ? "field-crafted 🔥 " : "crafted "}${e.output.qty}× ${e.output.defId}`;
    case "map-dropped": return e.carried
      ? `🗺️ looted a T${e.tier} ${e.biomeId} map (takes 1 carry slot — banks home with you)`
      : `🗺️ a T${e.tier} ${e.biomeId} map dropped — pack full, left behind`;
    case "map-discarded": return `🗺️ discarded a carried map`;
    case "packed": return `packed ${e.defId} → ${e.slot}`;
    case "quaffed": return `🧪 quaffed ${e.defId} · +${e.healed}hp → ${e.hp}hp${e.energy !== undefined ? ` · energy → ${e.energy}e` : ""}`;
    case "item-used": return `⚗ used ${e.defId} this fight${e.damageAdd ? ` · +${e.damageAdd} dmg` : ""}${e.mitigationAdd ? ` · +${e.mitigationAdd} mitigation` : ""}`;
    case "enhanced": return `🗡️ coated your weapon with ${e.id} · ${e.charges} charge${e.charges === 1 ? "" : "s"} (spent per strike; a new coating replaces this one)`;
    case "surveyed": return `🔭 surveyed the ${e.kind} at (${e.at.x},${e.at.y}) — its detail is now in focus`;
    case "inked": { const mat = affixMaterialHint(e.affix); return `🖋 inked — this map now favours ${mat ?? "its domain"} (of ${AFFIX_EFFECTS[e.affix]?.label ?? e.affix})`; }
    case "donned": return `🧤 donned ${e.defId}${e.displaced ? ` (stowed ${e.displaced} in the bag)` : ""} · energy → ${e.energy}e`;
    case "doffed": return `🎒 doffed ${e.defId} to the bag (takes a slot) · energy → ${e.energy}e`;
    case "auto-finish-toggled": return `auto-finish fights ${e.on ? "on" : "off"}`;
    case "provoked": return `⚔ the ${e.creature} strikes while you act · −${e.hit}hp → ${e.hp}hp`;
    case "run-ended": return e.flavor ? `${e.flavor}\n— run ended (${e.reason})` : `— run ended (${e.reason})`;
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
if (s.expedition) console.log(`energy: ${s.expedition.energy}/${s.expedition.maxEnergy} · auto-eat: ${s.expedition.autoEatFood ?? "off"}${state.expedition && toolSpeedFor(state.expedition.loadout.equipment.tools, "camp") !== null ? ` · tent (food +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%)` : ""} · hp: ${s.expedition.hp} · pos (${s.expedition.pos.x},${s.expedition.pos.y}) · nodes cleared: ${s.expedition.cleared} · auto-potion-in-fights: ${(state.expedition?.autoQuaff ?? true) ? "on" : "off"} · auto-finish-fights: ${(state.expedition?.autoFinish ?? false) ? "on" : "off"}`);
if (state.expedition) {
  // Carry + carried maps (8ec; zpm.2: maps live in a DEDICATED map-carry pool now,
  // not a loot slot — mapCarryCap over the owned bank).
  const cmaps = state.expedition.carriedMaps ?? [];
  console.log(`carry: ${state.expedition.carry.map((c) => `${c.qty}× ${c.defId}`).join(", ") || "(empty)"}${cmaps.length ? ` · carried maps (${cmaps.length}/${mapCarryCap(s.bank)} map-pocket, bank as held maps at run end): ${cmaps.map((m) => `T${m.tier ?? 1} ${m.biomeId} map — drop-map mapSeed="${m.mapSeed}" to free a map-pocket`).join("; ")}` : ""}`);
  // Bag occupancy (si7.4 parity): the web shows used/cap; the console must too —
  // new line, never reshape the carry line above (drivers parse it).
  console.log(`bag: ${usedSlots(state.expedition.loadout, state.expedition.carry)}/${carryCap(state.expedition.loadout.equipment)} slots used (each food/potion/battle-item/tool/spare-gear unit + each loot stack = 1 slot; carried maps use a separate map-pocket)`);
}
console.log(`bank: ${s.bank.map((i) => `${i.qty}× ${i.defId}`).join(", ") || "(empty)"}`);
// Show the ACTIVE loadout: on an expedition the equipped gear lives on
// expedition.loadout (state.loadout is the town plan, empty mid-run).
const active = state.expedition?.loadout ?? s.loadout;
const eq = active.equipment;
const worn = [...wornPieces(eq), ...eq.tools].filter(Boolean);
console.log(`equipped: ${worn.join(", ") || "(nothing)"} · food: ${active.food.map((f) => `${f.qty}× ${f.defId}`).join(", ") || "none"} · potions: ${active.potions.map((p) => `${p.qty}× ${p.defId}`).join(", ") || "none"}${active.battleItems?.length ? ` · battle: ${active.battleItems.map((b) => `${b.qty}× ${b.defId}`).join(", ")}` : ""}${active.spares?.length ? ` · spare gear (1 slot each, don mid-run to swap): ${active.spares.map((sp) => `${sp.qty}× ${sp.defId}`).join(", ")}` : ""}${active.ammo?.length ? ` · arrows: ${active.ammo.reduce((n, a) => n + a.qty, 0)} (a wielded bow shoots one per combat exchange; empty quiver = the bow swings like a club)` : wieldsRanged(active) ? " · arrows: 0 — ⚠ NO ARROWS: your bow swings like a CLUB (1 dmg). Craft arrows to shoot." : ""}${active.enhancements?.length ? ` · enhancements (1 slot each; enhance id="…" to coat your weapon — engaged or not; mid-fight it costs a turn, 67e): ${active.enhancements.map((en) => `${en.qty}× ${en.defId} (${enhancementHint(en.defId)})`).join(", ")}` : ""}${state.expedition?.weaponBuff ? ` · 🗡️ active coating: ${state.expedition.weaponBuff.id} (${state.expedition.weaponBuff.charges} strikes left)` : ""}`);
// Make transport/gating gear legible: what it does to a step's cost (mirrors the web).
{
  const notes: string[] = [];
  if (eq.transport) {
    const withT = moveCostBreakdown("plains", eq.transport, []).final;
    const onFoot = moveCostBreakdown("plains", null, []).final;
    if (withT !== onFoot) notes.push(`${eq.transport}: plains ${withT}e vs ${onFoot}e on foot`);
  }
  for (const gate of [["climbing-pick", "mountain"], ["raft", "river"], ["waders", "mud"], ["ice-cleats", "ice"]] as const) {
    if (!eq.tools.includes(gate[0])) continue;
    const bd = moveCostBreakdown(gate[1], null, eq.tools);
    const bare = moveCostBreakdown(gate[1], null, []).final;
    if (bd.enabled) notes.push(`${gate[0]}: ${gate[1]} ∞ → ${bd.final}e`);
    else if (bd.final !== bare) notes.push(`${gate[0]}: ${gate[1]} ${bare}e → ${bd.final}e`);
  }
  if (notes.length) console.log(`  gear effect: ${notes.join(" · ")}`);
}

if (s.phase === "town") printTown(state);
else printExpedition(state);

console.log("\n=== LEGAL ACTIONS (what you can do now) ===");
for (const a of legalActions(state)) console.log(JSON.stringify(a));

function printTown(st: GameState): void {
  console.log("\n=== TOWN ===");
  const local = localMap(st.seed, st.runs ?? 0);
  console.log("Local map (embark = free 'go nearby', never consumed; rotates each visit):");
  { const e = mapEpithet(local.mapSeed, local.biomeId); console.log(`  • ${local.preview.headline}${e ? ` of ${e}` : ""}  →  embark mapSeed="${local.mapSeed}"`); }
  // Held maps (zpm.1): earned from humanoid drops (zpm.2), survive across visits —
  // embark spends one. The local map is the free run instead (nothing to spend).
  const held = st.maps ?? [];
  console.log("\nYour maps (earned from drops — embarking one SPENDS it):");
  if (held.length === 0) console.log("  (none — kill a humanoid to loot a map)");
  for (const m of held) {
    // cxq affix labels (player-inked) take precedence over the q2k emergent epithet.
    const affixes = m.affixes ?? [];
    // egd: inked maps name the favoured material inline (console has no tooltips).
    const favours = affixes.map(affixMaterialHint).filter(Boolean);
    const nameSuffix = affixes.length
      ? ` of ${affixes.map((a) => AFFIX_EFFECTS[a]?.label ?? a).join(", ")}${favours.length ? ` (favours ${favours.join(", ")})` : ""}`
      : (() => { const e = mapEpithet(m.mapSeed, m.biomeId, m.tier ?? 1); return e ? ` of ${e}` : ""; })();
    const inkActions = legalActions(st).filter((a) => a.type === "ink" && a.mapSeed === m.mapSeed) as Extract<Action, { type: "ink" }>[];
    const inkHint = inkActions.length ? `  ·  ink: ${inkActions.map((a) => `ink mapSeed="${m.mapSeed}" inkId="${a.inkId}"`).join(" | ")}` : "";
    console.log(`  • T${m.tier ?? 1} ${m.biomeId} map${nameSuffix} · ${(st.runs ?? 0) - m.vintage} runs old  →  embark mapSeed="${m.mapSeed}" (spends it)${inkHint}`);
  }
  const affordable = new Set(
    legalActions(st).filter((a) => a.type === "craft").map((a) => (a as { recipeId: string }).recipeId),
  );
  console.log("\nRecipe book (every craftable output + its ingredients; where to FIND ingredients is for you to discover):");
  // ke3.4/ke3.2 parity with the web town craftlist: field-only recipes never
  // show in town (they surface in the field-craft list on expedition), and an
  // already-built station has no rebuild row.
  const built = new Set(st.stations ?? []);
  const ids = Object.keys(RECIPE)
    .filter((id) => !RECIPE[id]!.field && !(RECIPE[id]!.buildsStation && built.has(RECIPE[id]!.buildsStation!)))
    .sort((a, b) => (affordable.has(a) ? 0 : 1) - (affordable.has(b) ? 0 : 1));
  // ke3.3: outputScale recipes report their REAL yield at the current knife tier.
  const townTools = [...st.bank.map((s) => s.defId), ...st.loadout.equipment.tools];
  for (const id of ids) {
    const r = RECIPE[id]!;
    const ing = r.inputs.map((i) => `${i.qty}× ${i.defId}`).join(" + ");
    // 2g7.7: print the EXACT recipeId — several recipes share an output defId
    // (ration vs ration-sage …), and crafting the wrong id was a silent rake.
    // 57l: weapon rows get their class hint — the bow died 3/3 to invisibility.
    const hint = weaponHint(r.output.defId) ?? logisticsEffect(r.output.defId) ?? enhancementHint(r.output.defId); // wzk range/carry; 7ao coating effect
    // gate-legibility (playtest 2026-07-09 #1): a locked recipe with a STATION/TOOL
    // gate unmet names it — "[needs anvil + blacksmiths-hammer]" — so a blind player
    // stops inferring "I lack mats" for a hard gate (append-only).
    const req = r.requires;
    const gateUnmet = !affordable.has(id) && req && (
      (req.station && !built.has(req.station)) ||
      (req.tools?.some((t) => !townTools.includes(t)))
    );
    const gateNote = gateUnmet ? `  ·  [${recipeGateHint(id)}]` : "";
    console.log(`  ${affordable.has(id) ? "✓" : "·"} ${recipeOutputQty(r, townTools)}× ${r.output.defId}  ←  ${ing}  ·  craft recipeId="${id}"${hint ? `  ·  ${hint}` : ""}${gateNote}`);
  }
  console.log("\nTip: tools each take one bag slot — you can pack several (pick + axe + knife + …).");
}

function printExpedition(st: GameState): void {
  const exp = st.expedition!;
  const grid = expeditionGrid(exp);
  const seen = new Map(perceive(grid, exp.pos, exp.loadout.equipment.tools, exp.surveyed ?? []).map((p) => [`${p.x},${p.y}`, p]));
  const cleared = new Set(exp.cleared.map((c) => `${c.x},${c.y}`));
  if (exp.combat) {
    const c = exp.combat;
    const r1 = (n: number) => Math.round(n * 10) / 10; // c5l: % mitigation makes these floats — round for the console
    const dmgOut = r1(playerDamage(exp.loadout, c.creature, exp.weaponBuff) + c.damageAdd); // D60: reflects the coating
    const dmgIn = r1(damageTaken(exp.loadout, c.creature, c.mitigationAdd));
    // 57l: quiver state in the fight header — a clubbed bow must be legible mid-fight.
    const quiver = wieldsRanged(exp.loadout)
      ? (() => { const n = (exp.loadout.ammo ?? []).reduce((s, a) => s + a.qty, 0); return n > 0 ? ` · 🏹 ${n} arrows` : " · 🏹 NO ARROWS — bow is a club!"; })()
      : "";
    // 90j: held battle items are used MANUALLY mid-fight (no auto-consume) — surface them + the use action.
    const battle = (exp.loadout.battleItems ?? []).length
      ? ` · battle items: ${(exp.loadout.battleItems ?? []).map((b) => `${b.qty}× ${b.defId}`).join(", ")} (use-item itemId="…" — this fight only)`
      : "";
    // D60: active coating + held enhancements + the enhance action (usable mid-fight).
    const coating = exp.weaponBuff ? ` · 🗡️ coating: ${exp.weaponBuff.id} (${exp.weaponBuff.charges} strikes left)` : "";
    const poisonHdr = c.poison ? ` · ☠ poisoned (${r1(c.poison.dmg)}/rd, ${c.poison.rounds} left)` : "";
    const enh = (exp.loadout.enhancements ?? []).length
      ? ` · enhancements: ${(exp.loadout.enhancements ?? []).map((en) => `${en.qty}× ${en.defId} (${enhancementHint(en.defId)})`).join(", ")} (enhance id="…" — coat now; costs a turn, 67e)`
      : "";
    console.log(`\n=== ENGAGED: ${c.creature} — ${c.monsterHp} HP · you hit ${dmgOut}, it hits ${dmgIn}${quiver}${coating}${poisonHdr}${battle}${enh} · actions: fight | flee | quaff${battle ? " | use-item" : ""}${enh ? " | enhance" : ""} | toggle-auto-quaff | toggle-auto-finish | don/doff (costs a turn) ===`);
  }
  console.log("\n=== MAP (▲ you · letters = node kinds · detail only resolves near you) ===");
  const rows: string[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    let row = "";
    for (let x = 0; x < MAP_WIDTH; x++) {
      const k = `${x},${y}`;
      if (exp.pos.x === x && exp.pos.y === y) row += PLAYER_CHAR;
      else if (cleared.has(k)) row += "·";
      else if (seen.has(k)) row += POI_CHAR[seen.get(k)!.kind];
      else row += TERRAIN_CHAR[grid.terrain[y]![x]!];
    }
    rows.push(row);
  }
  console.log(rows.join("\n"));
  // ke3.4: field-craft candidates you can make right here (reduce-filtered).
  const fieldCrafts = legalActions(st).filter((a) => a.type === "craft") as Extract<Action, { type: "craft" }>[];
  const pool = [...exp.loadout.equipment.tools, ...exp.carry.map((s) => s.defId)];
  if (fieldCrafts.length) {
    console.log(`\nField craft (−${FIELD_CRAFT_ENERGY}e each):`);
    for (const a of fieldCrafts) {
      const r = RECIPE[a.recipeId]!;
      const ing = r.inputs.map((i) => `${i.qty}× ${i.defId}`).join(" + ");
      console.log(`  🔥 ${recipeOutputQty(r, pool)}× ${r.output.defId}  ←  ${ing}  ·  craft recipeId="${a.recipeId}"`);
    }
  }
  // gate-legibility (playtest 2026-07-09 #1, field-craft discoverability): 3/3
  // testers never found field crafting — a kit-tool (fire-kit/glassware) is an
  // unmarked key. If you carry ANY kit-tool but have no legal field craft right now,
  // say what the kit enables + what it still needs (append-only, mirrors the web).
  {
    const carriedKitTools = pool.filter((t) => TOOL_PURPOSE[TOOL_CAPABILITY[t] ?? ""]);
    if (carriedKitTools.length && !fieldCrafts.length) {
      const bits = carriedKitTools.map((t) => `${t} (${TOOL_PURPOSE[TOOL_CAPABILITY[t]!]})`);
      console.log(`\nField craft: your kit — ${bits.join(", ")} — but nothing craftable here yet (need the ingredients, a partner kit-tool, or the right terrain).`);
    }
  }
  const nearby = [...seen.values()].filter((p) => p.detail && !cleared.has(`${p.x},${p.y}`));
  if (nearby.length) {
    console.log("\nWhat you can make out nearby:");
    for (const p of nearby) {
      // si7.4 parity: the web telegraphs walk-in combat; tell the console player
      // too (suffix hint, mirroring tierHint — drivers parse these lines).
      // D78: name the unlocking tool family (any-of) rather than a tier number.
      // SHAPE CHANGE from the old " (needs a tier-N tool)" — blind-playtest drivers
      // that parse this line must match the new "(needs A or B)" text.
      const gate = p.kind !== "monster" ? p.detail!.gatedBy : null;
      const tierHint = gate && gate.length ? ` (needs ${gate.join(" or ")})` : "";
      // gate-legibility (playtest 2026-07-09 #1): name the tool(s) a gatherable node
      // needs when the player lacks them — the hunting node's requirement was never
      // spelled out (web agent burned ~4 runs guessing). D83: nodeToolHint is now
      // tool-aware and names whatever is MISSING (animal → trap AND knife). Append-only.
      const toolHintText = p.kind !== "monster" ? nodeToolHint(p.kind as GatherableNodeType, exp.loadout.equipment.tools) : null;
      const toolHint = toolHintText ? ` (${toolHintText})` : "";
      const fightHint = p.kind === "monster" ? ` (step onto it to fight — needs a free loot slot)` : "";
      // Shoot hint (D45, append-only): an adjacent monster you can ranged-engage
      // right now (bow wielded + arrows) — the legal-action JSON carries `fight at`.
      const shootHint = p.kind === "monster" && legalActions(st).some((a) => a.type === "fight" && a.at !== undefined && a.at.x === p.x && a.at.y === p.y)
        ? ` (adjacent — shoot it from here without stepping in: {"type":"fight","at":{"x":${p.x},"y":${p.y}}} — your opener lands before it can answer)`
        : "";
      console.log(`  (${p.x},${p.y}) ${flavorDetail(p.detail, p.kind)}${toolHint}${tierHint}${fightHint}${shootHint}`);
    }
  }
  console.log("\nTip: move steps ONE tile straight toward `to` — it does NOT route around walls; an impassable/no-step rejection means pick a different neighbouring tile yourself."); // 2g7.7: was learned by punishment
  if (reachFlag) {
    // Gear-adjusted energy to reach every node, plus the on-foot delta so the
    // routing benefit of your transport/tools is legible. One Dijkstra each.
    const withGear = costToReach(grid.terrain, exp.pos, exp.loadout.equipment.transport, exp.loadout.equipment.tools);
    const onFoot = costToReach(grid.terrain, exp.pos, null, []);
    console.log(`\n=== REACH (energy to walk to each node from ${exp.pos.x},${exp.pos.y}; you have ${exp.energy} energy) ===`);
    for (const poi of grid.pois) {
      if (cleared.has(`${poi.x},${poi.y}`)) continue;
      const c = withGear[poi.y]![poi.x]!;
      if (!Number.isFinite(c)) { console.log(`  (${poi.x},${poi.y}) ${poi.kind} — unreachable on foot (needs gear to cross)`); continue; }
      const foot = onFoot[poi.y]![poi.x]!;
      const delta = Number.isFinite(foot) && foot !== c ? ` (${c < foot ? "−" : "+"}${Math.abs(Math.round(foot - c))}e vs on foot)` : "";
      const afford = c > exp.energy ? " ⚠ more than you have" : "";
      const surveyHint = legalActions(st).some((a) => a.type === "survey" && a.at.x === poi.x && a.at.y === poi.y)
        ? ` · survey it from here (−${SURVEY_ENERGY}e, no walk): {"type":"survey","at":{"x":${poi.x},"y":${poi.y}}}`
        : "";
      console.log(`  (${poi.x},${poi.y}) ${poi.kind} — reach ${Math.round(c)}e${delta}${afford}${surveyHint}`);
    }
  } else {
    console.log("\nTip: append --reach to the command to see the gear-adjusted energy cost to reach each node before committing to a long walk.");
  }
}
