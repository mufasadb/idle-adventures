// Town screens (zpm.3 two-step flow): the map overview (where to?) and the prep
// screen (loadout plan + embark), plus the bank and the recipe book.
import { localMap, mapEpithet, mapHintIds } from "../engine/town";
import { hintLabel, hintFamily } from "../engine/hints";
import { legalActions, whyNot } from "../sim/legal";
import { slotOf } from "../engine/catalog";
import { recipeOutputQty } from "../engine/craft";
import { carryCap } from "../engine/carry";
import { ARMOUR_SLOTS } from "../engine/pack";
import { heldFoodEnergy } from "../engine/food";
import { wieldsRanged, hasAmmo } from "../engine/combat";
import { RECIPE, MAX_ENERGY, TENT_FOOD_MULTIPLIER, INKS, QUIVER_AMMO_CAP, STUDY_COST } from "../data/constants";
import type { BiomeId } from "../data/constants";
import { weaponHint, logisticsEffect, enhancementHint, describe, recipeGateHint, name, heldMapTitle, townRecipeIds, rejectCopy } from "../render/render";
import type { GameState, Action, MapItem } from "../engine/types";
import { inventoryGrid } from "./inventory";
import { planActions } from "./persist";

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
// The local map is known country (D95): all its hints show, same chips as a held map.
const localHintIds = (local: ReturnType<typeof localMap>) => mapHintIds({ mapSeed: local.mapSeed, biomeId: local.biomeId, vintage: 0 });

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
const TRANSPORT_ROLE: Record<string, string> = {
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

export type TownTab = "main" | "bank" | "recipes";

export function townView(state: GameState, prep: string | null, hasLastPlan: boolean, tab: TownTab = "main"): string {
  const local = localMap(state.seed, state.runs ?? 0);
  const heldMaps = state.maps ?? [];
  // prep may point at a map that no longer exists (consumed/rotated) — fall back to overview.
  const inPrep = prep !== null && (prep === local.mapSeed || heldMaps.some((m) => m.mapSeed === prep));
  const header = `<header><h1>Town</h1><span class="muted">seed "${state.seed}"</span><button class="link" data-newgame>new game</button></header>`;
  // kml: on phones the three town panels are TABS (the recipe book alone is a long
  // scroll); on wide screens they sit side by side and the tab bar hides (CSS).
  const first = inPrep ? "Loadout" : "Maps";
  const tabBtn = (t: TownTab, label: string) => `<button class="tab${(inPrep && tab === "bank" ? "main" : tab) === t ? " on" : ""}" data-town-tab="${t}">${label}</button>`;
  // Packing moves items bank → loadout, so in prep the two share one tab (side by side).
  const shown: TownTab = inPrep && tab === "bank" ? "main" : tab;
  const nav = `<nav class="tabs town-tabs">${tabBtn("main", inPrep ? "Loadout & Bank" : first)}${inPrep ? "" : tabBtn("bank", "Bank")}${tabBtn("recipes", "Recipes")}</nav>`;
  return `${header}
    ${inPrep ? prepBar(state, prep!, local, heldMaps) : ""}
    ${nav}
    <div class="cols town show-${shown}">
      <div class="tsec${inPrep ? " duo" : ""}" data-tsec="main">${inPrep ? loadoutSection(state, hasLastPlan) + bankSection(state) : mapSelectSection(state, local, heldMaps)}</div>
      ${inPrep ? "" : `<div class="tsec" data-tsec="bank">${bankSection(state)}</div>`}
      <div class="tsec" data-tsec="recipes">${recipeSection(state)}</div>
    </div>`;
}

// STEP 1 (zpm.3): the town overview — pick where to go. The FREE local map reads
// as mundane/renewable; EARNED maps carry a tier badge and "spent on embark" so a
// player never burns a T3 thinking it's the freebie. Each card leads to Prepare.
function mapSelectSection(state: GameState, local: ReturnType<typeof localMap>, heldMaps: MapItem[]): string {
  const legal = legalActions(state);
  return `
    <section>
      <h2>Where to? <span class="muted small">pick a map — then prepare &amp; embark</span></h2>
      <div class="mapoffer">
        <div class="mapcard local">
          <span class="maptag free">FREE · always here</span>
          <b>${local.preview.headline}${epithetSuffix(local.mapSeed, local.biomeId)}</b>
          <div class="muted small">over the hill — a fresh T1 map every visit, never used up. Where food &amp; your first maps come from.</div>
          ${hintChips(localHintIds(local), 3)}
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

// STEP 2 (zpm.3): the prep banner — the chosen map pinned, the spend-vs-free call
// spelled out, the loadout warnings, and the FINAL commit button. The only place
// embark fires; its copy states the cost so the resource-spend is deliberate.
function prepBar(state: GameState, mapSeed: string, local: ReturnType<typeof localMap>, heldMaps: MapItem[]): string {
  const isLocal = mapSeed === local.mapSeed;
  const held = heldMaps.find((m) => m.mapSeed === mapSeed);
  const label = isLocal
    ? `${local.preview.headline}${epithetSuffix(local.mapSeed, local.biomeId)} <span class="maptag free">FREE · T1</span>`
    : `${name(held!.biomeId)} map${heldMapSuffix(held!)} <span class="maptag tier">T${held?.tier ?? 1}</span>`;
  const spendNote = isLocal
    ? `<span class="muted small">free local run — the map is not used up</span>`
    : `<span class="warn small">⚠ embarking SPENDS this map</span>`;
  const lo = state.loadout;
  const warns = `${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → you embark at full ${MAX_ENERGY} energy but nothing to eat mid-run — no way to refill stamina</div>` : ""}${wieldsRanged(lo) && !hasAmmo(lo) ? `<div class="warn">⚠ ${name(lo.equipment.weapon!)} packed with no ammo it can shoot → it will swing like a club (1 dmg). Pack its ammo to shoot.</div>` : ""}`;
  return `
  <div class="prepbar">
    <button class="link" data-back>← back to maps</button>
    <div class="prephead"><span class="muted small">Preparing</span> ${label} · ${spendNote}${
      isLocal ? hintChips(localHintIds(local), 3) : held && (held.studied ?? 0) > 0 ? hintChips(mapHintIds(held).slice(0, held.studied), held.studied!) : ""}</div>
    <button class="embark-final" data-embark="${mapSeed}">Embark ▶${isLocal ? "" : " — spends this map"}</button>
  </div>
  ${warns}`;
}

function loadoutSection(state: GameState, hasLastPlan: boolean): string {
  const lo = state.loadout;
  const eq = lo.equipment;
  const cap = carryCap(eq);
  const inv = inventoryGrid(lo, [], cap);
  const equipRow = (label: string, val: string | null) =>
    `<div class="row"><span class="k">${label}</span><span class="v">${val ?? "<span class='muted'>—</span>"}</span></div>`;
  return `
    <section>
      <h2>Loadout plan <button class="link" data-reset>reset</button>${hasLastPlan && planActions(lo).length === 0 ? ` <button class="link" data-repack title="re-pack the loadout you took last run (skips anything no longer in the bank)">↻ repack last</button>` : ""}</h2>
      ${equipRow("weapon", eq.weapon ? name(eq.weapon) : null)}
      ${equipRow("armour", ARMOUR_SLOTS.map((s) => eq[s]).filter(Boolean).map((d) => name(d as string)).join(", ") || null)}
      ${equipRow("transport", eq.transport ? `${name(eq.transport)}${TRANSPORT_ROLE[eq.transport] ? ` — ${TRANSPORT_ROLE[eq.transport]}` : ""}` : null)}
      ${eq.panniers ? equipRow("panniers", name(eq.panniers)) : ""}
      ${eq.quiver ? equipRow("quiver", `${name(eq.quiver)} — holds ${QUIVER_AMMO_CAP[eq.quiver] ?? 0} ammo off your back`) : ""}
      ${equipRow("backpack", eq.backpack ? name(eq.backpack) : "none")}
      ${equipRow("tools", eq.tools.map(name).join(", ") || null)}
      <div class="row"><span class="k">bag</span><span class="v">${inv.used}/${cap} slots</span></div>
      ${inv.html}
      <div class="muted small">worn gear (ghosted) is free · each food / potion / battle-item / tool takes one slot — bring several tools to work different node types · you embark at ${MAX_ENERGY} energy; packed food holds ≈ ${heldFoodEnergy(lo.food)} energy of refills to eat back as you travel${eq.tools.includes("tent") ? ` · tent — food restores +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%` : ""}</div>
    </section>`;
}

function bankSection(state: GameState): string {
  const legal = legalActions(state);
  return `
    <section>
      <h2>Bank</h2>
      <div class="bank">
        ${state.bank.map((s) => {
          const slot = slotOf(s.defId);
          const canPack = slot !== null && legal.some((a) => a.type === "pack" && a.slot === slot && a.itemId === s.defId);
          const canSpare = legal.some((a) => a.type === "pack" && a.slot === "spare" && a.itemId === s.defId);
          return `<div class="bankitem">
            <span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>
            ${canPack ? `<button data-pack="${s.defId}" data-slot="${slot}">pack</button>` : `<span class="muted small">${slot ?? "material"}</span>`}
            ${canSpare ? `<button data-pack="${s.defId}" data-slot="spare" title="a SPARE in the bag (1 slot) — don it mid-run to swap gear">+spare</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

function recipeSection(state: GameState): string {
  const legal = legalActions(state);
  const craftable = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
  return `
    <section>
      <h2>Recipe book <span class="muted small">one line per output · each ingredient path listed below it</span></h2>
      <div class="craftlist">
        ${(() => {
          const affordable = new Set(craftable.map((a) => a.recipeId));
          // group recipe ids by the defId they output, preserving catalog order
          const byOutput = new Map<string, string[]>();
          for (const id of townRecipeIds(state.stations ?? [])) {
            const out = RECIPE[id]!.output.defId;
            (byOutput.get(out) ?? byOutput.set(out, []).get(out)!).push(id);
          }
          // outputs with any affordable path first, else stable insertion order
          const outputs = [...byOutput.keys()].sort((a, b) => {
            const av = byOutput.get(a)!.some((id) => affordable.has(id)) ? 0 : 1;
            const bv = byOutput.get(b)!.some((id) => affordable.has(id)) ? 0 : 1;
            return av - bv;
          });
          // ke3.3: town tool pool (bank ∪ equipped) → outputScale recipes show
          // their REAL yield at your current knife tier, not the base qty.
          const townTools = [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools];
          return outputs.map((out) => {
            const ids = byOutput.get(out)!;
            const qty = recipeOutputQty(RECIPE[ids[0]!]!, townTools);
            const anyCan = ids.some((id) => affordable.has(id));
            const paths = ids.map((id) => {
              const r = RECIPE[id]!;
              const ing = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
              const can = affordable.has(id);
              // gate-legibility (playtest 2026-07-09 #1): a locked row named its
              // ingredients but not its STATION/TOOL gate — players only inferred
              // "I lack mats." If the reducer rejects on a hard gate, name it (ciq:
              // the reason comes from whyNot, never re-derived from the catalog).
              const why = can ? null : whyNot(state, { type: "craft", recipeId: id });
              const gate = why === "missing-station" || why === "missing-tool" ? recipeGateHint(id) : null;
              return `<div class="craftpath${can ? "" : " locked"}">← ${ing}${
                can ? ` <button data-craft="${id}">craft ✓</button>` : gate ? ` <span class="warn small">🔒 ${gate}</span>` : ""
              }</div>`;
            }).join("");
            const hint = weaponHint(out) ?? logisticsEffect(out) ?? enhancementHint(out); // 57l weapon hint; wzk range/carry; 7ao coating effect (disjoint sets)
            return `<div class="craftgroup${anyCan ? "" : " locked"}">
              <div class="craftname" title="${describe(out)}">${qty}× ${name(out)}${hint ? ` <span class="muted small">· ${hint}</span>` : ""}</div>
              ${paths}
            </div>`;
          }).join("");
        })()}
      </div>
    </section>`;
}
