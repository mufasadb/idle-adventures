// seyh.28 / seyh.8 (D106): choosing where to go is a cartographer's chart of the land
// around town, in tier rings. The town gate sits in the middle; the inner ring is the
// near country you just walk out to (only this trip's land is lit, the D80 rotation),
// and each held map is a scrap of its own land's colour in that land's FIXED wedge
// (REGION_BEARING) on its tier's ring. Charts in hand are listed in the side panel;
// picking one lights its scrap and draws the road. The lit near land is pre-selected,
// so the free walk-out costs no extra tap.
//
// View-only: the geometry is pure (render.ts regionWedge/regionSpots/ringBand), every
// action button (Pack for the road ▶ → data-prepare, study, ink) is wired by main.ts and
// still goes through reduce; what's offered comes off legalActions/whyNot.
import type { GameState, MapItem } from "../engine/types";
import type { BiomeId } from "../data/constants";
import { INKS } from "../data/constants";
import { localMap, mapHintIds } from "../engine/town";
import { rand } from "../engine/rng";
import { legalActions } from "../sim/legal";
import { name, regionRings, ringBand, landsAt, regionWedge, regionSpots, chartPoint, ringWord, backInTrips, backInCopy, REGION_GEOM } from "../render/render";
import type { RegionSpot } from "../render/render";
import { tileFrameRef } from "./assets";
import { TOWN_ART } from "./assets";
import { hintChips, studyControl, heldMapSuffix, epithetSuffix } from "./town-view";

// --- view state ------------------------------------------------------------------
// null = the default: the chosen held map (prep) if there is one, else the lit near land.
type Sel = { kind: "local" } | { kind: "map"; mapSeed: string } | { kind: "land"; biome: BiomeId };
export const region: { sel: Sel | null } = { sel: null };

// --- art -------------------------------------------------------------------------
// Each land's tile: the near ring's patch, and the scrap every held map of it wears
// (D106: scraps carry their land's colour; position, not texture, says which place).
const BASE_TILE: Record<BiomeId, string> = {
  woodland: "plains", desert: "desert:plains", tundra: "tundra:plains", swamp: "swamp:mud",
  coastal: "lake", jungle: "jungle:plains", fungal: "fungal:plains",
};
/** A held map's scrap tile: its own land's, by the frozen biomeId (D93). */
export function mapTile(m: MapItem): string {
  return BASE_TILE[m.biomeId];
}
const patId = (key: string) => `rg-t-${key.replace(/[^a-z0-9]/gi, "_")}`;
const TILE = 16; // chart units per repeated tile

function patternDefs(keys: Iterable<string>): string {
  let out = "";
  for (const key of new Set(keys)) {
    const f = tileFrameRef(key);
    if (!f) continue;
    const s = TILE / f.w;
    out += `<pattern id="${patId(key)}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}"><image href="${f.url}" x="${-f.x * s}" y="${-f.y * s}" width="${f.aw * s}" height="${f.ah * s}" preserveAspectRatio="none"/></pattern>`;
  }
  return out;
}
function thumbStyle(key: string, px = 26): string {
  const f = tileFrameRef(key);
  if (!f) return "";
  const s = px / f.w;
  return `background-image:url('${f.url}');background-size:${f.aw * s}px ${f.ah * s}px;background-position:${-f.x * s}px ${-f.y * s}px`;
}

// --- geometry → SVG ----------------------------------------------------------------
const n2 = (v: number) => v.toFixed(2);
function wedgePath(r0: number, r1: number, a0: number, a1: number): string {
  const p0 = chartPoint(r1, a0), p1 = chartPoint(r1, a1), p2 = chartPoint(r0, a1), p3 = chartPoint(r0, a0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${n2(p0.x)},${n2(p0.y)} A${r1},${r1} 0 ${big} 1 ${n2(p1.x)},${n2(p1.y)} L${n2(p2.x)},${n2(p2.y)} A${r0},${r0} 0 ${big} 0 ${n2(p3.x)},${n2(p3.y)} Z`;
}
function scrapPoints(spot: RegionSpot): string {
  const pts: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 360 + rand(spot.mapSeed, "region-scrap-a", i) * 20;
    const r = spot.size * (0.8 + rand(spot.mapSeed, "region-scrap-r", i) * 0.35);
    const p = chartPoint(r, a);
    pts.push(`${n2(spot.x + p.x)},${n2(spot.y + p.y)}`);
  }
  return pts.join(" ");
}
/** The road out of the gate to (x,y): starts at the town's edge, bends a little. */
function roadPath(to: { x: number; y: number }, stopShort: number): string {
  const d = Math.hypot(to.x, to.y) || 1;
  const ux = to.x / d, uy = to.y / d;
  const s = { x: ux * REGION_GEOM.town, y: uy * REGION_GEOM.town };
  const e = { x: to.x - ux * stopShort, y: to.y - uy * stopShort };
  const c = { x: (s.x + e.x) / 2 + uy * d * 0.12, y: (s.y + e.y) / 2 - ux * d * 0.12 };
  return `M${n2(s.x)},${n2(s.y)} Q${n2(c.x)},${n2(c.y)} ${n2(e.x)},${n2(e.y)}`;
}

/** The effective selection: an explicit pick that still exists, else the chosen held
 *  map (prep), else the lit near land (pre-selected: walking out adds no tap). */
export function regionSelection(state: GameState, prep: string | null): Sel {
  const maps = state.maps ?? [];
  const s = region.sel;
  if (s?.kind === "map" && maps.some((m) => m.mapSeed === s.mapSeed)) return s;
  if (s?.kind === "land" && s.biome !== localMap(state.seed, state.runs ?? 0).biomeId) return s;
  if (s?.kind === "local") return s;
  if (prep && maps.some((m) => m.mapSeed === prep)) return { kind: "map", mapSeed: prep };
  return { kind: "local" };
}

function chartSvg(state: GameState, sel: Sel): string {
  const maps = state.maps ?? [];
  const local = localMap(state.seed, state.runs ?? 0);
  const rings = regionRings(maps);
  const spots = regionSpots(maps);
  const byId = new Map(maps.map((m) => [m.mapSeed, m]));
  const tiles = [...landsAt(1).map((b) => BASE_TILE[b]), ...maps.map(mapTile)];
  let g = "";
  // the rings, outermost first: unknown country is hatched parchment cut into each
  // land's wedge; the near ring is the land itself, only this trip's lit.
  for (let tier = rings; tier >= 1; tier--) {
    const [r0, r1] = ringBand(tier, rings);
    for (const b of landsAt(tier)) {
      const w = regionWedge(b, tier)!;
      const d = wedgePath(r0, r1, w.a0, w.a1);
      if (tier === 1) {
        const lit = b === local.biomeId;
        const on = lit ? sel.kind === "local" : sel.kind === "land" && sel.biome === b;
        g += `<path class="rg-land${lit ? " lit" : " unlit"}${on ? " on" : ""}" d="${d}" fill="url(#${patId(BASE_TILE[b])})" data-region-land="${b}"><title>${name(b)}${lit ? ", just past the gate" : ""}</title></path>`;
      } else {
        g += `<path class="rg-far" d="${d}"/>`;
      }
    }
    g += `<circle class="rg-ring${tier === 1 ? " near" : ""}" r="${r1}"/>`;
    // the ring's name, written along the inside of its edge at the top right (clear of
    // the scraps, which sit mid-ring, and of the wedge lines, which fall on multiples of 15°)
    const p = chartPoint(r1 - 2.4, 40);
    g += `<text class="rg-ringword${tier === 1 ? " near" : ""}" x="${n2(p.x)}" y="${n2(p.y)}" transform="rotate(40 ${n2(p.x)} ${n2(p.y)})" dy="1.4">${ringWord(tier)}</text>`;
  }
  // the road: out of the gate to the chosen place, over the near ring
  const target = sel.kind === "local" ? { x: chartPoint((REGION_GEOM.town + REGION_GEOM.near) / 2 + 3, regionWedge(local.biomeId, 1)!.mid), stop: 0 }
    : sel.kind === "map" ? (() => { const sp = spots.find((s) => s.mapSeed === sel.mapSeed); return sp ? { x: { x: sp.x, y: sp.y }, stop: sp.size + 1.5 } : null; })()
    : null;
  if (target) {
    const d = roadPath(target.x, target.stop);
    g += `<path class="rg-road-case" d="${d}"/><path class="rg-road" d="${d}"/>`;
  }
  // the charts in hand: a scrap of the land's own colour, a gold seal; the chosen one lifted with a gold ring
  for (const sp of spots) {
    const m = byId.get(sp.mapSeed)!;
    const on = sel.kind === "map" && sel.mapSeed === sp.mapSeed;
    g += `<g class="rg-scrap${on ? " on" : ""}" data-region-map="${sp.mapSeed}"><title>${name(m.biomeId)}, ${ringWord(sp.tier)}</title>`
      + `<polygon points="${scrapPoints(sp)}" fill="url(#${patId(mapTile(m))})"/>`
      + (on ? `<circle class="rg-sel" cx="${n2(sp.x)}" cy="${n2(sp.y)}" r="${n2(sp.size + 3)}"/>` : "")
      + `<circle class="rg-seal" cx="${n2(sp.x + sp.size * 0.7)}" cy="${n2(sp.y - sp.size * 0.7)}" r="${n2(Math.max(1.3, sp.size * 0.24))}"/></g>`;
  }
  // the town, and a compass rose
  const t = REGION_GEOM.town - 1;
  g += `<g class="rg-town"><circle r="${REGION_GEOM.town}" class="rg-townbg"/><image href="${TOWN_ART["gate-open"]}" x="${-t}" y="${-t - 1}" width="${t * 2}" height="${t * 2}" clip-path="url(#rg-townclip)" preserveAspectRatio="xMidYMid slice"/><circle r="${REGION_GEOM.town}" class="rg-townrim"/></g>`;
  g += `<g class="rg-compass" transform="translate(86,-86)"><path d="M0,-7 L1.6,0 L0,7 L-1.6,0 Z" class="ns"/><path d="M-7,0 L0,1.3 L7,0 L0,-1.3 Z" class="ew"/><text y="-8.5" text-anchor="middle">N</text></g>`;
  return `<svg class="rg-svg" viewBox="-100 -100 200 200" role="img" aria-label="the land around town">
    <defs>${patternDefs(tiles)}
      <pattern id="rg-hatch" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="3" stroke="#5a4326" stroke-width="0.35" opacity="0.35"/></pattern>
      <filter id="rg-dim"><feColorMatrix type="saturate" values="0.3"/><feComponentTransfer><feFuncR type="linear" slope="0.9" intercept="0.08"/><feFuncG type="linear" slope="0.88" intercept="0.07"/><feFuncB type="linear" slope="0.8" intercept="0.04"/></feComponentTransfer></filter>
      <filter id="rg-litwash" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.6" result="w"/><feColorMatrix in="w" type="saturate" values="1.25"/><feComponentTransfer><feFuncR type="linear" slope="1.55"/><feFuncG type="linear" slope="1.55"/><feFuncB type="linear" slope="1.45"/></feComponentTransfer></filter>
      <filter id="rg-lift"><feColorMatrix type="saturate" values="0.95"/><feComponentTransfer><feFuncR type="linear" slope="1.4"/><feFuncG type="linear" slope="1.4"/><feFuncB type="linear" slope="1.3"/></feComponentTransfer></filter>
      <filter id="rg-lift-on"><feColorMatrix type="saturate" values="1.3"/><feComponentTransfer><feFuncR type="linear" slope="1.75"/><feFuncG type="linear" slope="1.75"/><feFuncB type="linear" slope="1.6"/></feComponentTransfer></filter>
      <clipPath id="rg-townclip"><circle r="${REGION_GEOM.town - 1}"/></clipPath>
    </defs>${g}</svg>`;
}

// --- the side panel: charts in hand ------------------------------------------------
const ROMAN = ["", "I", "II", "III", "IV", "V"];
function panelHtml(state: GameState, sel: Sel): string {
  const maps = state.maps ?? [];
  const byTier = new Map<number, MapItem[]>();
  for (const m of maps) byTier.set(m.tier ?? 1, [...(byTier.get(m.tier ?? 1) ?? []), m]);
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const rows = tiers.map((t) => `<div class="rg-tierhead"><span>${ringWord(t)}</span><span class="rule"></span></div>${byTier.get(t)!.map((m) => {
    const on = sel.kind === "map" && sel.mapSeed === m.mapSeed;
    const total = mapHintIds(m).length, read = Math.min(m.studied ?? 0, total);
    return `<button class="rg-row${on ? " on" : ""}" data-region-map="${m.mapSeed}"><span class="thumb" style="${thumbStyle(mapTile(m))}"></span><span class="nm">${name(m.biomeId)}${heldMapSuffix(m)}</span><span class="dots" title="${read} of ${total} scout reports read">${"●".repeat(read)}${"○".repeat(total - read)}</span></button>`;
  }).join("")}`).join("");
  return `<aside class="rg-panel"><h2>Charts in hand</h2>${rows || `<p class="rg-empty">No charts in hand yet. Some who roam out there carry them.</p>`}</aside>`;
}

// --- the card for the selection ------------------------------------------------------
// seyh.31 (owner: "not clear you're about to pack before you go"): choosing a destination
// walks you to the packing cloth, not out of the gate — the button says so.
const GO_BUTTON = (mapSeed: string) =>
  `<button class="rg-go" data-prepare="${mapSeed}" title="lay out your kit on the packing cloth by the gate — you set off from there">Pack for the road ▶</button>`;
function cardHtml(state: GameState, sel: Sel): string {
  const local = localMap(state.seed, state.runs ?? 0);
  if (sel.kind === "local") {
    return `<div class="rg-card local"><div><h3>${name(local.biomeId)}${epithetSuffix(local.mapSeed, local.biomeId)}</h3><div class="sub">just past the gate</div></div>${GO_BUTTON(local.mapSeed)}</div>`;
  }
  const x = `<button class="rg-x" data-region-clear aria-label="back to the near country">✕</button>`;
  if (sel.kind === "land") {
    return `<div class="rg-card small">${x}<h3>${name(sel.biome)}</h3><p>${backInCopy(backInTrips(state.seed, state.runs ?? 0, sel.biome))}.</p></div>`;
  }
  const m = (state.maps ?? []).find((mm) => mm.mapSeed === sel.mapSeed)!;
  const tier = m.tier ?? 1;
  const legal = legalActions(state);
  const inks = Object.keys(INKS).filter((inkId) => legal.some((a) => a.type === "ink" && a.mapSeed === m.mapSeed && a.inkId === inkId))
    .map((inkId) => `<button class="rg-ink" data-ink-map="${m.mapSeed}" data-ink-id="${inkId}" title="apply ${name(inkId)}: rolls an affix from its domain onto this map">${name(inkId)}</button>`).join("");
  return `<div class="rg-card">${x}<h3>${name(m.biomeId)}${heldMapSuffix(m)}</h3><div class="sub">${ringWord(tier)} · tier ${ROMAN[tier] ?? tier}</div>
    ${hintChips(mapHintIds(m), m.studied ?? 0)}
    <div class="go">${studyControl(state, m)}${inks}${GO_BUTTON(m.mapSeed)}</div></div>`;
}

/** The region map, full screen (it replaces the map board as the chooser). */
export function regionView(state: GameState, prep: string | null): string {
  ensureStyle();
  const sel = regionSelection(state, prep);
  return `<div class="region-screen" data-region>
    <div class="rg-chart">
      <button class="rg-back" data-panel-close>← the square</button>
      ${chartSvg(state, sel)}
    </div>
    <div class="rg-cardwrap">${cardHtml(state, sel)}</div>
    ${panelHtml(state, sel)}
  </div>`;
}

/** Wire the chart's own picks (lands, scraps, panel rows); everything else is main.ts's. */
export function mountRegion(root: HTMLElement, redraw: () => void): void {
  if (!root.querySelector("[data-region]")) { region.sel = null; return; }
  const pick = (s: Sel | null) => { region.sel = s; redraw(); };
  root.querySelectorAll<Element>("[data-region-map]").forEach((el) => el.addEventListener("click", () => pick({ kind: "map", mapSeed: (el as HTMLElement).dataset.regionMap ?? el.getAttribute("data-region-map")! })));
  root.querySelectorAll<Element>("[data-region-land]").forEach((el) => el.addEventListener("click", () => {
    const b = el.getAttribute("data-region-land") as BiomeId;
    pick(el.classList.contains("lit") ? { kind: "local" } : { kind: "land", biome: b });
  }));
  root.querySelectorAll<HTMLElement>("[data-region-clear]").forEach((el) => el.onclick = () => pick({ kind: "local" }));
}

// --- style (kept with the view so the shared index.html stays untouched) ---------------
let styled = false;
function ensureStyle(): void {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const el = document.createElement("style");
  el.textContent = REGION_CSS;
  document.head.appendChild(el);
}
const REGION_CSS = `
.region-screen, .region-screen * { box-sizing: border-box; }
/* the card sits under the chart (tall screens) or atop the side panel (short ones): it never covers the chart */
.region-screen { position: fixed; inset: 0; z-index: 3000; display: grid; grid-template-columns: minmax(0, 1fr) clamp(220px, 32vw, 300px); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "chart panel" "card panel"; background: #2a2118; color: var(--ink); }
.rg-chart { grid-area: chart; min-width: 0; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: radial-gradient(ellipse at 50% 45%, rgba(255,248,225,0.55), rgba(255,248,225,0) 60%), radial-gradient(ellipse at 50% 50%, #e7d7b0 0%, #d6c296 62%, #b89c68 100%); }
.rg-chart::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 60px rgba(70, 45, 15, 0.55); }
.rg-svg { width: 100%; height: 100%; display: block; }
.rg-back { position: absolute; z-index: 2; top: 8px; left: 8px; font: 600 14px "Alegreya SC", Georgia, serif; color: var(--ink-head); background: rgba(217, 201, 163, 0.85); border: 1px solid #4a3a26; border-radius: 3px; padding: 3px 9px; }
.rg-back:hover { color: var(--ink); border-color: var(--ink-head); }
.rg-land { cursor: pointer; stroke: none; }
.rg-land.lit { filter: url(#rg-litwash); stroke: #3b2a18; stroke-width: 0.7; }
.rg-land.unlit { filter: url(#rg-dim); opacity: 0.42; }
.rg-land.unlit:hover, .rg-land.unlit.on { opacity: 0.8; }
.rg-far { fill: url(#rg-hatch); stroke: #5a4326; stroke-width: 0.25; stroke-dasharray: 0.6 1.4; opacity: 0.8; }
.rg-ring { fill: none; stroke: #3b2a18; stroke-width: 0.5; stroke-dasharray: 2.2 1.2; }
.rg-ring.near { stroke-width: 0.8; stroke-dasharray: none; }
.rg-ringword { font: italic 600 4.2px "Crimson Pro", Georgia, serif; fill: #3b2a18; text-anchor: middle; pointer-events: none; letter-spacing: 0.03em; paint-order: stroke; stroke: #e2d1a8; stroke-width: 1px; }
.rg-ringword.near { fill: #2a2118; paint-order: stroke; stroke: #e7d7b0; stroke-width: 1.1px; stroke-opacity: 0.85; }
.rg-road-case { fill: none; stroke: #efe2bf; stroke-width: 2.6; stroke-linecap: round; opacity: 0.8; pointer-events: none; }
.rg-road { fill: none; stroke: #2a2118; stroke-width: 1.3; stroke-dasharray: 0.2 2.3; stroke-linecap: round; pointer-events: none; }
.rg-scrap { cursor: pointer; }
.rg-scrap polygon { stroke: #3b2a18; stroke-width: 0.6; filter: url(#rg-lift); }
.rg-scrap:hover polygon, .rg-scrap.on polygon { filter: url(#rg-lift-on); }
.rg-scrap.on polygon { stroke-width: 0.8; }
.rg-sel { fill: none; stroke: #a8802e; stroke-width: 1; stroke-dasharray: 5 1.5 9 2; }
.rg-seal { fill: #c9a55a; stroke: #5a3b12; stroke-width: 0.45; }
.rg-scrap.on .rg-seal { fill: #e8c46a; }
.rg-townbg { fill: #d9c9a3; }
.rg-townrim { fill: none; stroke: #3b2a18; stroke-width: 0.8; }
.rg-town image { filter: sepia(0.35); }
.rg-compass .ns { fill: #3b2a18; } .rg-compass .ew { fill: #7a5f3a; }
.rg-compass text { font: 700 5px "Cinzel", Georgia, serif; fill: #3b2a18; }
.rg-panel { grid-area: panel; min-height: 0; overflow-y: auto; padding: 10px 10px 14px; background: linear-gradient(135deg, var(--parch), var(--parch-2)); color: var(--ink); border-left: 3px double #4a3a26; box-shadow: inset 0 0 18px rgba(60, 40, 15, 0.45); }
.rg-panel h2 { margin: 2px 0 8px; font: 700 15px "Cinzel", Georgia, serif; color: var(--ink-head); letter-spacing: 0.05em; text-transform: none; }
.rg-empty { font-size: 14px; color: var(--ink-dim); font-style: italic; margin: 4px 0; }
.rg-tierhead { display: flex; align-items: center; gap: 6px; margin: 8px 0 3px; font: 600 13px "Alegreya SC", Georgia, serif; color: var(--ink-head); text-transform: capitalize; }
.rg-tierhead .rule { flex: 1; height: 1px; background: var(--ink-rule); }
.rg-row { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--ink-rule); border-radius: 0; padding: 4px 5px; color: var(--ink); font: 15px "Crimson Pro", Georgia, serif; cursor: pointer; }
.rg-row:hover { background: rgba(90, 59, 18, 0.08); color: var(--ink); }
.rg-row.on { background: rgba(201, 165, 90, 0.32); box-shadow: inset 3px 0 0 #a8802e; }
.rg-row .thumb { width: 26px; height: 26px; flex: none; border-radius: 3px; box-shadow: 0 0 0 1.5px #4a3a26; filter: saturate(0.75); }
.rg-row.on .thumb { filter: none; }
.rg-row .nm { flex: 1; min-width: 0; line-height: 1.15; }
.rg-row .nm .muted { color: var(--ink-dim); font-style: italic; }
.rg-row .dots { flex: none; font-size: 12px; letter-spacing: 1px; color: var(--ink-dim); }
.rg-cardwrap { grid-area: card; min-width: 0; display: flex; justify-content: center; padding: 0 10px 10px; background: #c9b083; box-shadow: inset 0 -30px 40px -20px rgba(70, 45, 15, 0.45); }
.rg-card { position: relative; width: min(380px, 100%); background: linear-gradient(135deg, var(--parch), var(--parch-2)); color: var(--ink); border: 2px solid #4a3a26; border-radius: 6px; box-shadow: inset 0 0 18px rgba(60, 40, 15, 0.45), 0 6px 18px #000a; padding: 8px 12px 10px; }
.rg-card.local { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.rg-card.local .sub { white-space: nowrap; }
.rg-card.local .sub { margin-bottom: 0; }
.rg-card.small { padding: 6px 30px 6px 12px; }
.rg-card h3 { margin: 0; font: 700 17px "Cinzel", Georgia, serif; color: var(--ink-head); }
.rg-card h3 .muted { font: italic 400 15px "Crimson Pro", Georgia, serif; color: var(--ink-dim); }
.rg-card .sub { font: 500 13px "Alegreya SC", serif; color: var(--ink-dim); margin-bottom: 4px; }
.rg-card p { margin: 3px 0 0; font-size: 15px; }
.rg-card .hintchips { margin: 4px 0; }
.rg-card .hintchip { background: transparent; color: var(--ink); border-color: var(--ink-rule); font-size: 13px; }
.rg-card .hintchip.sealed { color: var(--ink-dim); border-style: dashed; }
.rg-card .go { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 6px; }
.rg-card .go button:not(.rg-go) { background: transparent; color: var(--ink-head); border: 1px solid var(--ink-rule); font-size: 13px; padding: 3px 8px; }
.rg-card .go button.study.unaffordable { color: var(--miss-ink); border-color: var(--miss-ink); }
.rg-card .studied-done { font-size: 13px; color: var(--ink-dim); }
.rg-go { flex: none; white-space: nowrap; font: 700 15px "Cinzel", Georgia, serif; background: #2a2214; color: #e8c46a; border: 1px solid #c9a55a; border-radius: 4px; padding: 5px 14px; }
.rg-go:hover { color: #fff3c4; }
.rg-x { position: absolute; right: 4px; top: 2px; background: transparent; border: 0; color: var(--ink-head); font-size: 16px; padding: 2px 6px; }
@media (max-height: 500px) and (min-aspect-ratio: 1/1) {
  .region-screen { grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "chart card" "chart panel"; }
  .rg-cardwrap { padding: 8px 8px 6px; background: linear-gradient(135deg, var(--parch), var(--parch-2)); border-left: 3px double #4a3a26; box-shadow: none; }
  .rg-card { box-shadow: 0 2px 6px #0005; padding: 5px 10px 7px; }
  .rg-card.local { flex-wrap: wrap; gap: 4px 10px; }
  .rg-card h3 { font-size: 15px; }
  .rg-panel h2 { margin-bottom: 4px; }
}
@media (max-aspect-ratio: 1/1) {
  .region-screen { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto auto; grid-template-areas: "chart" "card" "panel"; }
  .rg-panel { max-height: 36vh; border-left: 0; border-top: 3px double #4a3a26; }
}
`;
