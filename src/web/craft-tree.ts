// 675 (D104) web pass: the crafting TREE (the workshop) and the RESEARCH TABLE.
// Spec: docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
//
// o9vr: the workshop is a Civ-style tech tree — tier columns left to right, one node per
// OUTPUT (its known recipes are the node's "paths"), orthogonal item → item connectors
// (layout: tree-layout.ts, pure), a make-now strip and a parchment detail tray that
// crafts N at a time. Hidden recipes never render — each tier shows one fog node
// ("+7 undiscovered").
//
// Everything a node says is read off the engine: recipeKnowledge (status/tier/inputs),
// legalActions (craftable), speculative reduce (how many) and whyNot (gates). The web
// decides nothing.
import { recipeKnowledge } from "../engine/knowledge";
import type { RecipeKnowledge } from "../engine/knowledge";
import { researchStatus } from "../engine/research";
import { recipeOutputQty } from "../engine/craft";
import { legalActions, whyNot } from "../sim/legal";
import { reduce } from "../engine/reduce";
import { slotOf } from "../engine/catalog";
import { RECIPE, RESEARCH_SEARCHES_PER_INK } from "../data/constants";
import { name, describe, weaponHint, logisticsEffect, enhancementHint, recipeGateHint, townRecipeIds, fieldRecipeIds, fieldRecipeNote, rejectCopy } from "../render/render";
import type { GameState, RejectionReason } from "../engine/types";
import { layoutGraph, routeD } from "./tree-layout";
import type { GEdge, GNode, GraphLayout } from "./tree-layout";
import { ic } from "./icons";

// ---------------------------------------------------------------------------
// Pure layout
// ---------------------------------------------------------------------------

export type TreeCard = { output: string; tier: number; paths: RecipeKnowledge[] };
export type TreeTier = { tier: number; cards: TreeCard[]; undiscovered: number };
export type TreeLayout = { tiers: TreeTier[]; field: { cards: TreeCard[]; undiscovered: number } };

// Group visible recipes into one card per output; a card sits at the lowest tier of
// its visible paths. Within a tier: craftable cards first, then known, then
// research-only, otherwise catalog order (stable, so the tree doesn't jump about).
function cardsOf(rows: RecipeKnowledge[], craftable: ReadonlySet<string>): TreeCard[] {
  const byOut = new Map<string, RecipeKnowledge[]>();
  for (const r of rows) (byOut.get(r.output) ?? byOut.set(r.output, []).get(r.output)!).push(r);
  const cards = [...byOut].map(([output, paths]) => ({ output, tier: Math.min(...paths.map((p) => p.tier)), paths }));
  const rank = (c: TreeCard) => (c.paths.some((p) => craftable.has(p.recipeId)) ? 0 : c.paths.some((p) => p.status === "known") ? 1 : 2);
  return cards.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

/** The tree as data: town recipes in tier rows (ascending — the view puts Tier 1 at the
 *  bottom) with undiscovered counts, and the field recipes. `craftable` = recipe ids the
 *  reducer would accept right now (legalActions), only used for ordering. */
export function treeLayout(state: GameState, craftable: ReadonlySet<string> = new Set()): TreeLayout {
  const know = recipeKnowledge(state);
  const town = new Set(townRecipeIds(state.stations ?? []));
  const field = new Set(fieldRecipeIds());
  const townRows = know.filter((r) => town.has(r.recipeId));
  const maxTier = Math.max(1, ...townRows.map((r) => r.tier));
  const visible = townRows.filter((r) => r.status !== "hidden");
  const cards = cardsOf(visible, craftable);
  const tiers: TreeTier[] = [];
  for (let t = 1; t <= maxTier; t++) {
    tiers.push({ tier: t, cards: cards.filter((c) => c.tier === t), undiscovered: townRows.filter((r) => r.tier === t && r.status === "hidden").length });
  }
  const fieldRows = know.filter((r) => field.has(r.recipeId));
  return {
    tiers,
    field: { cards: cardsOf(fieldRows.filter((r) => r.status !== "hidden"), craftable), undiscovered: fieldRows.filter((r) => r.status === "hidden").length },
  };
}

export type Connector = { from: string; to: string; input: string }; // from = producer card's output; to = consumer card's output
/** Connector pairs: an input chip on card `to` ← the visible card `from` that makes it. */
export function connectorPairs(layout: TreeLayout): Connector[] {
  const cards = layout.tiers.flatMap((t) => t.cards);
  const visible = new Set(cards.map((c) => c.output));
  const out: Connector[] = [];
  for (const c of cards) {
    const inputs = new Set(c.paths.flatMap((p) => p.inputs.map((i) => i.defId)));
    for (const input of inputs) if (input !== c.output && visible.has(input)) out.push({ from: input, to: c.output, input });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// An input chip: held before = icon + name; not held yet but named (by research, by a
// recipe you know — a starter's flint — or made by a card you can see) = greyed with its
// name; never heard of = "?".
function chip(i: RecipeKnowledge["inputs"][number], cardOut: string, visible: ReadonlySet<string>, pathKnown: boolean): string {
  const link = visible.has(i.defId) && i.defId !== cardOut ? ` data-link="${i.defId}"` : "";
  if (i.status === "seen") return `<span class="ct-chip" data-in="${i.defId}"${link} title="${esc(describe(i.defId))}">${ic(i.defId, 18)}<span class="n">${i.qty} ${name(i.defId)}</span></span>`;
  if (i.status === "heard" || pathKnown || visible.has(i.defId)) return `<span class="ct-chip heard" data-in="${i.defId}"${link} title="${name(i.defId)} — you've heard of it, but never held one">${ic(i.defId, 18)}<span class="n">${i.qty} ${name(i.defId)}</span></span>`;
  return `<span class="ct-chip unknown" title="something you've never come across"><span class="pk-ic none" style="width:18px;height:18px">?</span><span class="n">${i.qty} ???</span></span>`;
}

type CardCtx = { state: GameState; craftable: ReadonlySet<string>; visible: ReadonlySet<string>; townTools: string[]; field?: boolean };

function cardHtml(c: TreeCard, x: CardCtx): string {
  const qty = recipeOutputQty(RECIPE[c.paths[0]!.recipeId]!, x.townTools);
  const have = x.state.bank.filter((b) => b.defId === c.output).reduce((n, b) => n + b.qty, 0);
  const anyCan = !x.field && c.paths.some((p) => x.craftable.has(p.recipeId));
  const researched = c.paths.every((p) => p.status === "revealed");
  const hint = weaponHint(c.output) ?? logisticsEffect(c.output) ?? enhancementHint(c.output);
  const paths = c.paths.map((p) => {
    const can = !x.field && x.craftable.has(p.recipeId);
    // gate-legibility: a known recipe the reducer refuses on a station/tool gate names it (whyNot, never re-derived).
    const why = can || x.field ? null : whyNot(x.state, { type: "craft", recipeId: p.recipeId });
    const gate = why === "missing-station" || why === "missing-tool" ? recipeGateHint(p.recipeId) : null;
    const tail = x.field ? `<span class="ct-note">${fieldRecipeNote(p.recipeId)}</span>`
      : can ? `<button class="craftbtn" data-craft="${p.recipeId}">Craft</button>`
      : gate ? `<span class="ct-gate">🔒 ${gate}</span>` : "";
    return `<div class="ct-path${can ? "" : " locked"}${p.status === "revealed" ? " rev" : ""}" data-recipe="${p.recipeId}"><span class="ct-chips">${p.inputs.map((i) => chip(i, c.output, x.visible, p.status === "known")).join("")}</span>${tail}</div>`;
  }).join("");
  return `<div class="ct-card${anyCan ? " can" : " dim"}${researched ? " researched" : ""}" data-card="${c.output}" title="${esc(describe(c.output))}">
    <div class="ct-head">${ic(c.output, 28)}<span class="ct-nm"><b>${name(c.output)}</b>${qty > 1 ? ` <span class="ct-q">×${qty}</span>` : ""}${have ? `<span class="have"> · have ${have}</span>` : ""}</span>${researched ? `<span class="ct-mark" title="revealed at the research table">researched</span>` : ""}</div>
    ${hint ? `<div class="ct-hint">${hint}</div>` : ""}
    ${paths}
  </div>`;
}

function ctx(state: GameState, layout: TreeLayout, craftable: ReadonlySet<string>): CardCtx {
  return {
    state,
    craftable,
    visible: new Set(layout.tiers.flatMap((t) => t.cards.map((c) => c.output))),
    townTools: [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools],
  };
}
const craftableSet = (state: GameState): Set<string> =>
  new Set(legalActions(state).flatMap((a) => (a.type === "craft" ? [a.recipeId] : [])));

const undiscovered = (n: number, what = "recipe") =>
  n ? `<span class="ct-undisc" title="hold the ingredients, or ask at the research table">+ ${n} undiscovered${what === "recipe" ? "" : ` ${what}`}</span>` : "";

// ---------------------------------------------------------------------------
// o9vr: the Civ-style tree — graph model (pure) + the workshop screen (HTML)
// ---------------------------------------------------------------------------

/** Item → item edges between visible cards: an ingredient that is itself on the tree
 *  ("in"), or the tool / station a recipe needs (dashed "tool"). Raw materials are never
 *  nodes, so there are no material → recipe lines. */
export function treeEdges(layout: TreeLayout): GEdge[] {
  const cards = layout.tiers.flatMap((t) => t.cards);
  const visible = new Set(cards.map((c) => c.output));
  const out: GEdge[] = [];
  for (const c of cards) {
    const seen = new Set<string>();
    for (const p of c.paths) for (const i of p.inputs) {
      if (i.defId !== c.output && visible.has(i.defId) && !seen.has(i.defId)) { seen.add(i.defId); out.push({ s: i.defId, t: c.output, kind: "in" }); }
    }
    for (const p of c.paths) {
      const req = RECIPE[p.recipeId]?.requires;
      for (const g of [...(req?.station ? [req.station] : []), ...(req?.tools ?? [])]) {
        if (g !== c.output && visible.has(g) && !seen.has(g)) { seen.add(g); out.push({ s: g, t: c.output, kind: "tool" }); }
      }
    }
  }
  return out;
}

// Kinds sit together down a column: tools, weapons, armour, food & potions, carrying, the rest.
const LANES: [number, readonly string[]][] = [[0, ["tool"]], [1, ["weapon", "enhancement", "quiver", "ammo", "flask", "battle-item"]], [2, ["helmet", "chest", "legs", "boots", "gloves"]], [3, ["food", "potion"]], [4, ["backpack", "transport", "panniers"]]];
export const laneOf = (defId: string): number => { const s = slotOf(defId); return LANES.find(([, ss]) => s && ss.includes(s))?.[0] ?? 5; };

const MAKE_CAP = 99;
/** How many times in a row the reducer would accept this craft (speculative reduce,
 *  D29 — never arithmetic over the catalog). 0 when it's refused now. */
export function makeable(state: GameState, recipeId: string, cap = MAKE_CAP): number {
  let s = state, n = 0;
  while (n < cap) {
    const r = reduce(s, { type: "craft", recipeId });
    if (r.events.some((e) => e.type === "action-rejected")) break;
    s = r.state; n++;
  }
  return n;
}

export type NodeState = "can" | "short" | "gated";
export type TreeNodeInfo = { card: TreeCard; st: NodeState; make: number; pathMake: number[]; why: (RejectionReason | null)[] };
export type TreeModel = { layout: TreeLayout; info: Map<string, TreeNodeInfo>; edges: GEdge[]; graph: GraphLayout; held: Map<string, number>; anyHidden: boolean };

const isGate = (w: RejectionReason | null) => w === "missing-station" || w === "missing-tool";

/** Everything the workshop draws, read off the engine: the fogged cards, each card's
 *  state (craftable per legalActions, gate per whyNot) and the pure graph layout. */
export function treeModel(state: GameState): TreeModel {
  const craftable = craftableSet(state);
  const layout = treeLayout(state, craftable);
  const cards = layout.tiers.flatMap((t) => t.cards);
  const info = new Map<string, TreeNodeInfo>();
  for (const c of cards) {
    const pathMake = c.paths.map((p) => (craftable.has(p.recipeId) ? makeable(state, p.recipeId) : 0));
    const why = c.paths.map((p, i) => (pathMake[i] ? null : whyNot(state, { type: "craft", recipeId: p.recipeId })));
    const make = Math.max(0, ...pathMake);
    const st: NodeState = make > 0 ? "can" : why.every(isGate) ? "gated" : "short";
    info.set(c.output, { card: c, st, make, pathMake, why });
  }
  const edges = treeEdges(layout);
  const ord = new Map<string, number>();
  Object.keys(RECIPE).forEach((id, i) => { const o = RECIPE[id]!.output.defId; if (!ord.has(o)) ord.set(o, i); });
  const nodes: GNode[] = cards.map((c) => ({ id: c.output, tier: c.tier, lane: laneOf(c.output), ord: ord.get(c.output) ?? 0 }));
  const hidden: Record<number, number> = {};
  for (const t of layout.tiers) if (t.undiscovered) hidden[t.tier] = t.undiscovered;
  const held = new Map<string, number>();
  for (const b of state.bank) held.set(b.defId, (held.get(b.defId) ?? 0) + b.qty);
  return { layout, info, edges, graph: layoutGraph(nodes, edges, hidden), held, anyHidden: layout.tiers.some((t) => t.undiscovered > 0) };
}

// --- view state (survives the app's full re-render after every action) ---
export type TreeFilter = "all" | "can" | "field";
export type TreeUi = { sel: string | null; filter: TreeFilter; mat: string | null; matsOpen: boolean; qty: number; collapsed: boolean; path: Record<string, number>; scroll: { l: number; t: number } | null };
export const freshTreeUi = (): TreeUi => ({ sel: null, filter: "all", mat: null, matsOpen: false, qty: 1, collapsed: false, path: {}, scroll: null });
export const treeUi: TreeUi = freshTreeUi();

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
const pathIdx = (ui: TreeUi, n: TreeNodeInfo): number => {
  const chosen = ui.path[n.card.output];
  if (chosen !== undefined && chosen < n.card.paths.length) return chosen;
  const can = n.pathMake.findIndex((m) => m > 0);
  return can >= 0 ? can : 0;
};
// the ancestors of a node over every tree edge (its whole recipe chain)
function ancestors(edges: GEdge[], id: string): Set<string> {
  const preds = new Map<string, string[]>();
  for (const e of edges) (preds.get(e.t) ?? preds.set(e.t, []).get(e.t)!).push(e.s);
  const out = new Set<string>();
  const walk = (x: string) => { for (const p of preds.get(x) ?? []) if (!out.has(p)) { out.add(p); walk(p); } };
  walk(id);
  return out;
}

// An input is named once held, heard of, part of a recipe you know (a starter's flint) or
// made by a node on the tree; otherwise it's a "?" — something you've never come across.
const named = (m: TreeModel, p: RecipeKnowledge, i: RecipeKnowledge["inputs"][number]): boolean =>
  i.status !== "unknown" || p.status === "known" || m.info.has(i.defId) || (m.held.get(i.defId) ?? 0) > 0;

function nodeHtml(m: TreeModel, ui: TreeUi, n: TreeNodeInfo, hl: { anc: Set<string>; kids: Set<string>; mat: Set<string> | null }): string {
  const c = n.card, b = m.graph.nodes[c.output]!;
  const p = c.paths[pathIdx(ui, n)]!;
  const badge = n.st === "can" ? `×${n.make}` : n.st === "gated" ? "🔒" : "short";
  let cls = `ct-node ${n.st}${c.paths.every((q) => q.status === "revealed") ? " revealed" : ""}`;
  if (ui.filter === "can" && n.st !== "can") cls += " dim";
  if (ui.sel) cls += c.output === ui.sel ? " sel" : hl.anc.has(c.output) ? " hl-in" : hl.kids.has(c.output) ? " hl-out" : " quiet";
  if (hl.mat?.has(c.output)) cls += " matuse";
  const mini = p.inputs.map((i) => !named(m, p, i)
    ? `<span class="u">?</span>${i.qty}`
    : `${ic(i.defId, 14)}<span${(m.held.get(i.defId) ?? 0) >= i.qty ? "" : ` class="lack"`}>${i.qty}</span>`).join(" ");
  return `<button class="${cls}" data-ct-node="${c.output}" data-recipes="${c.paths.map((q) => q.recipeId).join(" ")}" style="left:${b.x}px;top:${b.y}px" title="${esc(describe(c.output))}">
    <span class="ct-ic">${ic(c.output, 32)}</span><span class="ct-tx"><span class="ct-nm">${name(c.output)}</span><span class="ct-mini">${mini}</span></span><span class="ct-badge">${badge}</span></button>`;
}

function trayHtml(state: GameState, m: TreeModel, ui: TreeUi): string {
  const n = ui.sel ? m.info.get(ui.sel) : undefined;
  if (!n) return "";
  const c = n.card, pi = pathIdx(ui, n), p = c.paths[pi]!;
  const make = n.pathMake[pi] ?? 0, why = n.why[pi] ?? null;
  const q = Math.max(1, Math.min(ui.qty, make || 1));
  const have = m.held.get(c.output) ?? 0;
  const outQty = recipeOutputQty(RECIPE[p.recipeId]!, [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools]);
  const hint = weaponHint(c.output) ?? logisticsEffect(c.output) ?? enhancementHint(c.output);
  const paths = c.paths.length > 1 ? `<div class="ct-paths"><span class="muted small">${c.paths.length} ways to make it:</span>${c.paths.map((x, i) => `<button class="ct-pathbtn${i === pi ? " on" : ""}" data-ct-path="${i}">${x.inputs.map((inp) => `${ic(inp.defId, 16)}${inp.qty}`).join(" ")}${n.pathMake[i] ? ` <b>×${n.pathMake[i]}</b>` : ""}</button>`).join("")}</div>` : "";
  const ings = p.inputs.map((i) => {
    const h = m.held.get(i.defId) ?? 0, need = i.qty * q, ok = h >= need;
    if (!named(m, p, i)) return `<div class="ct-ing unk"><span class="ct-iic">?</span><span><span class="q">${i.qty}×</span> ??? <i>— something you haven't found</i></span><span class="have no">need ${need}</span></div>`;
    return `<div class="ct-ing"><span class="ct-iic">${ic(i.defId, 24)}</span><span><span class="q">${i.qty}×</span> ${name(i.defId)}</span><span class="have ${ok ? "ok" : "no"}">need ${need} · you have ${h}${ok ? " ✓" : ` · ${need - h} short`}</span></div>`;
  }).join("");
  const chipOf = (d: string) => m.info.has(d)
    ? `<button class="ct-u" data-ct-go="${d}">${ic(d, 18)}${name(d)}</button>`
    : `<span class="ct-u off">${ic(d, 18)}${name(d)}</span>`;
  const req = RECIPE[p.recipeId]?.requires;
  const gates = [...(req?.station ? [req.station] : []), ...(req?.tools ?? [])];
  const gate = isGate(why) && gates.length ? `<div class="ct-gatebox">🔒 needs ${gates.map(chipOf).join(" + ")}</div>` : "";
  const uses = m.edges.filter((e) => e.s === c.output);
  const usesHtml = `<h3>Used in</h3><div class="ct-uses">${uses.map((e) => `<button class="ct-u" data-ct-go="${e.t}">${ic(e.t, 18)}${name(e.t)}${e.kind === "tool" ? " <i>(as the tool)</i>" : ""}</button>`).join("")}${m.anyHidden ? `<span class="ct-u fog">+ more you haven't found</span>` : uses.length ? "" : `<span class="ct-u fog">nothing on the tree yet</span>`}</div>`;
  // the costs above already say what is short; any other refusal (already built, …) is spelled out
  const refusal = !make && why && !isGate(why) && why !== "insufficient-materials" ? `<div class="ct-why">${esc(rejectCopy(why, p.recipeId))}</div>` : "";
  return `<aside class="ct-tray${ui.collapsed ? " collapsed" : ""}" data-ct-tray>
    <div class="ct-grab" data-ct-grab title="slide down to tuck away"></div>
    <div class="ct-minibar" data-ct-expand>${ic(c.output, 26)}<span class="t">${name(c.output)}</span><span class="c">can make <b>${make}</b> ▴</span></div>
    <button class="ct-x" data-ct-deselect title="deselect" aria-label="deselect">✕</button>
    <div class="ct-scroll">
      <div class="ct-top"><span class="ct-big">${ic(c.output, 48)}</span><div><h2>${name(c.output)}${outQty > 1 ? ` ×${outQty}` : ""}</h2>
        <div class="ct-tag">Tier ${c.tier} · ${p.status === "revealed" ? `<span class="rv">found at the research table</span>` : "known"} · you have ${have}</div></div></div>
      <p class="ct-desc">${esc(describe(c.output))}${hint && !describe(c.output).includes(hint) ? ` — ${hint}` : ""}</p>
      ${paths}
      <h3>Costs${q > 1 ? ` (×${q})` : " (each)"}</h3>${ings}${gate}${refusal}${usesHtml}
    </div>
    <div class="ct-craftbar" data-recipe="${p.recipeId}">
      <span class="cm${make ? "" : " zero"}">Can make <b>${make}</b></span>
      ${make > 1 ? `<span class="ct-step"><button data-ct-q="-1" aria-label="one fewer">−</button><span>${q}</span><button data-ct-q="1" aria-label="one more">+</button><button class="max" data-ct-q="max">max</button></span>` : ""}
      <button class="ct-go" data-ct-craft="${p.recipeId}" data-n="${q}" data-max="${make}"${make ? "" : " disabled"}>Craft${q > 1 ? ` ${q}` : ""}</button>
    </div>
  </aside>`;
}

function treeBodyHtml(state: GameState, m: TreeModel, ui: TreeUi): string {
  if (ui.filter === "field") {
    const x = ctx(state, m.layout, new Set());
    const f = m.layout.field;
    return `<div class="ct-fieldview"><div class="ct-sub muted small">Made out on an expedition, not in town — from the bag's Craft tab.</div>
      <div class="ct-row ct-field">${f.cards.map((c) => cardHtml(c, { ...x, field: true })).join("")}${f.cards.length ? "" : `<span class="muted small">none known yet</span>`}${undiscovered(f.undiscovered)}</div></div>`;
  }
  const g = m.graph;
  const anc = ui.sel ? ancestors(m.edges, ui.sel) : new Set<string>();
  const kids = new Set(ui.sel ? m.edges.filter((e) => e.s === ui.sel).map((e) => e.t) : []);
  const matUsers = ui.mat ? new Set([...m.info.values()].filter((n) => n.card.paths.some((p) => p.inputs.some((i) => i.defId === ui.mat))).map((n) => n.card.output)) : null;
  const top = ui.scroll?.t ?? 0;
  let h = "";
  g.tiers.forEach((t, i) => {
    h += `<div class="ct-era" style="left:${t.x}px;width:${t.w}px;transform:translateY(${top}px)">Tier ${ROMAN[t.tier] ?? t.tier}<small>${t.known} known · ${t.hidden} hidden</small></div>`;
    if (i) h += `<div class="ct-colband" style="left:${t.x}px;height:${g.H}px"></div>`;
  });
  // a path is "in" when it feeds the selection (directly or up its chain), "out" when it leaves it
  const edgeCls = (k: string): "in" | "out" | null => {
    const [s, t] = k.split(">") as [string, string];
    if (!ui.sel) return null;
    if (t === ui.sel || (anc.has(t) && anc.has(s))) return "in";
    return s === ui.sel ? "out" : null;
  };
  const parts = g.routes.map((r) => {
    const cl = r.edges.map(edgeCls);
    const hot = cl.includes("in") ? "in" : cl.includes("out") ? "out" : null;
    return { r, hot };
  }).sort((a, b) => (a.hot ? 1 : 0) - (b.hot ? 1 : 0)); // cold first, lit on top
  const svg = `<svg class="ct-links" width="${g.W}" height="${g.H}" aria-hidden="true">${parts.map(({ r, hot }) => `<path class="k-${r.kind}${hot ? ` ${hot}` : ui.sel ? " faded" : ""}" data-edges="${r.edges.join(" ")}" d="${routeD(r)}"/>`).join("")}</svg>`;
  for (const n of m.info.values()) h += nodeHtml(m, ui, n, { anc, kids, mat: matUsers });
  for (const f of g.fogs) h += `<div class="ct-node fog" style="left:${f.x}px;top:${f.y}px" title="hold the ingredients, or ask at the research table"><span class="ct-ic">?</span><span class="ct-nm">+${f.n} undiscovered<br><small>research to find</small></span></div>`;
  return `<div class="ct-vp" data-ct-vp><div class="ct-canvas" style="width:${g.W}px;height:${g.H}px">${svg}${h}</div></div>${trayHtml(state, m, ui)}`;
}

/** The workshop screen (full-screen): header (filter, materials, make-now strip) + the
 *  tree canvas + the detail tray. `ui` is the view state (selection, filter, …). */
export function treeAppHtml(state: GameState, ui: TreeUi = treeUi): string {
  return `<div class="ct-app" data-ct-app>${treeInner(state, ui)}</div>`;
}
// one model per game state: a tap that only changes the view (select, filter, …) re-uses it
const modelCache = new WeakMap<GameState, TreeModel>();
const cachedModel = (state: GameState): TreeModel => modelCache.get(state) ?? (modelCache.set(state, treeModel(state)), modelCache.get(state)!);
export function treeInner(state: GameState, ui: TreeUi): string {
  const m = cachedModel(state);
  const can = [...m.info.values()].filter((n) => n.st === "can");
  const seg = (f: TreeFilter, label: string) => `<button class="${ui.filter === f ? "on" : ""}" data-ct-filter="${f}">${label}</button>`;
  const now = `<div class="ct-now"><span class="lbl">Make now:</span>${can.length ? can.map((n) => `<button class="ct-chip2${ui.sel === n.card.output ? " sel" : ""}" data-ct-go="${n.card.output}">${ic(n.card.output, 20)}${name(n.card.output)} <b>×${n.make}</b></button>`).join("") : `<span class="muted small">nothing yet — gather more</span>`}</div>`;
  // materials: what you hold that some recipe on the tree uses
  const used = new Set([...m.info.values()].flatMap((n) => n.card.paths.flatMap((p) => p.inputs.map((i) => i.defId))));
  const mats = [...m.held].filter(([d, q]) => q > 0 && used.has(d));
  const matsHtml = ui.matsOpen ? `<div class="ct-mats"><div class="ttl">Your materials <small>— tap one to light up what uses it</small></div>${mats.map(([d, q]) => `<button class="ct-mchip${ui.mat === d ? " on" : ""}" data-ct-mat="${d}">${ic(d, 20)}${name(d)} <b>${q}</b></button>`).join("") || `<span class="muted small">nothing in the bank yet</span>`}</div>` : "";
  return `<header class="ct-hdr">
      <h1>Crafting Tree</h1>
      <div class="ct-seg">${seg("all", "All known")}${seg("can", `Can make (${can.length})`)}${seg("field", "Field")}</div>
      <button class="ct-mb${ui.matsOpen ? " on" : ""}" data-ct-mats>Materials ▾</button>
      <span class="sp"></span>
      <button class="ct-close" data-tree-close title="close the workshop" aria-label="close">✕</button>
      ${now}
    </header>
    <div class="ct-body${ui.filter === "field" ? " field" : ""}">${treeBodyHtml(state, m, ui)}${matsHtml}</div>`;
}

/** The workshop (kept for the town views + tests): the full-screen crafting tree. */
export function workshopSection(state: GameState, ui: TreeUi = treeUi): string {
  return treeAppHtml(state, ui);
}

// ---------------------------------------------------------------------------
// The research table
// ---------------------------------------------------------------------------

// One search this session (persisted beside the save): the word, and what it found.
export type ResearchLogEntry = { q: string; hit?: string; known?: boolean };

export function researchStatusLine(state: GameState): string {
  const st = researchStatus(state);
  if (st.searches === 0) return "no searches left — come back from a trip, or spend an ink";
  const parts: string[] = [];
  if (st.freeLeft) parts.push(`${st.freeLeft} free search${st.freeLeft === 1 ? "" : "es"} this visit`);
  if (st.charges) parts.push(`${st.charges} bought search${st.charges === 1 ? "" : "es"} left`);
  return parts.join(" · ");
}

function resultHtml(state: GameState, last: ResearchLogEntry | null): string {
  if (!last) return "";
  if (!last.hit) {
    const line = last.known ? "You already know everything the town can tell you about that." : "Nobody in town has heard of that.";
    return `<div class="rs-result miss"><span class="rs-q">“${esc(last.q)}”</span> — ${line}</div>`;
  }
  const row = recipeKnowledge(state).find((r) => r.recipeId === last.hit);
  if (!row) return "";
  const craftable = craftableSet(state);
  const layout = treeLayout(state, craftable);
  const x = ctx(state, layout, craftable);
  const field = fieldRecipeIds().includes(row.recipeId);
  return `<div class="rs-result hit">
    <div><span class="rs-q">“${esc(last.q)}”</span> — someone in town knows how to make <b>${name(row.output)}</b>:</div>
    <div class="ct-row">${cardHtml({ output: row.output, tier: row.tier, paths: [row] }, { ...x, field })}</div>
    <button class="link rs-find" data-find-recipe="${row.recipeId}">find it in the ${field ? "field recipes" : "workshop"} →</button>
  </div>`;
}

/** The research table panel. `history` = this save's searches, newest first; `last` = the
 *  result to show (this session's latest search), or null. */
export function researchSection(state: GameState, history: ResearchLogEntry[] = [], last: ResearchLogEntry | null = null): string {
  const st = researchStatus(state);
  const none = st.searches === 0;
  const inks = st.inks.map((i) => `<button class="rs-ink" data-buy-research="${i.inkId}" title="you hold ${i.qty}">Spend 1 ${name(i.inkId)} → ${RESEARCH_SEARCHES_PER_INK} searches</button>`).join("");
  const hist = history.length ? `<div class="rs-hist"><div class="rs-hlab">Asked so far</div>${history.map((h) => `<div class="rs-hrow"><span class="rs-q">${esc(h.q)}</span> → ${h.hit ? `<button class="link" data-find-recipe="${h.hit}">${name(RECIPE[h.hit]?.output.defId ?? h.hit)}</button>` : `<span class="muted">${h.known ? "already known" : "nothing"}</span>`}</div>`).join("")}</div>` : "";
  return `<section class="research">
    <div class="rs-ledger">
      <div class="rs-title">The Research Table</div>
      <div class="rs-hint">Try a word: what do you want to make? (bag, boat, armour…)</div>
      <form class="rs-form" data-research-form>
        <input type="text" name="q" data-research-q placeholder="a word…" autocomplete="off" enterkeyhint="search" maxlength="40" />
        <button type="submit" class="craftbtn"${none ? ` disabled title="no searches left"` : ""}>Search</button>
      </form>
      <div class="rs-status${none ? " none" : ""}">${researchStatusLine(state)}</div>
      ${inks ? `<div class="rs-inks">${inks}</div>` : ""}
      ${resultHtml(state, last)}
      ${hist}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// DOM: wire the workshop after each render (pan, select, tray, craft)
// ---------------------------------------------------------------------------

export type TreeHandlers = { craft: (recipeId: string, n: number) => void; close: () => void };

let mounted: { el: HTMLElement; state: GameState } | null = null;

function rerender(): void {
  if (!mounted) return;
  mounted.el.innerHTML = treeInner(mounted.state, treeUi);
  afterPaint();
}
// restore the pan, keep the tier headers stuck to the top
function afterPaint(): void {
  const vp = mounted?.el.querySelector<HTMLElement>("[data-ct-vp]");
  if (!vp) return;
  if (treeUi.scroll) { vp.scrollLeft = treeUi.scroll.l; vp.scrollTop = treeUi.scroll.t; }
  stickEras(vp);
}
function stickEras(vp: HTMLElement): void {
  vp.querySelectorAll<HTMLElement>(".ct-era").forEach((e) => { e.style.transform = `translateY(${vp.scrollTop}px)`; });
}
// bring a node into the part of the canvas the tray leaves showing
function reveal(id: string, force: boolean): void {
  const el = mounted?.el;
  const vp = el?.querySelector<HTMLElement>("[data-ct-vp]");
  const n = el?.querySelector<HTMLElement>(`.ct-node[data-ct-node="${id}"]`);
  if (!el || !vp || !n) return;
  const tray = el.querySelector<HTMLElement>("[data-ct-tray]");
  const tb = tray?.getBoundingClientRect(), vb = vp.getBoundingClientRect();
  const side = !!tb && tb.left > vb.left + 10 && tb.top <= vb.top + 2;
  const visW = side ? tb!.left - vb.left : vp.clientWidth;
  const visH = !side && tb ? Math.max(80, tb.top - vb.top) : vp.clientHeight;
  const nx = n.offsetLeft - vp.scrollLeft, ny = n.offsetTop - vp.scrollTop;
  if (force || nx < 0 || ny < 40 || nx + n.offsetWidth > visW || ny + n.offsetHeight > visH) {
    const l = Math.max(0, n.offsetLeft - visW / 2 + n.offsetWidth / 2), t = Math.max(0, n.offsetTop - visH / 2 + 20);
    treeUi.scroll = { l, t };
    vp.scrollTo({ left: l, top: t }); // instant: a tap re-renders the canvas, which would cut a smooth scroll short
  }
}
function select(id: string | null, scroll = false): void {
  if (id !== treeUi.sel) treeUi.qty = 1;
  treeUi.sel = id;
  treeUi.collapsed = false;
  if (id && treeUi.filter === "field") treeUi.filter = "all";
  rerender();
  if (id) reveal(id, scroll);
}
const onTree = (state: GameState, id: string) => treeLayout(state).tiers.some((t) => t.cards.some((c) => c.output === id));

/** Wire the workshop (if it's on screen) after the app rendered. */
export function mountTree(root: ParentNode, state: GameState, h: TreeHandlers): void {
  const el = root.querySelector<HTMLElement>("[data-ct-app]");
  document.body.classList.toggle("ct-open", !!el);
  if (!el) { mounted = null; return; }
  mounted = { el, state };
  if (treeUi.sel && !onTree(state, treeUi.sel)) { treeUi.sel = null; rerender(); } else afterPaint();
  // pan: drag with a mouse (touch scrolls natively); a drag never counts as a tap
  let drag: { x: number; y: number; l: number; t: number; moved: number } | null = null, swallow = false;
  el.addEventListener("pointerdown", (e) => {
    const vp = (e.target as HTMLElement).closest<HTMLElement>("[data-ct-vp]");
    swallow = false;
    drag = vp ? { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop, moved: 0 } : null;
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const vp = el.querySelector<HTMLElement>("[data-ct-vp]");
    if (!vp) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 6) swallow = true;
    if (drag.moved > 6 && e.pointerType === "mouse") { vp.classList.add("dragging"); vp.scrollLeft = drag.l - dx; vp.scrollTop = drag.t - dy; }
  });
  const endDrag = () => { drag = null; el.querySelector("[data-ct-vp]")?.classList.remove("dragging"); };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("scroll", (e) => {
    const vp = e.target as HTMLElement;
    if (!vp.matches?.("[data-ct-vp]")) return;
    treeUi.scroll = { l: vp.scrollLeft, t: vp.scrollTop };
    stickEras(vp);
  }, true);
  // tray swipe: down tucks it to a slim bar, up brings it back (the highlight stays)
  let swipeY: number | null = null, swiped = false;
  el.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest("[data-ct-grab], [data-ct-expand], .ct-top")) { swipeY = e.clientY; swiped = false; } });
  el.addEventListener("pointermove", (e) => {
    if (swipeY === null) return;
    const dy = e.clientY - swipeY;
    if (Math.abs(dy) > 30) { treeUi.collapsed = dy > 0; swiped = true; swipeY = null; el.querySelector("[data-ct-tray]")?.classList.toggle("collapsed", treeUi.collapsed); }
  });
  el.addEventListener("pointerup", () => { swipeY = null; });
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (swiped) { swiped = false; return; }
    if (t.closest("[data-tree-close]")) { mounted = null; h.close(); return; }
    const f = t.closest<HTMLElement>("[data-ct-filter]");
    if (f) { treeUi.filter = f.dataset.ctFilter as TreeFilter; rerender(); return; }
    if (t.closest("[data-ct-mats]")) { treeUi.matsOpen = !treeUi.matsOpen; rerender(); return; }
    const mat = t.closest<HTMLElement>("[data-ct-mat]");
    if (mat) { treeUi.mat = treeUi.mat === mat.dataset.ctMat ? null : mat.dataset.ctMat!; if (treeUi.filter === "field") treeUi.filter = "all"; rerender(); return; }
    const tray = t.closest("[data-ct-tray]");
    if (tray && treeUi.collapsed) { treeUi.collapsed = false; tray.classList.remove("collapsed"); return; }
    if (t.closest("[data-ct-grab]")) { treeUi.collapsed = true; tray?.classList.add("collapsed"); return; }
    if (t.closest("[data-ct-deselect]")) { select(null); return; }
    const go = t.closest<HTMLElement>("[data-ct-go]");
    if (go) { select(go.dataset.ctGo!, true); return; }
    const path = t.closest<HTMLElement>("[data-ct-path]");
    if (path && treeUi.sel) { treeUi.path[treeUi.sel] = Number(path.dataset.ctPath); treeUi.qty = 1; rerender(); return; }
    const q = t.closest<HTMLElement>("[data-ct-q]");
    if (q) {
      const max = Number(el.querySelector<HTMLElement>("[data-ct-craft]")?.dataset.max) || 1;
      treeUi.qty = q.dataset.ctQ === "max" ? max : Math.min(max, Math.max(1, treeUi.qty + Number(q.dataset.ctQ)));
      rerender();
      return;
    }
    const craft = t.closest<HTMLButtonElement>("[data-ct-craft]");
    if (craft) { if (!craft.disabled) h.craft(craft.dataset.ctCraft!, Number(craft.dataset.n) || 1); return; }
    const node = t.closest<HTMLElement>(".ct-node[data-ct-node]");
    if (node) { if (!swallow) select(node.dataset.ctNode === treeUi.sel ? null : node.dataset.ctNode!); return; }
    if (treeUi.matsOpen && !t.closest(".ct-mats")) { treeUi.matsOpen = false; rerender(); } // empty ground: the selection stays
  });
}

/** Select a recipe's node, scroll it into view and flash it (research "find it →", a
 *  station plot). False when the recipe isn't on the tree (still undiscovered). */
export function focusRecipe(root: ParentNode, recipeId: string): boolean {
  const out = RECIPE[recipeId]?.output.defId;
  if (!out || !mounted || !mounted.el.isConnected) return false;
  const card = treeLayout(mounted.state).tiers.flatMap((t) => t.cards).find((c) => c.output === out && c.paths.some((p) => p.recipeId === recipeId));
  if (!card) {
    if (!fieldRecipeIds().includes(recipeId)) return false;
    treeUi.filter = "field";
    rerender();
    return !!root.querySelector(`[data-recipe="${recipeId}"]`);
  }
  treeUi.path[out] = Math.max(0, card.paths.findIndex((p) => p.recipeId === recipeId));
  select(out, true);
  const el = mounted.el.querySelector<HTMLElement>(`.ct-node[data-ct-node="${out}"]`);
  el?.classList.add("ct-flash");
  return !!el;
}
