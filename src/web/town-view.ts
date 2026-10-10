// Town screens (zpm.3 two-step flow): the map overview (where to?) and the prep
// screen (d13: the packing sheet + embark), plus the bank and the recipe book.
import { localMap, mapEpithet, mapHintIds } from "../engine/town";
import { hintLabel, hintFamily } from "../engine/hints";
import { legalActions, whyNot } from "../sim/legal";
import { slotOf } from "../engine/catalog";
import { freeLootStacks, slotCap, energyCapOf } from "../engine/carry";
import { EQUIP_SLOTS } from "../engine/pack";
import type { EquipSlot } from "../engine/pack";
import { foodEnergyOf } from "../engine/food";
import { wieldsRanged, hasAmmo } from "../engine/combat";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER, INKS, QUIVER_AMMO_CAP, STUDY_COST, STACK_CAP, FLASK_STACK_CAP, ARROW_STACK_CAP } from "../data/constants";
import type { BiomeId } from "../data/constants";
import { logisticsEffect, describe, name, heldMapTitle, rejectCopy, carryBreakdown, bagRows, bagCells, POCKET_SLOTS, hintNeed, expectedHaul, toolGloss, battleItemEffect, tradeoff, GATHER_VERB } from "../render/render";
import type { GameState, Action, MapItem, Loadout } from "../engine/types";
import { planActions } from "./persist";
import { packedCounts } from "./feedback";
import { nodeIconId } from "./assets";
import { ic } from "./icons";
import { workshopSection, researchSection } from "./craft-tree";
import type { ResearchLogEntry } from "./craft-tree";
export { ic };

// Map hints (D95, Muse brief C option 1 — chips): one chip per hint, "G: boggy ground";
// a sealed hint shows only its family. `studied` = how many of `ids` are revealed.
const FAMILY_LETTER: Record<string, string> = { ground: "G", threat: "T", bounty: "B" };
function hintChips(ids: string[], studied: number): string {
  return `<div class="hintchips">${ids.map((id, i) => {
    const fam = hintFamily(id) ?? "";
    return i < studied
      ? `<span class="hintchip" title="${fam} hint">${FAMILY_LETTER[fam] ?? "?"}: ${hintLabel(id)}</span>`
      : `<span class="hintchip sealed" title="study the map to read this">[sealed ${fam}]</span>`;
  }).join("")}</div>`;
}

// The study control for a held map: the button (with its cost), a red unaffordable
// state, or "fully studied" once every hint is read.
function studyControl(state: GameState, m: MapItem): string {
  const total = mapHintIds(m).length, studied = m.studied ?? 0;
  if (studied >= total) return `<span class="studied-done">fully studied</span>`;
  const cost = STUDY_COST.map((c) => `${c.qty} ${name(c.defId)}`).join(" + ");
  const why = whyNot(state, { type: "study", mapSeed: m.mapSeed });
  return why
    ? `<button class="study unaffordable" disabled title="${rejectCopy(why)}">Study (${cost})</button>`
    : `<button class="study" data-study="${m.mapSeed}" title="reveal one more hint">Study (${cost})</button>`;
}

// Transport role hints (web copy only — mirrors TRANSPORT_MULTIPLIER intent).
export const TRANSPORT_ROLE: Record<string, string> = {
  horse: "faster on open ground",
  wagon: "faster on ice",
  mule: "slow but hauls",
};

// q2k: append a notability epithet to a map's name ("… of carbon"), or nothing.
function epithetSuffix(mapSeed: string, biomeId: BiomeId, tier = 1): string {
  const e = mapEpithet(mapSeed, biomeId, tier);
  return e ? ` <span class="muted">of ${e}</span>` : "";
}

// A held map's name suffix (affix labels or epithet — heldMapTitle); egd: a title
// tooltip names the favoured material(s) so an inked map's benefit is legible on
// the card, not just the moment it was inked.
function heldMapSuffix(m: MapItem): string {
  const { label, favours } = heldMapTitle(m);
  if (!label) return "";
  const tip = favours.length ? ` title="favours ${favours.map(name).join(", ")}"` : "";
  return ` <span class="muted"${tip}>of ${label}</span>`;
}

export type TownTab = "main" | "bank" | "recipes" | "research";
// d13: view-only state for the packing screen — which worn slot's swap menu is open.
export type PackUi = { wornOpen?: string | null; research?: { history: ResearchLogEntry[]; last: ResearchLogEntry | null } };

/** Whether `prep` still names a map you can embark on (the free local one or a held one). */
export function prepValid(state: GameState, prep: string | null): boolean {
  return prep !== null && (prep === localMap(state.seed, state.runs ?? 0).mapSeed || (state.maps ?? []).some((m) => m.mapSeed === prep));
}

export function townView(state: GameState, prep: string | null, hasLastPlan: boolean, tab: TownTab = "main", ui: PackUi = {}): string {
  const local = localMap(state.seed, state.runs ?? 0);
  const heldMaps = state.maps ?? [];
  // prep may point at a map that no longer exists (consumed/rotated) — fall back to overview.
  const inPrep = prep !== null && (prep === local.mapSeed || heldMaps.some((m) => m.mapSeed === prep));
  // d13: preparing a map is the full-screen packing sheet (its own Pack | Recipes tabs).
  if (inPrep) return packScreen(state, prep!, local, heldMaps, hasLastPlan, tab === "recipes" ? "recipes" : "main", ui);
  const header = `<header><h1>Town</h1><span class="muted">seed "${state.seed}"</span><button class="link" data-town-mode="scene" title="back to the village square">◱ the square</button><button class="link" data-newgame>new game</button></header>`;
  // kml: on phones the three town panels are TABS (the recipe book alone is a long
  // scroll); on wide screens they sit side by side and the tab bar hides (CSS).
  const tabBtn = (t: TownTab, label: string) => `<button class="tab${tab === t ? " on" : ""}" data-town-tab="${t}">${label}</button>`;
  const nav = `<nav class="tabs town-tabs">${tabBtn("main", "Maps")}${tabBtn("bank", "Bank")}${tabBtn("recipes", "Recipes")}${tabBtn("research", "Research")}</nav>`;
  return `${header}
    ${nav}
    <div class="cols town show-${tab}">
      <div class="tsec" data-tsec="main">${mapSelectSection(state, local, heldMaps)}</div>
      <div class="tsec" data-tsec="bank">${bankSection(state)}</div>
      <div class="tsec" data-tsec="recipes">${tab === "recipes" ? recipeSection(state) : `<section><h2>Crafting tree</h2><button data-town-tab="recipes">Open the crafting tree ▶</button></section>`}</div>
      <div class="tsec" data-tsec="research">${researchSection(state, ui.research?.history ?? [], ui.research?.last ?? null)}</div>
    </div>`;
}
// STEP 1 (zpm.3): the town overview — pick where to go. The FREE local map reads
// as mundane/renewable; EARNED maps carry a tier badge and "spent on embark" so a
// player never burns a T3 thinking it's the freebie. Each card leads to Prepare.
export function mapSelectSection(state: GameState, local: ReturnType<typeof localMap>, heldMaps: MapItem[]): string {
  const legal = legalActions(state);
  return `
    <section>
      <h2>Where to? <span class="muted small">pick a map — then prepare &amp; embark</span></h2>
      <div class="mapoffer">
        <div class="mapcard local">
          <span class="maptag free">FREE · always here</span>
          <b>${local.preview.headline}${epithetSuffix(local.mapSeed, local.biomeId)}</b>
          <div class="muted small">over the hill — a fresh T1 map every visit, never used up. Where food &amp; your first maps come from.</div>
          <div class="muted small">plain country — nothing remarkable. Hinted maps come from drops.</div>
          <button data-prepare="${local.mapSeed}">Prepare ▶</button>
        </div>
      </div>
      <h3 class="mapgroup">Your maps <span class="muted small">earned from humanoid drops · each spent on embark</span></h3>
      ${heldMaps.length ? `<div class="mapoffer">
        ${heldMaps.map((m) => `
          <div class="mapcard earned">
            <span class="maptag tier">T${m.tier ?? 1}</span>
            <b>${name(m.biomeId)} map${heldMapSuffix(m)}</b>
            <span class="muted small">${(state.runs ?? 0) - m.vintage} runs old</span>
            ${hintChips(mapHintIds(m), m.studied ?? 0)}
            <button data-prepare="${m.mapSeed}">Prepare ▶</button>
            ${studyControl(state, m)}
            ${Object.keys(INKS).filter((inkId) => legal.some((a) => a.type === "ink" && a.mapSeed === m.mapSeed && a.inkId === inkId)).map((inkId) => `<button data-ink-map="${m.mapSeed}" data-ink-id="${inkId}" title="apply ${name(inkId)} — rolls an affix from its domain onto this map">${name(inkId)}</button>`).join("")}
          </div>`).join("")}
      </div>` : `<div class="muted small">(none yet — kill a humanoid to loot a map)</div>`}
    </section>`;
}

// ===== d13: the packing screen (Muse-approved mock, packmock) =====================
// Built to TEACH the carry rules at a glance: a segmented bag gauge (capacity by
// source; packed units red, free slots green "loot ×5"), the destination's scout
// reports checked against the plan, the bag (one row per packed item, its slot
// cost, − to unpack) over a bank strip (tap to pack), the worn column (free — no
// slots), and a footer with energy + warnings + Embark. Every number is read off the
// engine (carryCap/freeLootStacks via render's carryBreakdown/bagRows/bagCells), and
// what's tappable off legalActions/whyNot — the web decides nothing.
type LocalMap = ReturnType<typeof localMap>;

function packScreen(state: GameState, mapSeed: string, local: LocalMap, heldMaps: MapItem[], hasLastPlan: boolean, tab: "main" | "recipes", ui: PackUi): string {
  const isLocal = mapSeed === local.mapSeed;
  const held = heldMaps.find((m) => m.mapSeed === mapSeed) ?? null;
  const tabBtn = (t: "main" | "recipes", label: string) => `<button class="tab${tab === t ? " on" : ""}" data-town-tab="${t}">${label}</button>`;
  const top = `<div class="pk-top">
      <button class="link" data-back>← town</button>
      <nav class="pk-tabs">${tabBtn("main", "Pack")}${tabBtn("recipes", "Recipes")}</nav>
      <span class="pk-dest muted small">${isLocal ? "free local run — the map is not used up" : `<span class="warn">⚠ embarking SPENDS this map</span>`}</span>
    </div>`;
  if (tab === "recipes") return `<div class="packscreen recipes">${top}<div class="pk-recipes">${recipeSection(state)}</div></div>`;
  const legal = legalActions(state);
  return `<div class="packscreen" data-loadout>
    ${top}
    ${bagGauge(state.loadout)}
    <div class="pk-book">
      ${mapPage(state, isLocal, local, held)}
      ${bagPage(state, legal)}
      ${wornColumn(state, legal, ui.wornOpen ?? null)}
    </div>
    ${packFooter(state, mapSeed, isLocal, held, hasLastPlan)}
  </div>`;
}

// 1. The segmented gauge: one group per capacity source, labelled so the parts add
// up to the bag's size (a backpack REPLACES the pockets; transport/panniers add on).
function bagGauge(lo: Loadout): string {
  const parts = carryBreakdown(lo.equipment);
  const cap = parts.reduce((n, p) => n + p.slots, 0); // === carryCap(lo.equipment)
  const cells = bagCells(lo);
  const free = freeLootStacks(lo);
  const size = cap > 18 ? "s" : cap > 14 ? "m" : "l"; // cell size class so a big late-game bag still fits one row
  let k = 0;
  const cell = () => {
    const c = cells[k++];
    if (!c) return `<div class="pk-cell free" title="free slot — holds a stack of ${STACK_CAP} loot">loot<br>×${STACK_CAP}</div>`;
    return `<div class="pk-cell full" data-def="${c.defId}" title="${name(c.defId)}${c.qty > 1 ? ` ×${c.qty}` : ""} — 1 slot">${ic(c.defId, 24)}${c.qty > 1 ? `<span class="tag">${c.qty}</span>` : ""}</div>`;
  };
  const groups = parts.map((p, i) => {
    const label = p.source === "pockets" ? `${p.slots} Pockets` : `${i ? "+" : ""}${p.slots} ${name(p.defId!)}`;
    const tip = p.source === "backpack" ? `${name(p.defId!)}: ${p.slots} slots — it replaces your ${POCKET_SLOTS} pockets`
      : p.source === "pockets" ? `no backpack: ${p.slots} pockets` : `${name(p.defId!)} adds ${p.slots} slots`;
    return `<div class="pk-grp"><div class="lab" title="${tip}">${label}</div><div class="cells">${Array.from({ length: p.slots }, cell).join("")}</div></div>`;
  }).join("");
  // Over capacity can only follow a carry-source removal the replay couldn't fully drop.
  const over = cells.length > cap ? `<div class="pk-grp"><div class="lab bad">over</div><div class="cells">${cells.slice(cap).map(() => cell()).join("")}</div></div>` : "";
  const sum = free > 0 ? `<span class="loot">${free} free</span>` : `<span class="bad">0 free</span>`;
  return `<div class="pk-gauge size-${size}">${groups}${over}<div class="pk-sum"><b>BAG ${cells.length}/${cap}</b><br>${sum}</div></div>${tradeLine(lo)}`;
}

// seyh.4: the one trade-off, under the gauge — the energy you carry as reach (tiles of
// open ground, or gathers) against the room it leaves for loot. Every number is
// render's tradeoff() off the engine; a pack/unpack flashes its delta beside it (fx).
function tradeLine(lo: Loadout): string {
  const t = tradeoff(lo), eq = lo.equipment;
  const tent = eq.tools.includes("tent") ? ` <span class="muted small">· tent: food +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}% at camp</span>` : "";
  const gather = GATHER_VERB[t.gatherKind]?.noun ?? "node";
  const room = t.lootRoom > 0 ? `<span class="loot">room for <b>${t.lootRoom}</b> loot</span>` : `<span class="bad">no room for loot</span>`;
  return `<div class="pk-trade" data-trade>
    <span class="en" title="you embark at full energy; packed food is eaten back as you travel">⚡ <b>${t.startEnergy}</b> + <b>${t.foodEnergy}</b> food${tent}</span>
    <span class="reach" title="on open ground with this gear; rough ground, rivers and diagonals cost more. A gather here = one ${gather}">→ reach ≈ <b>${t.tiles}</b> tiles of open ground or <b>${t.gathers}</b> gathers</span>
    <span class="sep">·</span> ${room}<span class="pk-delta" data-trade-delta aria-live="polite"></span>
  </div>`;
}

// 2. The map page: where you're going, its scout reports and whether the plan answers them.
const FAMILY_GLYPH: Record<string, string> = { ground: "⛰", threat: "⚔", bounty: "✦" };
function mapPage(state: GameState, isLocal: boolean, local: LocalMap, held: MapItem | null): string {
  const lo = state.loadout;
  const title = isLocal
    ? `${name(local.biomeId)} · T1${epithetSuffix(local.mapSeed, local.biomeId)}`
    : `${name(held!.biomeId)} · T${held!.tier ?? 1}${heldMapSuffix(held!)}`;
  let reports: string;
  if (isLocal || !held) {
    reports = `<div class="pk-hint plain"><span>plain country — no scout reports</span></div><div class="sub">the free local map: never used up. Hinted maps drop from humanoids.</div>`;
  } else {
    const ids = mapHintIds(held), studied = held.studied ?? 0;
    reports = ids.map((id, i) => {
      const fam = hintFamily(id) ?? "";
      if (i >= studied) return `<div class="pk-hint sealed"><span class="glyph">${FAMILY_GLYPH[fam] ?? "?"}</span><span>sealed ${fam} report</span><span class="need muted">study to read</span></div>`;
      const need = hintNeed(id, lo);
      const icon = need?.node ? ic(nodeIconId(need.node), 20) : need?.gear ? ic(need.gear, 20) : `<span class="glyph">${FAMILY_GLYPH[fam] ?? "?"}</span>`;
      const verdict = !need ? `<span class="muted">nothing to bring</span>`
        : need.ok ? `<span class="ok">${need.have} ✓</span>` : `<span class="miss">needs ${need.want}</span>`;
      return `<div class="pk-hint" title="${fam} report">${icon}<span>${hintLabel(id)}</span><span class="need">${verdict}</span></div>`;
    }).join("") + (studied < ids.length ? `<div class="pk-study">${studyControl(state, held)}</div>` : "");
  }
  const haul = expectedHaul(lo.equipment.tools);
  const onlyForage = haul.length === 1;
  return `<div class="pk-page pk-map">
    <h3>${title}</h3>
    <div class="sub">what the scouts say → what you'll need</div>
    ${reports}
    <div class="sub haul">Expected haul: <b>${haul.join(" · ")}</b>${onlyForage ? " — pack a pick, axe or trap + knife to bring more home" : ""}</div>
  </div>`;
}

// 3. The bag page: one row per packed item (slot cost + unpack), then the bank strip.
function bagPage(state: GameState, legal: Action[]): string {
  const lo = state.loadout;
  const rows = bagRows(lo);
  const spare = new Set((lo.spares ?? []).map((s) => s.defId));
  const rowHtml = rows.map((r) => {
    const gloss = r.packSlot === "tool" ? toolGloss(r.defId, lo.equipment.tools)
      : r.packSlot === "food" ? `+${foodEnergyOf(r.defId)} energy each`
      : battleItemEffect(r.defId);
    const cost = r.slots === 0 ? "in quiver" : `${r.slots} slot${r.slots === 1 ? "" : "s"}${r.perSlot > 1 ? ` (${r.perSlot}/slot)` : ""}${r.quivered ? " + quiver" : ""}`;
    return `<div class="pk-row" data-def="${r.defId}" title="${describe(r.defId)}">${ic(r.defId, 20)}<span class="nm">${name(r.defId)}${r.packSlot === "spare" && spare.has(r.defId) ? ` <span class="q">spare</span>` : ""}</span>${r.qty > 1 ? `<span class="q">×${r.qty}</span>` : ""}${gloss ? `<span class="gives">→ ${gloss}</span>` : ""}<span class="sl">${cost}</span><button class="pk-btn" data-unpack="${r.defId}" data-unpack-slot="${r.packSlot}" title="unpack one" aria-label="unpack one ${name(r.defId)}">−</button></div>`;
  }).join("");
  const empty = rows.length ? "" : `<div class="pk-empty">Nothing packed yet. Tap the bank below — every tool, food and potion takes one slot; worn gear is free.</div>`;
  return `<div class="pk-page pk-bag">
    <h3>In the bag <span class="sub-inline">· one slot per item (flasks ${FLASK_STACK_CAP}, arrows ${ARROW_STACK_CAP})</span></h3>
    <div class="pk-rows">${rowHtml}${empty}</div>
    ${bankStrip(state, legal)}
  </div>`;
}

const EQUIP: readonly string[] = EQUIP_SLOTS;
function bankStrip(state: GameState, legal: Action[]): string {
  const packed = packedCounts(state.loadout);
  const eq = state.loadout.equipment;
  const packables: string[] = [], mats: string[] = [];
  for (const s of state.bank) {
    const left = s.qty - (packed.get(s.defId) ?? 0); // D28: the bank is debited at embark — show what's left to pack
    if (left <= 0) continue;
    const slot = slotOf(s.defId);
    if (slot === null) {
      mats.push(`<span class="pk-chip mat" title="${name(s.defId)} — a material: crafting stock, not packable">${ic(s.defId, 18)}${name(s.defId)} ${left}</span>`);
      continue;
    }
    const ok = legal.some((a) => a.type === "pack" && a.slot === slot && a.itemId === s.defId);
    const why = ok ? null : whyNot(state, { type: "pack", slot, itemId: s.defId });
    const worn = EQUIP.includes(slot);
    const tip = ok ? (worn ? `wear it (${slot}) — worn gear takes no slot` : "pack one — takes a bag slot") : `can't pack: ${why ? rejectCopy(why, undefined, "pack") : "not now"}`;
    // 82r: a spare goes IN the bag (1 slot) to swap mid-run — offered once that worn slot is filled.
    const canSpare = worn && eq[slot as EquipSlot] && legal.some((a) => a.type === "pack" && a.slot === "spare" && a.itemId === s.defId);
    packables.push(`<span class="pk-chipwrap"><button class="pk-chip${ok ? "" : " nofit"}${worn ? " wear" : ""}" data-bank="${s.defId}" data-pack="${s.defId}" data-slot="${slot}" title="${tip}">${ic(s.defId, 18)}${name(s.defId)} ${left}</button>${canSpare ? `<button class="pk-spare" data-pack="${s.defId}" data-slot="spare" title="pack a SPARE ${name(s.defId)} in the bag (1 slot) — don it mid-run">+spare</button>` : ""}</span>`);
  }
  return `<div class="pk-bank"><div class="lab">Bank · tap to pack · hold for details</div><div class="chips">${packables.join("")}${mats.join("")}${packables.length + mats.length ? "" : `<span class="muted small">(empty)</span>`}</div></div>`;
}

// 4. Worn: free, no slots. Tap a worn row for its swap menu (other bank pieces for
// that slot + take off); carry sources show what they add.
const WORN_ROWS: { slot: EquipSlot; empty: string }[] = [
  { slot: "weapon", empty: "no weapon" }, { slot: "helmet", empty: "helm" }, { slot: "chest", empty: "chest" },
  { slot: "legs", empty: "legs" }, { slot: "boots", empty: "boots" }, { slot: "gloves", empty: "gloves" },
  { slot: "transport", empty: "no mount" }, { slot: "backpack", empty: "no backpack" },
  { slot: "quiver", empty: "no quiver" }, { slot: "panniers", empty: "no panniers" },
];
function wornColumn(state: GameState, legal: Action[], open: string | null): string {
  const lo = state.loadout, eq = lo.equipment;
  const parts = carryBreakdown(eq);
  const alts = (slot: EquipSlot) => legal.filter((a): a is Extract<Action, { type: "pack" }> => a.type === "pack" && a.slot === slot && a.itemId !== eq[slot]);
  const rows = WORN_ROWS.map(({ slot, empty }) => {
    const id = eq[slot] ?? null;
    const options = alts(slot);
    // quiver/panniers only matter once you own one
    if (!id && options.length === 0 && (slot === "quiver" || slot === "panniers")) return "";
    let extra = "";
    if (slot === "transport" && id) extra = (parts.find((p) => p.source === "transport")?.slots ?? 0) ? `+${parts.find((p) => p.source === "transport")!.slots}` : "";
    if (slot === "backpack") extra = id ? `${slotCap(id)} slots` : `${POCKET_SLOTS} pockets`;
    if (slot === "panniers" && id) { const n = parts.find((p) => p.source === "panniers")?.slots ?? 0; extra = n ? `+${n}` : "needs a beast"; }
    if (slot === "quiver" && id) extra = `${QUIVER_AMMO_CAP[id] ?? 0} arrows`;
    const bad = (slot === "weapon" && wieldsRanged(lo) && !hasAmmo(lo)) || (slot === "panniers" && extra === "needs a beast");
    if (slot === "weapon" && bad) extra = "no ammo";
    const tip = id ? `${name(id)} — worn, no slot${slot === "transport" && TRANSPORT_ROLE[id] ? ` · ${TRANSPORT_ROLE[id]}` : ""}${slot === "backpack" ? ` · ${slotCap(id)} slots, replaces your ${POCKET_SLOTS} pockets` : ""} · tap to swap or take off`
      : options.length ? `tap to wear one` : `${empty} — none in the bank`;
    const clickable = !!id || options.length > 0;
    const isOpen = open === slot && clickable;
    const label = id ? name(id) : empty;
    const menu = isOpen ? `<div class="pk-wmenu">${options.map((a) => `<button class="pk-chip wear" data-pack="${a.itemId}" data-slot="${slot}" title="wear ${name(a.itemId)} instead">${ic(a.itemId, 18)}${name(a.itemId)}</button>`).join("")}${id ? `<button class="pk-chip off" data-unpack="${id}" data-unpack-slot="${slot}" title="take it off (back to the bank)">take off</button>` : ""}</div>` : "";
    const inner = `${id ? ic(id, 22) : `<span class="pk-ic none" style="width:22px;height:22px">·</span>`}<span class="wl">${label}</span>${extra ? `<span class="x${bad ? " bad" : ""}">${extra}</span>` : ""}`;
    return clickable
      ? `<div class="pk-wslot${isOpen ? " open" : ""}"><button class="pk-wi${id ? "" : " empty"}" data-worn-open="${slot}"${id ? ` data-def="${id}"` : ""} title="${tip}">${inner}</button>${menu}</div>`
      : `<div class="pk-wslot"><div class="pk-wi empty" title="${tip}">${inner}</div></div>`;
  }).join("");
  return `<div class="pk-worn"><h4>Worn</h4><div class="free">free · no slots</div>${rows}</div>`;
}

// 5. Footer: the warnings (the energy figure moved up beside the gauge, seyh.4), Repack / Reset / Embark.
function packFooter(state: GameState, mapSeed: string, isLocal: boolean, held: MapItem | null, hasLastPlan: boolean): string {
  const lo = state.loadout, eq = lo.equipment;
  const startEnergy = MAX_ENERGY + energyCapOf(eq);
  const warns: { short: string; full: string }[] = [];
  if (lo.food.length === 0) warns.push({ short: "no food", full: `no food packed → you embark at ${startEnergy} energy with nothing to eat mid-run — no way to refill stamina` });
  if (wieldsRanged(lo) && !hasAmmo(lo)) warns.push({ short: `${name(eq.weapon!)}, no ammo`, full: `${name(eq.weapon!)} packed with no ammo it can shoot → it will swing like a club. Pack its ammo to shoot.` });
  if (freeLootStacks(lo) <= 0) warns.push({ short: "bag full before you start", full: "every slot is taken before you leave — nothing you gather or loot will fit" });
  if (held && !isLocal) {
    const unmet = mapHintIds(held).slice(0, held.studied ?? 0).map((id) => ({ id, need: hintNeed(id, lo) })).filter((h) => h.need && !h.need.ok);
    for (const h of unmet) warns.push({ short: `map wants ${h.need!.want}`, full: `scouts say "${hintLabel(h.id)}" — you've packed no ${h.need!.want}` });
  }
  const repack = hasLastPlan && planActions(lo).length === 0
    ? `<button class="pk-ghost" data-repack title="re-pack the loadout you took last run (skips anything no longer in the bank)">↻ Repack last</button>` : "";
  return `<div class="pk-foot">
    <span class="warns">${warns.map((w) => `<span class="warn" title="${w.full}">⚠ ${w.short}</span>`).join("")}</span>
    ${repack}<button class="pk-ghost" data-reset title="clear the whole plan">Reset</button>
    <button class="embark-final" data-embark="${mapSeed}">Embark ▶${isLocal ? "" : `<small> spends map</small>`}</button>
  </div>`;
}

export function bankSection(state: GameState): string {
  const legal = legalActions(state);
  // beh: the bank is untouched until embark (D28), so a packed pick still shows ×1 here —
  // say so on the row ("✓ packed") instead of just swapping the button for a slot word.
  const packed = packedCounts(state.loadout);
  return `
    <section>
      <h2>Bank</h2>
      <div class="bank">
        ${state.bank.map((s) => {
          const slot = slotOf(s.defId);
          const canPack = slot !== null && legal.some((a) => a.type === "pack" && a.slot === slot && a.itemId === s.defId);
          const canSpare = legal.some((a) => a.type === "pack" && a.slot === "spare" && a.itemId === s.defId);
          const n = packed.get(s.defId) ?? 0;
          const badge = n ? `<span class="packed-badge" title="in your loadout plan — taken out of the bank when you embark">✓ ${n >= s.qty ? "packed" : `${n} packed`}</span>` : "";
          return `<div class="bankitem${n ? " packed" : ""}" data-bank="${s.defId}">
            <span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>
            ${badge}
            ${canPack ? `<button data-pack="${s.defId}" data-slot="${slot}">${n ? "pack +1" : "pack"}</button>` : n ? "" : `<span class="muted small">${slot ?? "material"}</span>`}
            ${canSpare ? `<button data-pack="${s.defId}" data-slot="spare" title="a SPARE in the bag (1 slot) — don it mid-run to swap gear">+spare</button>` : ""}
            ${n ? `<button class="link unpack" data-unpack="${s.defId}" title="take one back out of the loadout plan">unpack</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

// 675/o9vr: the recipe book is the crafting tree (craft-tree.ts) — fogged, a full-screen workshop.
export function recipeSection(state: GameState): string {
  return workshopSection(state);
}

// 0m4: the stable — your animals and carts (owned transport + panniers), and whether
// each is in this trip's plan. Packing goes through the same `pack` action as the sheet.
export function stableSection(state: GameState): string {
  const legal = legalActions(state);
  const eq = state.loadout.equipment;
  const rows = state.bank.filter((s) => { const sl = slotOf(s.defId); return sl === "transport" || sl === "panniers"; }).map((s) => {
    const slot = slotOf(s.defId) as "transport" | "panniers";
    const taking = eq[slot] === s.defId;
    const can = !taking && legal.some((a) => a.type === "pack" && a.slot === slot && a.itemId === s.defId);
    const role = TRANSPORT_ROLE[s.defId] ?? logisticsEffect(s.defId) ?? "";
    return `<div class="bankitem${taking ? " packed" : ""}" data-bank="${s.defId}">${ic(s.defId, 22)}
      <span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>${role ? ` <span class="muted small">${role}</span>` : ""}
      ${taking ? `<span class="packed-badge">✓ coming along</span>` : can ? `<button data-pack="${s.defId}" data-slot="${slot}">take it</button>` : ""}
    </div>`;
  }).join("");
  return `<section>
    <h2>Stable</h2>
    <div class="muted small">Animals and carts carry more and travel faster — a beast can also wear panniers. Taking one costs no bag slot.</div>
    <div class="bank">${rows || `<span class="muted small">(no animals or carts yet)</span>`}</div>
  </section>`;
}

export { researchSection };
